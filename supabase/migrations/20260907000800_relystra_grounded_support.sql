begin;
alter table public.nexus_client_requests add column support_context jsonb,add column support_answer text,add column support_answered_at timestamptz,
  add column support_answered_by uuid references auth.users(id),add column support_history jsonb not null default '[]';
create policy relystra_support_insert_boundary on public.nexus_client_requests as restrictive for insert to authenticated
  with check(support_context is null and support_answer is null and support_answered_at is null and support_answered_by is null and support_history='[]');
create policy relystra_support_retention on public.nexus_client_requests as restrictive for delete to authenticated using(support_context is null);

create or replace function private.relystra_support_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.support_context is not null then
    if (new.company_id,new.project_id,new.requested_by,new.description,new.support_context) is distinct from
      (old.company_id,old.project_id,old.requested_by,old.description,old.support_context) then raise exception 'Support question and source evidence are retained'; end if;
    if (new.status,new.support_answer) is distinct from (old.status,old.support_answer) then
      new.support_history:=old.support_history||jsonb_build_array(jsonb_build_object('actor_id',auth.uid(),'at',now(),'status',new.status,'answer',new.support_answer));
      if new.support_answer is distinct from old.support_answer then new.support_answered_at:=now();new.support_answered_by:=auth.uid(); end if;
    end if;
  elsif tg_op='INSERT' and new.support_context is not null then
    new.support_history:=jsonb_build_array(jsonb_build_object('actor_id',null,'at',now(),'status',new.status,'answer',new.support_answer,'source',new.support_context));
  end if;
  return new;
end $$;
create trigger relystra_support_history before insert or update on public.nexus_client_requests for each row execute function private.relystra_support_history();

create or replace function private.relystra_answer_support(p_request_id uuid,p_answer text)
returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if length(btrim(coalesce(p_answer,'')))<10 then raise exception 'Provide a useful support answer'; end if;
  update public.nexus_client_requests set support_answer=btrim(p_answer),status='complete',updated_at=now()
    where id=p_request_id and support_context is not null returning id into request_id;
  if request_id is null then raise exception 'Support Request not found'; end if;
  return request_id;
end $$;
create or replace function public.relystra_answer_support(p_request_id uuid,p_answer text)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_answer_support(p_request_id,p_answer) $$;

create or replace function private.relystra_support_sources_unchecked(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; item jsonb; faq jsonb; source_id text; body text; idx integer; sources jsonb:='[]';
begin
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package' and final_package is not null;
  if p.id is null then return '[]'; end if;
  for item in select value from jsonb_array_elements(p.final_package->'items') loop
    source_id:=(item->>'build_id')||':'||(item->>'content_digest');
    body:=coalesce(item->'content'->>'description','');
    sources:=sources||jsonb_build_array(jsonb_build_object('id',source_id||':description','build_id',item->>'build_id','title',(item->>'name')||' — What this does','body',body));
    body:='What this does: '||(item->'content'->'tutorial'->>'what')||E'\nHow to use it:\n'||
      (select string_agg(n::text||'. '||value,E'\n' order by n) from jsonb_array_elements_text(item->'content'->'tutorial'->'steps') with ordinality s(value,n))||
      E'\nWhen to use it: '||(item->'content'->'tutorial'->>'when')||E'\nIf something goes wrong: '||(item->'content'->'tutorial'->>'troubleshooting');
    sources:=sources||jsonb_build_array(jsonb_build_object('id',source_id||':tutorial','build_id',item->>'build_id','title',(item->>'name')||' — Usage guide','body',body));
    idx:=0;
    for faq in select value from jsonb_array_elements(item->'content'->'faq') loop
      idx:=idx+1;
      sources:=sources||jsonb_build_array(jsonb_build_object('id',source_id||':faq:'||idx,'build_id',item->>'build_id','title',(item->>'name')||' — '||(faq->>'question'),
        'body',(faq->>'question')||E'\n'||(faq->>'answer')));
    end loop;
  end loop;
  sources:=sources||jsonb_build_array(jsonb_build_object('id',p.id::text||':support-boundary','title','Light support coverage',
    'body','The seven-day light support period covers clarification, legitimate defects, small corrections and basic usage questions. It does not include unlimited consulting, major redesign, new functionality or materially expanded scope. Those requests require a separate scope decision.',
    'support_starts_at',p.support_starts_at,'support_ends_at',p.support_ends_at));
  return sources;
end $$;
create or replace function private.relystra_support_sources(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare company_id uuid;
begin
  select p.company_id into company_id from public.nexus_projects p where p.id=p_project_id and project_type='build_package' and final_package is not null;
  if auth.uid() is null or company_id is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id)) then raise exception 'Delivered package access required'; end if;
  return private.relystra_support_sources_unchecked(p_project_id);
end $$;
create or replace function public.relystra_support_sources(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.relystra_support_sources(p_project_id) $$;

create or replace function public.relystra_record_support_turn(p_turn_id uuid,p_project_id uuid,p_user_id uuid,p_question text,p_citations jsonb,p_escalate boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; existing public.nexus_client_requests%rowtype; sources jsonb; citation jsonb; source jsonb; answer text:='';
begin
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package' and final_package is not null;
  if p.id is null or p_user_id is null or not (exists(select 1 from public.nexus_platform_admins where user_id=p_user_id)
    or exists(select 1 from public.nexus_company_members where company_id=p.company_id and user_id=p_user_id and active)) then raise exception 'Delivered package access required'; end if;
  if p_turn_id is null or nullif(btrim(p_question),'') is null or length(p_question)>2000 or p_escalate is null then raise exception 'A support question and turn identifier are required'; end if;
  select * into existing from public.nexus_client_requests where id=p_turn_id;
  if existing.id is not null then
    if existing.project_id is distinct from p.id or existing.requested_by<>p_user_id or existing.description is distinct from p_question then raise exception 'Support turn identifier already used'; end if;
    return existing.id;
  end if;
  sources:=private.relystra_support_sources_unchecked(p.id);
  if not p_escalate then
    if jsonb_typeof(p_citations) is distinct from 'array' or jsonb_array_length(p_citations)=0 or jsonb_array_length(p_citations)>5 then raise exception 'A grounded answer needs verified source passages'; end if;
    for citation in select value from jsonb_array_elements(p_citations) loop
      select value into source from jsonb_array_elements(sources) where value->>'id'=citation->>'source_id';
      if source is null or nullif(btrim(citation->>'quote'),'') is null or length(citation->>'quote')>3000
        or position((citation->>'quote') in (source->>'body'))=0 then raise exception 'The cited passage does not exist in this delivered package'; end if;
      answer:=answer||case when answer='' then '' else E'\n\n' end||(source->>'title')||E'\n'||(citation->>'quote');
    end loop;
  else
    p_citations:='[]';answer:='I could not find a supported answer in your delivered materials. A Support Request has been sent to Relystra for review.';
  end if;
  insert into public.nexus_client_requests(id,company_id,project_id,category,title,description,priority,status,requested_by,support_context,support_answer,support_answered_at)
    values(p_turn_id,p.company_id,p.id,'support',left(p_question,160),p_question,'normal',case when p_escalate then 'submitted' else 'complete' end,p_user_id,
      jsonb_build_object('final_package_id',p.final_package->>'id','citations',p_citations,'escalated',p_escalate,'answer_type',case when p_escalate then 'human_escalation' else 'verified_passages' end),
      answer,now()) on conflict(id) do nothing;
  select * into existing from public.nexus_client_requests where id=p_turn_id;
  if existing.project_id is distinct from p.id or existing.requested_by<>p_user_id or existing.description is distinct from p_question then raise exception 'Support turn identifier already used'; end if;
  return p_turn_id;
end $$;

create or replace function public.relystra_close_expired_support()
returns integer language plpgsql security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; n integer:=0;
begin
  for p in select * from public.nexus_projects where project_type='build_package' and package_stage='support' and support_ends_at<=now() order by id for update skip locked loop
    update public.nexus_projects set package_stage='completed',status='complete',updated_at=now() where id=p.id;
    insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
      values(p.company_id,null,'support_period_completed','project',p.id,'Seven-day support period completed. Delivered materials and any open Support Requests remain available.');
    n:=n+1;
  end loop;
  return n;
end $$;

revoke all on function private.relystra_support_sources_unchecked(uuid) from public,anon,authenticated;
revoke all on function private.relystra_support_history() from public,anon,authenticated;
revoke all on function private.relystra_answer_support(uuid,text),public.relystra_answer_support(uuid,text) from public,anon;
grant execute on function private.relystra_answer_support(uuid,text),public.relystra_answer_support(uuid,text) to authenticated;
revoke all on function private.relystra_support_sources(uuid),public.relystra_support_sources(uuid) from public,anon;
grant execute on function private.relystra_support_sources(uuid),public.relystra_support_sources(uuid) to authenticated;
revoke all on function public.relystra_record_support_turn(uuid,uuid,uuid,text,jsonb,boolean),public.relystra_close_expired_support() from public,anon,authenticated;
grant execute on function public.relystra_record_support_turn(uuid,uuid,uuid,text,jsonb,boolean),public.relystra_close_expired_support() to service_role;
commit;
