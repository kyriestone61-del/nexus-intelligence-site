begin;
alter table public.relystra_free_diagnoses add column error_code text, add column error_retryable boolean not null default false, add column request_id uuid, add column generation_metadata jsonb not null default '{}';
create unique index relystra_discovery_request_once on public.relystra_free_diagnoses(engagement_id,request_id) where request_id is not null;
create unique index relystra_discovery_one_running on public.relystra_free_diagnoses(engagement_id) where status='generating';
alter table public.relystra_discovery_engagements add column stalled_claims integer not null default 0;
create or replace function public.relystra_claim_discovery_work(p_engagement_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.relystra_discovery_engagements%rowtype; token uuid:=gen_random_uuid();
begin
 select * into e from public.relystra_discovery_engagements where (p_engagement_id is null or id=p_engagement_id) and processing_requested and (lease_until is null or lease_until<now()) order by updated_at for update skip locked limit 1;
 if e.id is null then return null; end if;
 if e.lease_until is not null and e.stalled_claims>=2 then
  update public.relystra_free_diagnoses set status='failed',error='APPLICATION_TIMEOUT',error_code='APPLICATION_TIMEOUT',error_retryable=true where engagement_id=e.id and status='generating';
  update public.relystra_discovery_documents set state='failed',error='Processing was interrupted repeatedly. Reprocess this document.' where engagement_id=e.id and state in ('uploaded','parsing');
  update public.relystra_discovery_engagements set lease_id=null,lease_until=null,processing_requested=false,stalled_claims=0,updated_at=now() where id=e.id;
  return null;
 end if;
 update public.relystra_discovery_engagements set lease_id=token,lease_until=now()+interval '2 minutes',stalled_claims=case when e.lease_until is null then 0 else stalled_claims+1 end,updated_at=now() where id=e.id returning * into e;
 return to_jsonb(e);
end $$;

-- Shared discovery input scope. Delivery artifacts and unrelated project files are excluded.
create function public.relystra_evidence_scope(p_company_id uuid,p_project_id uuid)
returns setof public.nexus_documents language sql stable security definer set search_path='' as $$
 select d.* from public.nexus_documents d
 where d.company_id=p_company_id and (d.project_id is not distinct from p_project_id or exists(
 select 1 from public.nexus_projects p join public.nexus_discovery_requests dr on dr.id=p.source_discovery_id and dr.company_id=p.company_id
 join public.relystra_discovery_engagements e on e.id::text=dr.basic_report->>'discovery_engagement_id' and e.company_id=p.company_id
 join public.relystra_discovery_documents x on x.engagement_id=e.id and x.document_id=d.id
 where p.id=p_project_id and p.company_id=p_company_id))
 and (d.category in ('Discovery Transcript','Discovery Material') or d.document_area='client_submission')
 and not exists(select 1 from public.relystra_discovery_documents x where x.document_id=d.id and x.state='removed')
$$;
revoke all on function public.relystra_evidence_scope(uuid,uuid) from public,anon,authenticated;
grant execute on function public.relystra_evidence_scope(uuid,uuid) to service_role;

-- Originals and historical reports are never removed. Identical normalized content is one logical source.
create function public.relystra_active_discovery_sources(p_engagement_id uuid)
returns table(document_id uuid,content_hash text,duplicate_of uuid) language sql stable security definer set search_path='' as $$
 select document_id,content_hash,case when document_id=first_value(document_id) over w then null else first_value(document_id) over w end
 from public.relystra_discovery_documents where engagement_id=p_engagement_id and state='parsed'
 window w as (partition by coalesce(content_hash,document_id::text) order by document_id)
$$;
revoke all on function public.relystra_active_discovery_sources(uuid) from public,anon,authenticated;
grant execute on function public.relystra_active_discovery_sources(uuid) to service_role;
create function public.relystra_public_analysis_error(p_error text) returns text language sql immutable set search_path='' as $$
 select case when p_error is null then null else 'AI analysis is temporarily unavailable. Your uploaded evidence is safe. Please try again shortly.' end
$$;
revoke all on function public.relystra_public_analysis_error(text) from public,anon;
grant execute on function public.relystra_public_analysis_error(text) to authenticated,service_role;
create or replace function public.relystra_discovery_workspace(p_company_id uuid,p_project_id uuid default null,p_action text default 'view',p_document_id uuid default null,p_run_id uuid default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.relystra_discovery_engagements%rowtype; d public.nexus_documents%rowtype; r public.relystra_free_diagnoses%rowtype; added integer; result jsonb;
begin
 if auth.uid() is null or not(public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
 if p_project_id is not null and not exists(select 1 from public.nexus_projects where id=p_project_id and company_id=p_company_id) then raise exception 'Engagement/company mismatch'; end if;
 -- A paid project retains its explicitly linked discovery history; no company-wide fallback.
 select de.* into e from public.nexus_projects p join public.nexus_discovery_requests dr on dr.id=p.source_discovery_id and dr.company_id=p.company_id
 join public.relystra_discovery_engagements de on de.id::text=dr.basic_report->>'discovery_engagement_id' and de.company_id=p.company_id
 where p.id=p_project_id and p.company_id=p_company_id for update of de;
 if e.id is null then
  insert into public.relystra_discovery_engagements(company_id,project_id) values(p_company_id,p_project_id) on conflict do nothing;
  select * into e from public.relystra_discovery_engagements where company_id=p_company_id and project_id is not distinct from p_project_id for update;
 end if;
 -- Adopt retained uploads only within this exact preparation/project context.
 insert into public.relystra_discovery_documents(document_id,engagement_id)
 select id,e.id from public.relystra_evidence_scope(p_company_id,p_project_id)
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
 elsif p_action in ('generate','regenerate') then
  if not exists(select 1 from public.relystra_discovery_documents where engagement_id=e.id and state='parsed') then raise exception 'Upload and process discovery material first'; end if;
  if exists(select 1 from public.relystra_discovery_documents where engagement_id=e.id and state in ('uploaded','parsing','failed')) then raise exception 'Process, retry or remove every unresolved document before generation'; end if;
  select * into r from public.relystra_free_diagnoses where engagement_id=e.id order by version desc limit 1;
  if r.id is null or r.evidence_revision<>e.revision or r.status='failed' or (p_action='regenerate' and r.status='complete') then
   if (select count(*) from public.relystra_free_diagnoses where engagement_id=e.id and created_at>now()-interval '1 hour')>=10 then raise exception 'Generation limit reached. Retry after one hour or contact Relystra.'; end if;
   update public.relystra_free_diagnoses set status='failed',error='Evidence changed; a new revision was requested' where engagement_id=e.id and status='generating';
   insert into public.relystra_free_diagnoses(engagement_id,evidence_revision,version,document_ids,source_ids,created_by)
   select e.id,e.revision,coalesce(r.version,0)+1,array(select document_id from public.relystra_discovery_documents where engagement_id=e.id and state='parsed' order by document_id),array(select c.id from public.relystra_discovery_chunks c join public.relystra_active_discovery_sources(e.id) x on x.document_id=c.document_id where c.engagement_id=e.id and x.duplicate_of is null order by c.document_id,c.ordinal),auth.uid() returning * into r;
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
 elsif p_action not in ('view','attach','remove','reprocess','process','generate','regenerate') then raise exception 'Unknown discovery action'; end if;
 -- Evidence changes invalidate running work but never erase a completed report.
 update public.relystra_free_diagnoses set status='failed',error='New evidence added or removed. Generate an updated diagnosis.' where engagement_id=e.id and status='generating' and evidence_revision<>e.revision;
 select jsonb_build_object('id',e.id,'company_id',p_company_id,'project_id',p_project_id,'revision',e.revision,
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'file_name',n.file_name,'mime_type',n.mime_type,'category',n.category,'created_at',n.created_at,'company_id',n.company_id,'project_id',n.project_id,'state',x.state,'duplicate_of',(select a.duplicate_of from public.relystra_active_discovery_sources(e.id) a where a.document_id=x.document_id),'error',case when public.nexus_is_platform_admin() then x.error else public.relystra_public_analysis_error(x.error) end,'parser',x.parser,'text_chars',x.text_chars,'chunk_count',x.chunk_count,'chunks_processed',x.chunks_processed) order by n.created_at) from public.relystra_discovery_documents x join public.nexus_documents n on n.id=x.document_id where x.engagement_id=e.id),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(z) order by version desc) from (select id,version,status,evidence_revision,document_ids,source_ids,report,case when public.nexus_is_platform_admin() then error else public.relystra_public_analysis_error(error) end as error,error_code,error_retryable,request_id,generation_metadata,created_at,completed_at from public.relystra_free_diagnoses where engagement_id=e.id order by version desc limit 50)z),'[]'),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('run_id',v.run_id,'decision',v.decision,'note',v.note,'created_at',v.created_at) order by v.created_at) from public.relystra_discovery_reviews v join public.relystra_free_diagnoses f on f.id=v.run_id where f.engagement_id=e.id),'[]')) into result;
 return result;
end $$;
revoke all on function public.relystra_discovery_workspace(uuid,uuid,text,uuid,uuid,text) from public,anon;
grant execute on function public.relystra_discovery_workspace(uuid,uuid,text,uuid,uuid,text) to authenticated;

create or replace function public.relystra_commit_discovery_work(p_engagement_id uuid,p_lease_id uuid,p_revision integer,p_action text,p_payload jsonb)
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
  update public.relystra_free_diagnoses set status='complete',report=p_payload->'report',completed_at=now(),error=null,error_code=null,error_retryable=false,generation_metadata=coalesce(p_payload->'metadata','{}') where id=run;
  -- Retain the exact extraction/provenance snapshot for historical diagnosis review.
  update public.relystra_free_diagnoses set report=report||jsonb_build_object('evidence_ledger',(select jsonb_agg(jsonb_build_object('source_id',c.id,'document_id',c.document_id,'start',c.start_offset,'end',c.end_offset,'extraction',c.extraction) order by c.document_id,c.ordinal) from public.relystra_discovery_chunks c where c.id=any(source_ids))) where id=run;
  delete from public.relystra_discovery_synthesis where run_id=run;
 elsif p_action='fail' then
  if doc is not null then update public.relystra_discovery_documents set state='failed',error=left(p_payload->>'error',1000),updated_at=now() where document_id=doc; end if;
  if run is not null then update public.relystra_free_diagnoses set status='failed',error=left(p_payload->>'error',1000),error_code=p_payload->>'error_code',error_retryable=coalesce((p_payload->>'retryable')::boolean,false),generation_metadata=generation_metadata||coalesce(p_payload->'metadata','{}') where id=run; end if;
 elsif p_action='idle' then update public.relystra_discovery_engagements set processing_requested=false where id=e.id;
 else raise exception 'Unknown processing action'; end if;
 update public.relystra_discovery_engagements set lease_id=null,lease_until=null,stalled_claims=0,updated_at=now() where id=e.id;
 return true;
end $$;

-- Request keys survive lost responses; retries and double taps cannot create two revisions.
create function public.relystra_request_free_diagnosis(p_company_id uuid,p_project_id uuid,p_request_id uuid,p_regenerate boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; eid uuid;
begin
 if p_request_id is null then raise exception 'Request ID required'; end if;
 s:=public.relystra_discovery_workspace(p_company_id,p_project_id,'view'); eid:=(s->>'id')::uuid;
 perform 1 from public.relystra_discovery_engagements where id=eid for update;
 if exists(select 1 from public.relystra_free_diagnoses where engagement_id=eid and request_id=p_request_id) then return s; end if;
 if exists(select 1 from public.relystra_free_diagnoses where engagement_id=eid and status='generating') then return s; end if;
 s:=public.relystra_discovery_workspace(p_company_id,p_project_id,case when p_regenerate then 'regenerate' else 'generate' end);
 update public.relystra_free_diagnoses set request_id=p_request_id where id=(s#>>'{reports,0,id}')::uuid and request_id is null;
 return public.relystra_discovery_workspace(p_company_id,p_project_id,'view');
end $$;
revoke all on function public.relystra_request_free_diagnosis(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.relystra_request_free_diagnosis(uuid,uuid,uuid,boolean) to authenticated;

-- Full Diagnosis access belongs to the paid plan's project, not every project at a company.
create function private.relystra_full_diagnosis_access(p_company_id uuid,p_project_id uuid,p_run_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nexus_diagnosis_runs r where r.id=p_run_id and r.company_id=p_company_id and r.relystra_legacy_access
  and (r.project_id is not distinct from p_project_id or exists(select 1 from public.nexus_projects p where p.id=p_project_id and p.company_id=p_company_id and (p.context_diagnosis_run_id=r.id or p.source_diagnosis_run_id=r.id))))
 or exists(select 1 from public.nexus_company_entitlements e where e.company_id=p_company_id and e.offering_code='find' and e.status='active' and e.starts_at<=now() and (e.ends_at is null or e.ends_at>now()) and (
   (e.source<>'purchase' and nullif(e.scope->>'project_id','')::uuid is not distinct from p_project_id)
   or exists(select 1 from public.nexus_build_plans plan where plan.id::text=e.scope->>'plan_id' and plan.company_id=p_company_id and plan.status='paid'
     and exists(select 1 from public.nexus_delivery_payment_events v where v.plan_id=plan.id)
     and (exists(select 1 from public.nexus_projects p where p.id=p_project_id and p.company_id=p_company_id and p.build_plan_id=plan.id)
       or (plan.purchase_kind='diagnosis' and nullif(e.scope->>'project_id','')::uuid is not distinct from p_project_id)))
 ))
$$;
revoke all on function private.relystra_full_diagnosis_access(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.relystra_full_diagnosis_access(uuid,uuid,uuid) to service_role;
create or replace function private.relystra_diagnosis_access(p_company_id uuid,p_run_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select private.relystra_full_diagnosis_access(p_company_id,(select project_id from public.nexus_diagnosis_runs where id=p_run_id and company_id=p_company_id),p_run_id)
$$;
create or replace function private.relystra_guard_diagnosis_purchase()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then new.relystra_legacy_access:=false;
 elsif new.relystra_legacy_access is distinct from old.relystra_legacy_access then raise exception 'Historical diagnosis access is immutable'; end if;
 if new.status in ('queued','analyzing','ready_for_review','in_review','approved') and not new.relystra_legacy_access
   and not private.relystra_full_diagnosis_access(new.company_id,new.project_id,new.id) then
   raise exception 'Full Diagnosis requires payment for this engagement. Free Diagnosis remains available in Step 2';
 end if;
 return new;
end $$;

-- One server projection determines all eleven steps, based solely on durable facts.
create or replace function public.relystra_workspace_snapshot(p_company_id uuid,p_project_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; f jsonb; r jsonb; n integer:=1; stage text; reviewed boolean;
begin
 s:=private.relystra_workspace_snapshot(p_company_id,p_project_id);
 s:=jsonb_set(s,'{diagnosis,access}',to_jsonb(private.relystra_full_diagnosis_access(p_company_id,nullif(s->>'project_id','')::uuid,nullif(s#>>'{diagnosis,id}','')::uuid)));
 f:=public.relystra_discovery_workspace(p_company_id,nullif(s->>'project_id','')::uuid,'view');
 select value into r from jsonb_array_elements(f->'reports') where value->>'status'='complete' and value->>'evidence_revision'=f->>'revision' order by (value->>'version')::integer desc limit 1;
 select coalesce(value->>'decision'='verified',false) into reviewed from jsonb_array_elements(f->'reviews') where value->>'run_id'=r->>'id' order by (value->>'created_at')::timestamptz desc limit 1;
 if r is not null then n:=case when coalesce(reviewed,false) then 4 else 3 end;
 elsif exists(select 1 from jsonb_array_elements(f->'documents') where value->>'state'='parsed') then n:=2; end if;
 stage:=s#>>'{package,stage}';
 -- Preserve existing paid/approved legacy engagements without resetting historical work.
 if (s#>>'{diagnosis,status}'='approved') then
   n:=case when coalesce((s#>>'{actions,total}')::integer,0)>coalesce((s#>>'{actions,accepted}')::integer,0) then 5 when (s->>'payment_pending')::boolean then 7 else 6 end;
 elsif coalesce((s#>>'{diagnosis,access}')::boolean,false) and not exists(select 1 from jsonb_array_elements(f->'documents') where value->>'state'<>'removed') then n:=4; end if;
 if stage is not null then
  n:=case when (s->>'initial_engagement')::boolean and s#>>'{diagnosis,status}' is distinct from 'approved' and stage='briefs' then 4
  when stage in ('briefs','building','internal_qa') then 8 when stage in ('client_review','revisions') then 9 when stage='final_qa' then 10 when stage in ('support','completed') then 11 else n end;
 end if;
 return s||jsonb_build_object('free_discovery',f,'workflow',jsonb_build_object('current_step',n,'free_run_id',r->>'id','evidence_revision',f->'revision','findings_reviewed',coalesce(reviewed,false),'completed',stage='completed'));
end $$;
commit;
