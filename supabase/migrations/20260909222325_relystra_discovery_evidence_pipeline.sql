-- Free discovery is a separate evidence engagement; it never grants paid access.
create table public.relystra_discovery_engagements (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.nexus_companies(id) on delete cascade,
 project_id uuid references public.nexus_projects(id) on delete cascade, revision integer not null default 0,
 processing_requested boolean not null default false, lease_id uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique nulls not distinct(company_id,project_id)
);
create table public.relystra_discovery_documents (
 document_id uuid primary key references public.nexus_documents(id) on delete cascade,
 engagement_id uuid not null references public.relystra_discovery_engagements(id) on delete cascade,
 state text not null default 'uploaded' check(state in ('uploaded','parsing','parsed','failed','removed')),
 error text, parser text, text_chars integer, content_hash text, chunk_count integer not null default 0,
 chunks_processed integer not null default 0, updated_at timestamptz not null default now()
);
create table public.relystra_discovery_chunks (
 id text primary key, engagement_id uuid not null references public.relystra_discovery_engagements(id) on delete cascade,
 document_id uuid not null references public.relystra_discovery_documents(document_id) on delete cascade,
 ordinal integer not null, start_offset integer not null, end_offset integer not null, source_text text not null,
 extraction jsonb, unique(document_id,ordinal)
);
create table public.relystra_free_diagnoses (
 id uuid primary key default gen_random_uuid(),engagement_id uuid not null references public.relystra_discovery_engagements(id) on delete cascade,
 evidence_revision integer not null, version integer not null, status text not null default 'generating' check(status in ('generating','complete','failed')),
 document_ids uuid[] not null, source_ids text[] not null, report jsonb, error text, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),completed_at timestamptz, unique(engagement_id,version)
);
create table public.relystra_discovery_synthesis (
 run_id uuid primary key references public.relystra_free_diagnoses(id) on delete cascade,
 nodes jsonb not null, next_nodes jsonb not null default '[]', cursor integer not null default 0, level integer not null default 0,
 stage text not null default 'reduce' check(stage in ('reduce','report','qa')), draft jsonb
);
create table public.relystra_discovery_reviews (
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.relystra_free_diagnoses(id) on delete cascade,
 user_id uuid not null references auth.users(id),decision text not null check(decision in ('verified','correction_requested')),
 note text not null default '',created_at timestamptz not null default now()
);
create index relystra_discovery_document_engagement on public.relystra_discovery_documents(engagement_id,state);
create index relystra_discovery_chunk_engagement on public.relystra_discovery_chunks(engagement_id,document_id,ordinal);
create index relystra_free_diagnosis_engagement on public.relystra_free_diagnoses(engagement_id,version desc);

alter table public.relystra_discovery_engagements enable row level security;
alter table public.relystra_discovery_documents enable row level security;
alter table public.relystra_discovery_chunks enable row level security;
alter table public.relystra_free_diagnoses enable row level security;
alter table public.relystra_discovery_synthesis enable row level security;
alter table public.relystra_discovery_reviews enable row level security;
revoke all on public.relystra_discovery_engagements,public.relystra_discovery_documents,public.relystra_discovery_chunks,public.relystra_free_diagnoses,public.relystra_discovery_synthesis,public.relystra_discovery_reviews from public,anon,authenticated;
grant all on public.relystra_discovery_engagements,public.relystra_discovery_documents,public.relystra_discovery_chunks,public.relystra_free_diagnoses,public.relystra_discovery_synthesis,public.relystra_discovery_reviews to service_role;
-- Read/mutation projections below deliberately exclude raw text, model work and leases.
create function public.relystra_discovery_workspace(p_company_id uuid,p_project_id uuid default null,p_action text default 'view',p_document_id uuid default null,p_run_id uuid default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.relystra_discovery_engagements%rowtype; d public.nexus_documents%rowtype; r public.relystra_free_diagnoses%rowtype; added integer; result jsonb;
begin
 if auth.uid() is null or not(public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
 if p_project_id is not null and not exists(select 1 from public.nexus_projects where id=p_project_id and company_id=p_company_id) then raise exception 'Engagement/company mismatch'; end if;
 insert into public.relystra_discovery_engagements(company_id,project_id) values(p_company_id,p_project_id) on conflict do nothing;
 select * into e from public.relystra_discovery_engagements where company_id=p_company_id and project_id is not distinct from p_project_id for update;
 -- Adopt retained uploads only within this exact preparation/project context.
 insert into public.relystra_discovery_documents(document_id,engagement_id)
 select id,e.id from public.nexus_documents where company_id=p_company_id and project_id is not distinct from p_project_id and category in ('Discovery Transcript','Discovery Material')
 on conflict do nothing;
 get diagnostics added=row_count;
 if added>0 then update public.relystra_discovery_engagements set revision=revision+1,lease_id=null,lease_until=null,updated_at=now() where id=e.id returning * into e; end if;
 if p_action='attach' then
  select * into d from public.nexus_documents where id=p_document_id;
  if d.id is null or d.company_id<>p_company_id or d.project_id is distinct from p_project_id or (not public.nexus_is_platform_admin() and d.uploaded_by<>auth.uid()) then raise exception 'Document/engagement mismatch'; end if;
  insert into public.relystra_discovery_documents(document_id,engagement_id) values(d.id,e.id) on conflict do nothing;
  get diagnostics added=row_count;
  if added>0 then update public.relystra_discovery_engagements set revision=revision+1,lease_id=null,lease_until=null,updated_at=now() where id=e.id returning * into e; end if;
  if not exists(select 1 from public.relystra_discovery_documents where document_id=d.id and engagement_id=e.id and state<>'removed') then raise exception 'Document is removed or belongs to another engagement'; end if;
  update public.relystra_discovery_engagements set processing_requested=true where id=e.id;
 elsif p_action in ('remove','reprocess') then
  if not exists(select 1 from public.relystra_discovery_documents x join public.nexus_documents n on n.id=x.document_id where x.document_id=p_document_id and x.engagement_id=e.id and (public.nexus_is_platform_admin() or n.uploaded_by=auth.uid())) then raise exception 'Document access required'; end if;
  update public.relystra_discovery_documents set state=case when p_action='remove' then 'removed' else 'uploaded' end,error=null,chunks_processed=0,updated_at=now() where document_id=p_document_id;
  -- Previous run provenance is retained; current chunks are rebuilt on explicit retry.
  if p_action='reprocess' then delete from public.relystra_discovery_chunks where document_id=p_document_id; end if;
  update public.relystra_discovery_engagements set revision=revision+1,lease_id=null,lease_until=null,processing_requested=(p_action='reprocess'),updated_at=now() where id=e.id returning * into e;
 elsif p_action='process' then update public.relystra_discovery_engagements set processing_requested=true where id=e.id;
 elsif p_action='generate' then
  if not exists(select 1 from public.relystra_discovery_documents where engagement_id=e.id and state='parsed') then raise exception 'Upload and process discovery material first'; end if;
  if exists(select 1 from public.relystra_discovery_documents where engagement_id=e.id and state in ('uploaded','parsing','failed')) then raise exception 'Process, retry or remove every unresolved document before generation'; end if;
  select * into r from public.relystra_free_diagnoses where engagement_id=e.id order by version desc limit 1;
  if r.id is null or r.evidence_revision<>e.revision or r.status='failed' then
   if (select count(*) from public.relystra_free_diagnoses where engagement_id=e.id and created_at>now()-interval '1 hour')>=10 then raise exception 'Generation limit reached. Retry after one hour or contact Relystra.'; end if;
   update public.relystra_free_diagnoses set status='failed',error='Evidence changed; a new revision was requested' where engagement_id=e.id and status='generating';
   insert into public.relystra_free_diagnoses(engagement_id,evidence_revision,version,document_ids,source_ids,created_by)
   select e.id,e.revision,coalesce(r.version,0)+1,array(select document_id from public.relystra_discovery_documents where engagement_id=e.id and state='parsed' order by document_id),array(select c.id from public.relystra_discovery_chunks c join public.relystra_discovery_documents x on x.document_id=c.document_id where c.engagement_id=e.id and x.state='parsed' order by c.document_id,c.ordinal),auth.uid() returning * into r;
   insert into public.relystra_discovery_synthesis(run_id,nodes)
   select r.id,jsonb_agg(jsonb_build_object('source_ids',jsonb_build_array(c.id),'evidence',c.extraction) order by c.document_id,c.ordinal) from public.relystra_discovery_chunks c where c.id=any(r.source_ids);
  end if;
  update public.relystra_discovery_engagements set processing_requested=true where id=e.id;
 elsif p_action in ('verified','correction_requested') then
  select * into r from public.relystra_free_diagnoses where id=p_run_id and engagement_id=e.id and status='complete';
  if r.id is null or r.evidence_revision<>e.revision then raise exception 'Review the latest complete diagnosis'; end if;
  if p_action='correction_requested' and length(trim(p_note))<5 then raise exception 'Explain the missing or incorrect context'; end if;
  if length(p_note)>12000 then raise exception 'Review note is too long; upload it as a document'; end if;
  insert into public.relystra_discovery_reviews(run_id,user_id,decision,note) values(r.id,auth.uid(),p_action,p_note);
 elsif p_action not in ('view','attach','remove','reprocess','process','generate') then raise exception 'Unknown discovery action'; end if;
 -- Evidence changes invalidate running work but never erase a completed report.
 update public.relystra_free_diagnoses set status='failed',error='New evidence added or removed. Generate an updated diagnosis.' where engagement_id=e.id and status='generating' and evidence_revision<>e.revision;
 select jsonb_build_object('id',e.id,'company_id',p_company_id,'project_id',p_project_id,'revision',e.revision,
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'file_name',n.file_name,'mime_type',n.mime_type,'category',n.category,'created_at',n.created_at,'company_id',n.company_id,'project_id',n.project_id,'state',x.state,'error',x.error,'parser',x.parser,'text_chars',x.text_chars,'chunk_count',x.chunk_count,'chunks_processed',x.chunks_processed) order by n.created_at) from public.relystra_discovery_documents x join public.nexus_documents n on n.id=x.document_id where x.engagement_id=e.id),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(z) order by version desc) from (select id,version,status,evidence_revision,document_ids,source_ids,report,error,created_at,completed_at from public.relystra_free_diagnoses where engagement_id=e.id order by version desc limit 50)z),'[]'),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('run_id',v.run_id,'decision',v.decision,'note',v.note,'created_at',v.created_at) order by v.created_at) from public.relystra_discovery_reviews v join public.relystra_free_diagnoses f on f.id=v.run_id where f.engagement_id=e.id),'[]')) into result;
 return result;
end $$;
revoke all on function public.relystra_discovery_workspace(uuid,uuid,text,uuid,uuid,text) from public,anon;
grant execute on function public.relystra_discovery_workspace(uuid,uuid,text,uuid,uuid,text) to authenticated;

create function public.relystra_claim_discovery_work(p_engagement_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.relystra_discovery_engagements%rowtype; token uuid:=gen_random_uuid();
begin
 select * into e from public.relystra_discovery_engagements where (p_engagement_id is null or id=p_engagement_id) and processing_requested and (lease_until is null or lease_until<now()) order by updated_at for update skip locked limit 1;
 if e.id is null then return null; end if;
 update public.relystra_discovery_engagements set lease_id=token,lease_until=now()+interval '2 minutes',updated_at=now() where id=e.id returning * into e;
 return to_jsonb(e);
end $$;
create function public.relystra_commit_discovery_work(p_engagement_id uuid,p_lease_id uuid,p_revision integer,p_action text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.relystra_discovery_engagements%rowtype; doc uuid; run uuid; item jsonb;
begin
 select * into e from public.relystra_discovery_engagements where id=p_engagement_id for update;
 if e.id is null or e.lease_id is distinct from p_lease_id or e.revision<>p_revision or e.lease_until<now() then return false; end if;
 doc=nullif(p_payload->>'document_id','')::uuid; run=nullif(p_payload->>'run_id','')::uuid;
 if doc is not null and not exists(select 1 from public.relystra_discovery_documents where document_id=doc and engagement_id=e.id and state<>'removed') then return false; end if;
 if run is not null and not exists(select 1 from public.relystra_free_diagnoses where id=run and engagement_id=e.id and evidence_revision=e.revision and status='generating') then return false; end if;
 if p_action='parse' then
  delete from public.relystra_discovery_chunks where document_id=doc;
  for item in select value from jsonb_array_elements(p_payload->'chunks') loop
   insert into public.relystra_discovery_chunks(id,engagement_id,document_id,ordinal,start_offset,end_offset,source_text) values(item->>'id',e.id,doc,(item->>'ordinal')::integer,(item->>'start')::integer,(item->>'end')::integer,item->>'text');
  end loop;
  update public.relystra_discovery_documents set state='parsing',error=null,parser=p_payload->>'parser',text_chars=(p_payload->>'text_chars')::integer,content_hash=p_payload->>'hash',chunk_count=jsonb_array_length(p_payload->'chunks'),chunks_processed=0,updated_at=now() where document_id=doc;
 elsif p_action='extract' then
  update public.relystra_discovery_chunks set extraction=p_payload->'extraction' where id=p_payload->>'chunk_id' and document_id=doc;
  update public.relystra_discovery_documents set chunks_processed=(select count(*) from public.relystra_discovery_chunks where document_id=doc and extraction is not null),state=case when exists(select 1 from public.relystra_discovery_chunks where document_id=doc and extraction is null) then 'parsing' else 'parsed' end,updated_at=now() where document_id=doc;
 elsif p_action='synthesis' then
  update public.relystra_discovery_synthesis set nodes=p_payload->'nodes',next_nodes=coalesce(p_payload->'next_nodes','[]'),cursor=coalesce((p_payload->>'cursor')::integer,0),level=coalesce((p_payload->>'level')::integer,0),stage=p_payload->>'stage',draft=p_payload->'draft' where run_id=run;
 elsif p_action='complete' then
  update public.relystra_free_diagnoses set status='complete',report=p_payload->'report',completed_at=now(),error=null where id=run;
  -- Retain the exact extraction/provenance snapshot for historical diagnosis review.
  update public.relystra_free_diagnoses set report=report||jsonb_build_object('evidence_ledger',(select jsonb_agg(jsonb_build_object('source_id',c.id,'document_id',c.document_id,'start',c.start_offset,'end',c.end_offset,'extraction',c.extraction) order by c.document_id,c.ordinal) from public.relystra_discovery_chunks c where c.id=any(source_ids))) where id=run;
  delete from public.relystra_discovery_synthesis where run_id=run;
 elsif p_action='fail' then
  if doc is not null then update public.relystra_discovery_documents set state='failed',error=left(p_payload->>'error',1000),updated_at=now() where document_id=doc; end if;
  if run is not null then update public.relystra_free_diagnoses set status='failed',error=left(p_payload->>'error',1000) where id=run; end if;
 elsif p_action='idle' then update public.relystra_discovery_engagements set processing_requested=false where id=e.id;
 else raise exception 'Unknown processing action'; end if;
 update public.relystra_discovery_engagements set lease_id=null,lease_until=null,updated_at=now() where id=e.id;
 return true;
end $$;
revoke all on function public.relystra_claim_discovery_work(uuid),public.relystra_commit_discovery_work(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.relystra_claim_discovery_work(uuid),public.relystra_commit_discovery_work(uuid,uuid,integer,text,jsonb) to service_role;

-- Commercial terms stay administrator-owned. Link the reviewed free report without
-- asking the operator to retype or invent an already-processed transcript.
create function public.relystra_save_evidence_basic_report(p_run_id uuid,p_id uuid,p_company_id uuid,p_contact jsonb,p_report jsonb,p_approve boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.relystra_free_diagnoses%rowtype; e public.relystra_discovery_engagements%rowtype; transcript text; sections jsonb;
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 select * into r from public.relystra_free_diagnoses where id=p_run_id and status='complete';
 select * into e from public.relystra_discovery_engagements where id=r.engagement_id and company_id=p_company_id;
 if e.id is null or e.revision<>r.evidence_revision then raise exception 'Generate and review the current evidence revision'; end if;
 if p_approve and not exists(select 1 from public.relystra_discovery_reviews where run_id=r.id and decision='verified') then raise exception 'Verify the Free Diagnosis before approving the first Build'; end if;
 select string_agg(source_text,E'\n' order by document_id,ordinal) into transcript from public.relystra_discovery_chunks where id=any(r.source_ids);
 if length(transcript)>500000 then transcript:='Complete original discovery evidence is retained in engagement '||e.id::text||'; reviewed Free Diagnosis '||r.id::text||'. All '||cardinality(r.source_ids)::text||' source segments are retained with exact provenance.'; end if;
 select jsonb_object_agg(key,value) into sections from jsonb_each(r.report) where key in ('business_context','current_processes','observed_problems','key_findings','opportunity_areas','missing_information','evidence_confidence','contradictions');
 return public.relystra_save_basic_report(p_id,p_company_id,p_contact,transcript,p_report||jsonb_build_object('free_diagnosis_id',r.id,'discovery_engagement_id',e.id,'free_diagnosis',sections),p_approve);
end $$;
revoke all on function public.relystra_save_evidence_basic_report(uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.relystra_save_evidence_basic_report(uuid,uuid,uuid,jsonb,jsonb,boolean) to authenticated;

create or replace function public.relystra_basic_report_access(p_token text,p_operation text default 'view')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.nexus_discovery_requests%rowtype; item jsonb; plan public.nexus_build_plans%rowtype; op_id uuid; price integer; digest text;
begin
 if p_token !~ '^[0-9a-f]{64}$' or p_operation not in ('view','accept','decline','discuss','checkout') then raise exception 'Report unavailable'; end if;
 select * into d from public.nexus_discovery_requests where report_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and report_expires_at>now() and report_approved_at is not null for update;
 if d.id is null then raise exception 'Report unavailable'; end if;
 if p_operation in ('decline','discuss') then
  if d.initial_plan_id is not null and exists(select 1 from public.nexus_build_plans where id=d.initial_plan_id and status<>'cancelled') then raise exception 'An accepted plan already exists'; end if;
  update public.nexus_discovery_requests set report_state=case when p_operation='decline' then 'declined' else 'discussion' end where id=d.id;
  d.report_state:=case when p_operation='decline' then 'declined' else 'discussion' end;
 end if;
 if p_operation='accept' and d.initial_plan_id is null then
  item:=d.basic_report->'primary';price:=(item->>'price_cents')::integer;
  if not exists(select 1 from public.nexus_resolution_catalog where code=item->>'template_code' and active) then raise exception 'This recommendation needs administrator review'; end if;
  insert into public.nexus_opportunities(company_id,title,problem,created_by,source_discovery_id,build_spec,build_review_state,build_approved_by,build_approved_at)
   values(d.company_id,item->>'name',item->>'problem',d.report_approved_by,d.id,item||jsonb_build_object('commercial_state','commercially_ready','source','discovery'),'approved',d.report_approved_by,d.report_approved_at) returning id into op_id;
  -- Explicit allowlist: internal pricing judgment and arbitrary report properties never enter paid/client scope.
  item:=jsonb_build_object('id',op_id,'name',item->>'name','problem',item->>'problem','outcome',item->>'outcome','template_code',item->>'template_code','offer_code',item->>'offer_code',
   'scope_in',item->'scope_in','scope_out',item->'scope_out','inputs',item->'inputs','deliverables',item->'deliverables','acceptance_criteria',item->'acceptance_criteria',
   'price_cents',price,'deposit_cents',item->'deposit_cents','currency',item->>'currency','duration_min',item->'duration_min','duration_max',item->'duration_max','dependencies','[]'::jsonb,'source_discovery_id',d.id);
  digest:=md5(item::text||':'||d.id::text);
  insert into public.nexus_build_plans(company_id,purchase_kind,name,items,total_cents,deposit_cents,currency,duration_min,duration_max,duration_assumptions,snapshot_digest,created_by,source_discovery_id)
   values(d.company_id,'build_package',item->>'name',jsonb_build_array(item),price,(item->>'deposit_cents')::integer,item->>'currency',(item->>'duration_min')::integer,(item->>'duration_max')::integer,
    jsonb_build_object('unit','business_days','starts','after required inputs and brief approval; subject to the confirmed delivery queue'),digest,d.report_approved_by,d.id) returning * into plan;
  update public.nexus_discovery_requests set initial_plan_id=plan.id,report_state='accepted' where id=d.id;
  d.initial_plan_id:=plan.id;d.report_state:='accepted';
 end if;
 select * into plan from public.nexus_build_plans where id=d.initial_plan_id;
 item:=d.basic_report->'primary';
 return jsonb_build_object('id',d.id,'company_id',d.company_id,'actor_id',d.report_approved_by,'state',case when plan.status='paid' then 'paid' else d.report_state end,
  'free_diagnosis',d.basic_report->'free_diagnosis','company_name',d.company_name,'heard',d.basic_report->>'heard','bottleneck',d.basic_report->>'bottleneck',
  'primary',jsonb_build_object('name',item->>'name','outcome',item->>'outcome','scope_in',item->'scope_in','scope_out',item->'scope_out','inputs',item->'inputs','deliverables',item->'deliverables','price_cents',item->'price_cents','deposit_cents',item->'deposit_cents','currency',item->>'currency','duration_min',item->'duration_min','duration_max',item->'duration_max',
   'offer_name',(select name from public.nexus_commercial_offerings where code=item->>'offer_code')),
  'later',coalesce((select jsonb_agg(jsonb_build_object('name',v->>'name','why',v->>'why')) from jsonb_array_elements(d.basic_report->'later') v),'[]'),
  'plan_id',plan.id,'plan_status',plan.status,'invitation_queued',d.invited_user_id is not null);
end $$;

-- Retained discovery source ownership cannot drift to another company/project.
create function private.relystra_discovery_document_context_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.company_id is distinct from old.company_id or new.project_id is distinct from old.project_id or new.storage_path is distinct from old.storage_path) and exists(select 1 from public.relystra_discovery_documents where document_id=old.id) then raise exception 'Discovery source context is immutable; upload a new source into the correct engagement'; end if;
 return new;
end $$;
create trigger relystra_discovery_document_context_guard before update of company_id,project_id,storage_path on public.nexus_documents for each row execute function private.relystra_discovery_document_context_guard();
revoke all on function private.relystra_discovery_document_context_guard() from public,anon,authenticated;
