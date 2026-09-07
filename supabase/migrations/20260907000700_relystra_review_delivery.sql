begin;
alter table public.nexus_system_cards add column delivery_content jsonb not null default '{}',
  add column internal_qa jsonb,add column final_qa jsonb,add column client_review jsonb,add column revision_resolution jsonb;
alter table public.nexus_projects add column draft_package jsonb,add column final_package jsonb,add column package_versions jsonb not null default '[]';

create or replace function private.relystra_validate_qa(p_checks jsonb,p_final boolean)
returns void language plpgsql immutable set search_path='' as $$
declare key text; keys text[]:=array['functionality','outputs','permissions','integrations','links','error_states','input_validation','data_behavior','mobile_usability','client_usability'];
begin
  if jsonb_typeof(p_checks) is distinct from 'object' then raise exception 'Record QA results and evidence'; end if;
  if p_final then keys:=keys||array['documentation','faq','support_grounding']; end if;
  foreach key in array keys loop
    if p_checks->key->>'status' is null or p_checks->key->>'status' not in ('pass','not_applicable') or length(btrim(coalesce(p_checks->key->>'evidence','')))<10 then
      raise exception 'QA needs a result and evidence for %',replace(key,'_',' '); end if;
    if key in ('functionality','outputs','client_usability','documentation','faq','support_grounding') and p_checks->key->>'status'<>'pass' then
      raise exception '% must pass before delivery',replace(key,'_',' '); end if;
  end loop;
end $$;
create or replace function private.relystra_validate_delivery(p_content jsonb,p_final boolean)
returns void language plpgsql immutable set search_path='' as $$
declare key text; entry jsonb;
begin
  if nullif(btrim(p_content->>'description'),'') is null or p_content->>'preview_url' is null or p_content->>'preview_url' !~ '^https://[^[:space:]]+$'
    or jsonb_typeof(p_content->'what_to_test') is distinct from 'array' or jsonb_array_length(p_content->'what_to_test')=0 then
    raise exception 'Add a description, working HTTPS preview or deliverable link, and client test instructions'; end if;
  if exists(select 1 from jsonb_array_elements(p_content->'what_to_test') v where jsonb_typeof(v)<>'string' or nullif(btrim(v#>>'{}'),'') is null) then raise exception 'Write clear client test instructions'; end if;
  if nullif(p_content->>'walkthrough_url','') is not null and p_content->>'walkthrough_url' !~ '^https://[^[:space:]]+$' then raise exception 'Use an HTTPS walkthrough link'; end if;
  if p_final then
    foreach key in array array['what','when','troubleshooting'] loop
      if nullif(btrim(p_content->'tutorial'->>key),'') is null then raise exception 'Complete the tutorial: %',key; end if;
    end loop;
    if jsonb_typeof(p_content->'tutorial'->'steps') is distinct from 'array' or jsonb_array_length(p_content->'tutorial'->'steps')=0 then raise exception 'The tutorial needs numbered usage steps'; end if;
    if exists(select 1 from jsonb_array_elements(p_content->'tutorial'->'steps') v where jsonb_typeof(v)<>'string' or nullif(btrim(v#>>'{}'),'') is null) then raise exception 'Write clear numbered tutorial steps'; end if;
    if jsonb_typeof(p_content->'faq') is distinct from 'array' or jsonb_array_length(p_content->'faq')=0 then raise exception 'Every Build needs an FAQ'; end if;
    for entry in select value from jsonb_array_elements(p_content->'faq') loop
      if nullif(btrim(entry->>'question'),'') is null or nullif(btrim(entry->>'answer'),'') is null then raise exception 'Each FAQ needs an approved question and answer'; end if;
    end loop;
  end if;
end $$;

create or replace function private.relystra_save_delivery(p_build_id uuid,p_content jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype; content jsonb:='{}'; key text; file_id text;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into b from public.nexus_system_cards where id=p_build_id;
  select * into p from public.nexus_projects where id=b.project_id and project_type='build_package' for update;
  select * into b from public.nexus_system_cards where id=p_build_id for update;
  if p.id is null or b.brief_approved_at is null or p.package_stage not in ('building','internal_qa','revisions') then raise exception 'Delivery edits require an approved Build in development or revision'; end if;
  if b.build_status='revision' and b.revision_resolution is null then raise exception 'Confirm whether the feedback is within scope before editing'; end if;
  if jsonb_typeof(p_content) is distinct from 'object' then raise exception 'Invalid delivery content'; end if;
  foreach key in array array['description','preview_url','what_to_test','tutorial','faq','walkthrough_url','supporting_files','known_limitations'] loop
    if p_content ? key then content:=content||jsonb_build_object(key,p_content->key); end if;
  end loop;
  content:=b.delivery_content||content;
  if content ? 'supporting_files' then
    if jsonb_typeof(content->'supporting_files') is distinct from 'array' then raise exception 'Choose shared workspace files'; end if;
    for file_id in select jsonb_array_elements_text(content->'supporting_files') loop
      if not exists(select 1 from public.nexus_documents d where d.id=file_id::uuid and d.company_id=b.company_id
        and (d.project_id is null or d.project_id=p.id) and d.document_area in ('nexus_shared','company_library') and d.status is distinct from 'archived') then
        raise exception 'Supporting files must be shared files for this client and package'; end if;
    end loop;
  end if;
  if content is not distinct from b.delivery_content then return b.id; end if;
  update public.nexus_system_cards set delivery_content=content,internal_qa=null,final_qa=null,client_review=null,build_status='building',updated_at=now() where id=b.id;
  update public.nexus_projects set package_stage=case when package_stage='internal_qa' then 'building' else package_stage end,updated_at=now() where id=p.id;
  return b.id;
end $$;
create or replace function public.relystra_save_delivery(p_build_id uuid,p_content jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_save_delivery(p_build_id,p_content) $$;

create or replace function private.relystra_record_qa(p_build_id uuid,p_kind text,p_checks jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype; evidence jsonb;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if p_kind not in ('internal','final') or p_kind is null then raise exception 'Choose internal or final QA'; end if;
  select * into b from public.nexus_system_cards where id=p_build_id;
  select * into p from public.nexus_projects where id=b.project_id and project_type='build_package' for update;
  select * into b from public.nexus_system_cards where id=p_build_id for update;
  if p.id is null or b.brief_approved_at is null or not exists(select 1 from public.nexus_tasks where build_id=b.id and work_kind='build_task')
    or exists(select 1 from public.nexus_tasks where build_id=b.id and work_kind='build_task' and (archived_at is not null or status not in ('completed','approved','done'))) then
    raise exception 'Complete the approved Build checklist before QA'; end if;
  if p_kind='internal' and p.package_stage not in ('building','internal_qa','revisions') then raise exception 'Internal QA is not available in this stage'; end if;
  if p_kind='final' and (p.package_stage<>'final_qa' or b.client_review->>'decision' is distinct from 'approve'
    or b.client_review->>'content_digest' is distinct from md5(b.delivery_content::text)) then raise exception 'Client approval of the current Build is required before final QA'; end if;
  perform private.relystra_validate_delivery(b.delivery_content,p_kind='final');
  perform private.relystra_validate_qa(p_checks,p_kind='final');
  evidence:=jsonb_build_object('actor_id',auth.uid(),'at',now(),'checks',p_checks,'content_digest',md5(b.delivery_content::text));
  if p_kind='internal' then
    update public.nexus_system_cards set internal_qa=evidence,build_status='ready_for_review',updated_at=now() where id=b.id;
    if not exists(select 1 from public.nexus_system_cards where project_id=p.id and opportunity_id is not null and build_status<>'ready_for_review') then
      update public.nexus_projects set package_stage='internal_qa',updated_at=now() where id=p.id;
    end if;
  else
    update public.nexus_system_cards set final_qa=evidence,updated_at=now() where id=b.id;
  end if;
  return b.id;
end $$;
create or replace function public.relystra_record_qa(p_build_id uuid,p_kind text,p_checks jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_record_qa(p_build_id,p_kind,p_checks) $$;

create or replace function private.relystra_package_items(p_project_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('build_id',b.id,'name',b.name,'outcome',b.purpose,'content',b.delivery_content,
    'content_digest',md5(b.delivery_content::text),'source_finding_refs',b.build_brief->'diagnosis_source') order by b.created_at,b.id),'[]')
  from public.nexus_system_cards b where b.project_id=p_project_id and b.opportunity_id is not null
$$;
create or replace function private.relystra_publish_draft(p_project_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; b public.nexus_system_cards%rowtype; draft_id uuid:=gen_random_uuid(); count_builds integer:=0;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package' for update;
  if p.id is null or p.package_stage not in ('building','internal_qa','revisions') then raise exception 'A developed package is required'; end if;
  for b in select * from public.nexus_system_cards where project_id=p.id and opportunity_id is not null order by id for update loop
    count_builds:=count_builds+1;
    if b.internal_qa->>'content_digest' is distinct from md5(b.delivery_content::text) or b.build_status<>'ready_for_review'
      or exists(select 1 from public.nexus_tasks where build_id=b.id and work_kind='build_task' and (archived_at is not null or status not in ('completed','approved','done'))) then
      raise exception 'Every purchased Build needs current internal QA before the Draft Package'; end if;
    perform private.relystra_validate_delivery(b.delivery_content,true);
  end loop;
  if count_builds=0 or count_builds<>jsonb_array_length(p.scope_snapshot->'items') then raise exception 'The package must include every purchased Build'; end if;
  update public.nexus_projects set draft_package=jsonb_build_object('id',draft_id,'published_at',now(),'published_by',auth.uid(),
    'items',private.relystra_package_items(p.id),'version',coalesce((draft_package->>'version')::integer,0)+1),package_stage='client_review',updated_at=now() where id=p.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p.company_id,auth.uid(),'draft_package_published','project',p.id,'Draft Package ready for client review.');
  return draft_id;
end $$;
create or replace function public.relystra_publish_draft(p_project_id uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_publish_draft(p_project_id) $$;

create or replace function private.relystra_review_build(p_build_id uuid,p_draft_id uuid,p_decision text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype;
begin
  select * into b from public.nexus_system_cards where id=p_build_id;
  if auth.uid() is null or not public.nexus_is_company_member(b.company_id) then raise exception 'Client company membership required'; end if;
  select * into p from public.nexus_projects where id=b.project_id and project_type='build_package' for update;
  select * into b from public.nexus_system_cards where id=p_build_id for update;
  if p.id is null or p.package_stage not in ('client_review','revisions') or p.draft_package->>'id' is distinct from p_draft_id::text
    or not exists(select 1 from jsonb_array_elements(p.draft_package->'items') i where i->>'build_id'=b.id::text and i->>'content_digest'=md5(b.delivery_content::text)) then
    raise exception 'Refresh the current Draft Package before reviewing'; end if;
  if p_decision not in ('approve','minor_revision','problem') or p_decision is null then raise exception 'Choose approval, minor revision or report a problem'; end if;
  if p_decision<>'approve' and length(btrim(coalesce(p_note,'')))<5 then raise exception 'Describe what needs attention'; end if;
  if b.build_status<>'ready_for_review' then raise exception 'Relystra is revising this Build. Review its next draft when ready'; end if;
  update public.nexus_system_cards set client_review=jsonb_build_object('actor_id',auth.uid(),'at',now(),'draft_id',p_draft_id,
    'content_digest',md5(delivery_content::text),'decision',p_decision,'note',p_note),revision_resolution=null,final_qa=null,
    build_status=case when p_decision='approve' then 'ready_for_review' else 'revision' end,updated_at=now() where id=b.id;
  if p_decision<>'approve' then update public.nexus_projects set package_stage='revisions',updated_at=now() where id=p.id;
  elsif not exists(select 1 from public.nexus_system_cards where project_id=p.id and opportunity_id is not null
    and (client_review->>'decision' is distinct from 'approve' or client_review->>'content_digest' is distinct from md5(delivery_content::text))) then
    update public.nexus_projects set package_stage='final_qa',updated_at=now() where id=p.id;
  end if;
  return b.id;
end $$;
create or replace function public.relystra_review_build(p_build_id uuid,p_draft_id uuid,p_decision text,p_note text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_review_build(p_build_id,p_draft_id,p_decision,p_note) $$;

create or replace function private.relystra_resolve_revision(p_build_id uuid,p_resolution text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if p_resolution not in ('in_scope','separate_build','approved_exception') or p_resolution is null or length(btrim(coalesce(p_note,'')))<10 then
    raise exception 'Record the scope decision and a clear explanation'; end if;
  select * into b from public.nexus_system_cards where id=p_build_id;
  select * into p from public.nexus_projects where id=b.project_id and project_type='build_package' for update;
  select * into b from public.nexus_system_cards where id=p_build_id for update;
  if p.id is null or p.package_stage<>'revisions' or b.client_review->>'decision' is null or b.client_review->>'decision' not in ('minor_revision','problem') or b.revision_resolution is not null then
    raise exception 'Unresolved client feedback is required'; end if;
  update public.nexus_system_cards set revision_resolution=jsonb_build_object('actor_id',auth.uid(),'at',now(),'resolution',p_resolution,'note',p_note,'feedback',client_review),
    client_review=null,final_qa=null,build_status=case when p_resolution='separate_build' then 'ready_for_review' else 'building' end,
    internal_qa=case when p_resolution='separate_build' then internal_qa else null end,updated_at=now() where id=b.id;
  if p_resolution<>'separate_build' then
    insert into public.nexus_tasks(company_id,project_id,build_id,title,description,instructions,assignee,owner_scope,status,priority,work_kind,
      responsible_party,task_type,phase,notify_client,created_by,sort_order,source_finding_refs,workflow_metadata)
      values(b.company_id,p.id,b.id,'Resolve client feedback',p_note,'Apply the recorded scope decision and verify the reported issue.','nexus','nexus','open','normal','build_task',
        'admin','internal_build_revision','implementation',false,auth.uid(),100,coalesce(b.build_brief->'diagnosis_source','[]'),jsonb_build_object('feedback',b.client_review,'scope_decision',p_resolution));
  end if;
  return b.id;
end $$;
create or replace function public.relystra_resolve_revision(p_build_id uuid,p_resolution text,p_note text)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_resolve_revision(p_build_id,p_resolution,p_note) $$;

create or replace function private.relystra_publish_final(p_project_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; b public.nexus_system_cards%rowtype; final_id uuid:=gen_random_uuid(); count_builds integer:=0;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package' for update;
  if p.final_package is not null then return (p.final_package->>'id')::uuid; end if;
  if p.id is null or p.package_stage<>'final_qa' then raise exception 'Client review and final QA must precede final delivery'; end if;
  for b in select * from public.nexus_system_cards where project_id=p.id and opportunity_id is not null order by id for update loop
    count_builds:=count_builds+1;
    if b.final_qa->>'content_digest' is distinct from md5(b.delivery_content::text) or b.client_review->>'decision' is distinct from 'approve'
      or b.client_review->>'content_digest' is distinct from md5(b.delivery_content::text)
      or exists(select 1 from public.nexus_tasks where build_id=b.id and work_kind='build_task' and (archived_at is not null or status not in ('completed','approved','done'))) then
      raise exception 'Every Build needs client acceptance and current final QA'; end if;
    perform private.relystra_validate_qa(b.final_qa->'checks',true);
    perform private.relystra_validate_delivery(b.delivery_content,true);
  end loop;
  if count_builds=0 or count_builds<>jsonb_array_length(p.scope_snapshot->'items') then raise exception 'The Final Package must contain every purchased Build'; end if;
  update public.nexus_system_cards set build_status='complete',updated_at=now() where project_id=p.id and opportunity_id is not null;
  update public.nexus_projects set final_package=jsonb_build_object('id',final_id,'published_at',now(),'published_by',auth.uid(),
      'plan_id',build_plan_id,'scope_digest',scope_snapshot->>'snapshot_digest','items',private.relystra_package_items(p.id)),
    package_stage='support',support_starts_at=now(),support_ends_at=now()+interval '7 days',updated_at=now() where id=p.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p.company_id,auth.uid(),'final_package_published','project',p.id,'Final Package delivered. Seven-day light support begins.');
  return final_id;
end $$;
create or replace function public.relystra_publish_final(p_project_id uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_publish_final(p_project_id) $$;

create or replace function private.relystra_guard_delivery_stage()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.project_type is distinct from 'build_package' then return new; end if;
  if new.package_stage in ('client_review','final_qa') and new.draft_package is null then raise exception 'A published Draft Package is required'; end if;
  if new.package_stage in ('support','completed') or new.status='complete' then
    if new.final_package is null or new.final_package->>'scope_digest' is distinct from new.scope_snapshot->>'snapshot_digest'
      or new.final_package->>'plan_id' is distinct from new.build_plan_id::text
      or jsonb_array_length(new.final_package->'items') is distinct from jsonb_array_length(new.scope_snapshot->'items')
      or new.support_starts_at is null or new.support_ends_at is distinct from new.support_starts_at+interval '7 days'
      or exists(select 1 from public.nexus_system_cards b where b.project_id=new.id and b.opportunity_id is not null
        and (b.build_status<>'complete' or b.final_qa->>'content_digest' is distinct from md5(b.delivery_content::text)
          or b.client_review->>'decision' is distinct from 'approve')) then raise exception 'Complete final QA, client acceptance and final handoff first'; end if;
    if (new.package_stage='completed' or new.status='complete') and new.support_ends_at>now() then raise exception 'The seven-day support period is still active'; end if;
  end if;
  if tg_op='UPDATE' and old.final_package is not null and (new.final_package,new.support_starts_at,new.support_ends_at)
    is distinct from (old.final_package,old.support_starts_at,old.support_ends_at) then raise exception 'Delivered package evidence is immutable'; end if;
  if tg_op='UPDATE' and (new.draft_package,new.final_package) is distinct from (old.draft_package,old.final_package) then
    new.package_versions:=old.package_versions||jsonb_build_array(jsonb_build_object('actor_id',auth.uid(),'at',now(),'draft',new.draft_package,'final',new.final_package));
  end if;
  return new;
end $$;
create trigger relystra_delivery_stage_guard before insert or update on public.nexus_projects for each row execute function private.relystra_guard_delivery_stage();

revoke all on function private.relystra_resolve_revision(uuid,text,text),public.relystra_resolve_revision(uuid,text,text),private.relystra_publish_final(uuid),public.relystra_publish_final(uuid) from public,anon;
grant execute on function private.relystra_resolve_revision(uuid,text,text),public.relystra_resolve_revision(uuid,text,text),private.relystra_publish_final(uuid),public.relystra_publish_final(uuid) to authenticated;
revoke all on function private.relystra_guard_delivery_stage() from public,anon,authenticated;

revoke all on function private.relystra_validate_qa(jsonb,boolean),private.relystra_validate_delivery(jsonb,boolean),private.relystra_package_items(uuid) from public,anon,authenticated;
revoke all on function private.relystra_save_delivery(uuid,jsonb),public.relystra_save_delivery(uuid,jsonb),private.relystra_record_qa(uuid,text,jsonb),public.relystra_record_qa(uuid,text,jsonb),
  private.relystra_publish_draft(uuid),public.relystra_publish_draft(uuid),private.relystra_review_build(uuid,uuid,text,text),public.relystra_review_build(uuid,uuid,text,text) from public,anon;
grant execute on function private.relystra_save_delivery(uuid,jsonb),public.relystra_save_delivery(uuid,jsonb),private.relystra_record_qa(uuid,text,jsonb),public.relystra_record_qa(uuid,text,jsonb),
  private.relystra_publish_draft(uuid),public.relystra_publish_draft(uuid),private.relystra_review_build(uuid,uuid,text,text),public.relystra_review_build(uuid,uuid,text,text) to authenticated;
commit;
