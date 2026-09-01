-- Promote approved diagnosis outputs into the active implementation workflow.
-- Client-owned diagnosis actions and evidence requests become actionable in-app;
-- draft client decisions remain human-controlled until explicitly sent.

alter table public.nexus_document_requests
  add column if not exists owner_scope text not null default 'client';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='nexus_document_requests_owner_scope_check'
      and conrelid='public.nexus_document_requests'::regclass
  ) then
    alter table public.nexus_document_requests
      add constraint nexus_document_requests_owner_scope_check
      check (owner_scope in ('client','nexus'));
  end if;
end $$;

create or replace function private.nexus_diagnosis_document_owner(p_title text,p_purpose text,p_examples text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when lower(coalesce(p_title,'')||' '||coalesce(p_purpose,'')||' '||coalesce(p_examples,'')) ~
      '(statement|transaction export|account summary|account settings|platform settings|existing .*template|existing .*report|booking report|appointment.*report|bank|credit.card|square|stripe|acuity|novo|american express|client record|source record|source data|screenshot|billing summary)'
      then 'client'
    when lower(coalesce(p_title,'')||' '||coalesce(p_purpose,'')||' '||coalesce(p_examples,'')) ~
      '(nexus[- ]generated|internal nexus|research brief|benchmark|architecture|process map|implementation plan|analysis memo)'
      then 'nexus'
    else 'client'
  end;
$$;
revoke all on function private.nexus_diagnosis_document_owner(text,text,text) from public,anon,authenticated;

create or replace function public.nexus_get_inbox(p_company_id uuid default null::uuid)
returns table(item_key text, kind text, company_id uuid, company_name text, title text, message text, status text, priority text, due_at timestamp with time zone, created_at timestamp with time zone, action_url text, related_type text, related_id uuid, approval_chain_id uuid, approval_step_id uuid, step_order integer, step_count integer, can_approve boolean, is_unread boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare v_admin boolean:=public.nexus_is_platform_admin(); v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not v_admin and p_company_id is null then raise exception 'Company is required'; end if;
  if not v_admin and not public.nexus_is_company_member(p_company_id) then raise exception 'Company membership required'; end if;

  return query
  with visible_chains as (
    select c.* from public.nexus_approval_chains c
    where c.status in ('pending','changes_requested')
      and (v_admin or (c.visibility='company' and c.company_id=p_company_id and public.nexus_is_company_member(c.company_id)))
      and (p_company_id is null or c.company_id=p_company_id or (v_admin and c.company_id is null))
  ), pending_steps as (
    select s.*,c.company_id,c.title chain_title,c.description chain_description,c.status chain_status,c.id chainid,co.name company_name,
      (select count(*)::int from public.nexus_approval_chain_steps x where x.chain_id=c.id) step_count
    from visible_chains c
    join public.nexus_approval_chain_steps s on s.chain_id=c.id and s.status='pending'
    left join public.nexus_companies co on co.id=c.company_id
  ), unified as (
    select 'approval:'||ps.id::text item_key,'approval'::text kind,ps.company_id,ps.company_name,ps.chain_title title,
      coalesce(ps.chain_description,ps.instructions,'Approval is waiting for review.') message,ps.chain_status status,
      case when ps.due_at is not null and ps.due_at<now() then 'high' else 'normal' end priority,
      ps.due_at,ps.created_at,'/portal?view=inbox&approval_chain='||ps.chainid::text action_url,'approval_chain'::text related_type,ps.chainid related_id,
      ps.chainid approval_chain_id,ps.id approval_step_id,ps.step_order,ps.step_count,
      private.nexus_user_can_approve_step(ps.id,v_user) can_approve,false is_unread
    from pending_steps ps

    union all
    select 'task:'||t.id::text,'task',t.company_id,co.name,t.title,coalesce(t.description,'Action item requires attention.'),t.status,t.priority,
      case when t.due_date is null then null else t.due_date::timestamptz end,t.created_at,'/portal?view=inbox&task='||t.id::text,'task',t.id,
      null::uuid,null::uuid,null::integer,null::integer,
      case when v_admin then t.status='ready_for_review' or t.assignee='nexus' else t.assignee='client' end,false
    from public.nexus_tasks t join public.nexus_companies co on co.id=t.company_id
    where t.status not in ('done','completed','not_applicable','draft')
      and (p_company_id is null or t.company_id=p_company_id)
      and (v_admin or (t.company_id=p_company_id and public.nexus_is_company_member(t.company_id) and t.assignee='client'))
      and (case when v_admin then (t.status='ready_for_review' or t.assignee='nexus') else true end)

    union all
    select 'document_request:'||d.id::text,'document_request',d.company_id,co.name,d.title,coalesce(d.purpose,'Nexus requested supporting evidence.'),d.status,'normal',
      case when d.due_date is null then null else d.due_date::timestamptz end,d.created_at,'/portal?view=inbox&document_request='||d.id::text,'document_request',d.id,
      null::uuid,null::uuid,null::integer,null::integer,
      case when v_admin then d.owner_scope='nexus' else d.owner_scope='client' end,false
    from public.nexus_document_requests d join public.nexus_companies co on co.id=d.company_id
    where d.status='requested' and (p_company_id is null or d.company_id=p_company_id)
      and ((v_admin and d.owner_scope='nexus') or (not v_admin and d.owner_scope='client' and d.company_id=p_company_id and public.nexus_is_company_member(d.company_id)))

    union all
    select 'question:'||q.id::text,'question',q.company_id,co.name,'Diagnosis report question',q.question,q.status,'normal',null::timestamptz,q.created_at,
      '/portal?view=diagnosis-question&question='||q.id::text,'diagnosis_report_question',q.id,
      null::uuid,null::uuid,null::integer,null::integer,v_admin,false
    from public.nexus_diagnosis_report_questions q join public.nexus_companies co on co.id=q.company_id
    where q.status='open' and (p_company_id is null or q.company_id=p_company_id)
      and (v_admin or (q.company_id=p_company_id and public.nexus_is_company_member(q.company_id) and q.asked_by=v_user))

    union all
    select 'notification:'||n.id::text,'update',n.company_id,co.name,n.title,coalesce(n.message,''),'unread','normal',null::timestamptz,n.created_at,
      coalesce(n.action_url,'/portal?view=inbox'),'notification',n.id,
      null::uuid,null::uuid,null::integer,null::integer,false,true
    from public.nexus_notifications n left join public.nexus_companies co on co.id=n.company_id
    where n.read_at is null and (n.user_id is null or n.user_id=v_user)
      and (p_company_id is null or n.company_id=p_company_id)
      and (v_admin or (n.company_id=p_company_id and public.nexus_is_company_member(n.company_id)))

    union all
    select 'founder:'||f.id::text,'founder_decision',null::uuid,null::text,f.title,coalesce(f.context,f.recommended_action,''),f.status,f.priority,f.due_at,f.created_at,
      '/portal?view=revenue-engine&decision='||f.id::text,'founder_decision',f.id,
      null::uuid,null::uuid,null::integer,null::integer,v_admin,false
    from public.nexus_founder_decision_queue f
    where v_admin and p_company_id is null and f.status='open'
  )
  select u.item_key,u.kind,u.company_id,u.company_name,u.title,u.message,u.status,u.priority,u.due_at,u.created_at,u.action_url,u.related_type,u.related_id,
    u.approval_chain_id,u.approval_step_id,u.step_order,u.step_count,u.can_approve,u.is_unread
  from unified u
  order by case u.priority when 'critical' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 0 end desc,
    u.due_at asc nulls last,u.created_at desc;
end
$function$;

create or replace function public.nexus_approve_diagnosis(p_run_id uuid, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare r public.nexus_diagnosis_runs%rowtype; res jsonb; pilot jsonb; proj uuid; item jsonb; owner_scope text; counts jsonb:=jsonb_build_object('opportunities',0,'projects',0,'milestones',0,'nexus_tasks',0,'client_actions',0,'document_requests',0,'approvals',0,'metrics',0); n int;
begin
 if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
 select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
 if r.id is null then raise exception 'Diagnosis run not found'; end if;
 if r.analysis_result is null then raise exception 'Diagnosis has no analysis result'; end if;
 if r.status not in ('ready_for_review','approved') then raise exception 'Diagnosis must be ready for review before approval'; end if;
 if r.orchestrated_at is not null then
   update public.nexus_diagnosis_runs set status='approved',approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,auth.uid()),review_notes=coalesce(nullif(trim(coalesce(p_note,'')),''),review_notes),updated_at=now() where id=r.id;
   return r.orchestration_summary;
 end if;
 res:=r.analysis_result; pilot:=coalesce(res->'smallest_safe_pilot','{}'::jsonb);
 insert into public.nexus_projects(company_id,name,service_type,status,summary,created_by,source_diagnosis_run_id,project_type)
 values(r.company_id,coalesce(nullif(pilot->>'title',''),'Diagnosis-led pilot'),'Implementation Sprint','planning',coalesce(pilot->>'summary','Approved pilot from Client Diagnosis Agent'),auth.uid(),r.id,'diagnosis_pilot')
 on conflict (source_diagnosis_run_id) where source_diagnosis_run_id is not null do update set summary=excluded.summary,updated_at=now() returning id into proj;
 counts:=jsonb_set(counts,'{projects}','1'::jsonb);

 n:=0; for item in select * from jsonb_array_elements(coalesce(res->'opportunity_backlog','[]'::jsonb)) loop
   insert into public.nexus_opportunities(company_id,project_id,title,problem,source,status,value_score,effort_score,readiness_score,recommendation,created_by,source_diagnosis_run_id)
   values(r.company_id,proj,coalesce(nullif(item->>'title',''),'Opportunity'),item->>'problem','diagnosis','backlog',nullif(item->>'value_score','')::smallint,nullif(item->>'effort_score','')::smallint,nullif(item->>'readiness_score','')::smallint,item->>'recommendation',auth.uid(),r.id)
   on conflict (source_diagnosis_run_id,title) where source_diagnosis_run_id is not null do nothing; if found then n:=n+1; end if;
 end loop; counts:=jsonb_set(counts,'{opportunities}',to_jsonb(n));

 n:=0; for item in select * from jsonb_array_elements(coalesce(pilot->'milestones','[]'::jsonb)) loop
   insert into public.nexus_milestones(company_id,project_id,title,description,status,sort_order,created_by,milestone_type,source_diagnosis_run_id)
   values(r.company_id,proj,coalesce(nullif(item->>'title',''),'Pilot milestone'),item->>'description','planned',n*10,auth.uid(),'diagnosis_pilot',r.id); n:=n+1;
 end loop; counts:=jsonb_set(counts,'{milestones}',to_jsonb(n));

 n:=0; for item in select * from jsonb_array_elements(coalesce(res->'nexus_actions','[]'::jsonb)) loop
   insert into public.nexus_tasks(company_id,project_id,title,description,assignee,status,priority,created_by,notify_client,task_type,phase,source_diagnosis_run_id)
   values(r.company_id,proj,coalesce(nullif(item->>'title',''),'Nexus action'),item->>'description','nexus','not_started',coalesce(nullif(item->>'priority',''),'normal'),auth.uid(),false,'diagnosis_action','diagnosis',r.id)
   on conflict (source_diagnosis_run_id,title,assignee) where source_diagnosis_run_id is not null do nothing; if found then n:=n+1; end if;
 end loop; counts:=jsonb_set(counts,'{nexus_tasks}',to_jsonb(n));

 n:=0; for item in select * from jsonb_array_elements(coalesce(res->'client_action_items','[]'::jsonb)) loop
   insert into public.nexus_tasks(company_id,project_id,title,description,assignee,status,priority,created_by,notify_client,task_type,phase,source_diagnosis_run_id)
   values(r.company_id,proj,coalesce(nullif(item->>'title',''),'Client action'),item->>'description','client','not_started',coalesce(nullif(item->>'priority',''),'normal'),auth.uid(),true,'diagnosis_action','diagnosis',r.id)
   on conflict (source_diagnosis_run_id,title,assignee) where source_diagnosis_run_id is not null do update set status=case when public.nexus_tasks.status='draft' then 'not_started' else public.nexus_tasks.status end,notify_client=true,updated_at=now();
   if found then n:=n+1; end if;
 end loop; counts:=jsonb_set(counts,'{client_actions}',to_jsonb(n));

 n:=0; for item in select * from jsonb_array_elements(coalesce(res->'document_requests','[]'::jsonb)) loop
   owner_scope:=private.nexus_diagnosis_document_owner(item->>'title',item->>'purpose',item->>'examples');
   insert into public.nexus_document_requests(company_id,project_id,title,purpose,examples,redaction_guidance,sensitivity,status,requested_by,source_diagnosis_run_id,owner_scope)
   values(r.company_id,proj,coalesce(nullif(item->>'title',''),'Supporting evidence'),item->>'purpose',item->>'examples',item->>'redaction_guidance',coalesce(nullif(item->>'sensitivity',''),'standard'),'requested',auth.uid(),r.id,owner_scope)
   on conflict (source_diagnosis_run_id,title) where source_diagnosis_run_id is not null do update set owner_scope=excluded.owner_scope,status=case when public.nexus_document_requests.status='draft' then 'requested' else public.nexus_document_requests.status end,updated_at=now();
   if found then n:=n+1; end if;
 end loop; counts:=jsonb_set(counts,'{document_requests}',to_jsonb(n));

 n:=0; for item in select * from jsonb_array_elements(coalesce(res->'decision_items','[]'::jsonb)) loop
   insert into public.nexus_approvals(company_id,project_id,title,description,status,requested_by,approval_type,source_diagnosis_run_id)
   values(r.company_id,proj,coalesce(nullif(item->>'title',''),'Decision required'),item->>'description','draft',auth.uid(),'diagnosis_decision',r.id)
   on conflict (source_diagnosis_run_id,title) where source_diagnosis_run_id is not null do nothing; if found then n:=n+1; end if;
 end loop; counts:=jsonb_set(counts,'{approvals}',to_jsonb(n));

 n:=0; for item in select * from jsonb_array_elements(coalesce(res->'baseline_measurements','[]'::jsonb)) loop
   insert into public.nexus_metrics(company_id,project_id,name,unit,baseline_value,measurement_method,notes,created_by,evidence,confidence,metric_type,source_diagnosis_run_id)
   values(r.company_id,proj,coalesce(nullif(item->>'name',''),'Baseline metric'),item->>'unit',private.nexus_try_numeric(item->'baseline_value'),item->>'measurement_method',case when item ? 'baseline_value' and private.nexus_try_numeric(item->'baseline_value') is null and nullif(btrim(item->>'baseline_value'),'') is not null then concat_ws(E'\n',nullif(item->>'notes',''),concat('Qualitative baseline: ',item->>'baseline_value')) else item->>'notes' end,auth.uid(),item->>'evidence',coalesce(nullif(item->>'confidence',''),'unrated'),'baseline',r.id)
   on conflict (source_diagnosis_run_id,name) where source_diagnosis_run_id is not null do nothing; if found then n:=n+1; end if;
 end loop; counts:=jsonb_set(counts,'{metrics}',to_jsonb(n));

 update public.nexus_active_engagements set project_id=proj,updated_by=auth.uid(),updated_at=now() where company_id=r.company_id;
 if not found then insert into public.nexus_active_engagements(company_id,project_id,updated_by,updated_at) values(r.company_id,proj,auth.uid(),now()); end if;
 update public.nexus_diagnosis_runs set project_id=proj,status='approved',approved_at=now(),approved_by=auth.uid(),review_notes=coalesce(nullif(trim(coalesce(p_note,'')),''),review_notes),orchestrated_at=now(),orchestration_summary=counts,updated_at=now() where id=r.id;
 insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary) values(r.company_id,auth.uid(),'diagnosis_approved','diagnosis_run',r.id,'Approved diagnosis, promoted the generated implementation project, activated client-owned actions and routed evidence requests by owner.');
 return counts;
end
$function$;

update public.nexus_tasks
set status='not_started',notify_client=true,updated_at=now()
where source_diagnosis_run_id is not null and assignee='client' and task_type='diagnosis_action' and status='draft';

update public.nexus_document_requests
set owner_scope=private.nexus_diagnosis_document_owner(title,purpose,examples),
    status=case when status='draft' then 'requested' else status end,
    updated_at=now()
where source_diagnosis_run_id is not null;

with latest as (
  select distinct on (r.company_id) r.company_id,r.id run_id,p.id project_id,r.approved_by
  from public.nexus_diagnosis_runs r
  join public.nexus_projects p on p.source_diagnosis_run_id=r.id and p.project_type='diagnosis_pilot'
  where r.status='approved'
  order by r.company_id,coalesce(r.approved_at,r.updated_at) desc
)
insert into public.nexus_active_engagements(company_id,project_id,updated_by,updated_at)
select company_id,project_id,approved_by,now() from latest
on conflict (company_id) do update set project_id=excluded.project_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at;

with latest as (
  select distinct on (r.company_id) r.id run_id,p.id project_id
  from public.nexus_diagnosis_runs r
  join public.nexus_projects p on p.source_diagnosis_run_id=r.id and p.project_type='diagnosis_pilot'
  where r.status='approved'
  order by r.company_id,coalesce(r.approved_at,r.updated_at) desc
)
update public.nexus_diagnosis_runs r
set project_id=l.project_id,updated_at=now()
from latest l
where r.id=l.run_id and r.project_id is distinct from l.project_id;
