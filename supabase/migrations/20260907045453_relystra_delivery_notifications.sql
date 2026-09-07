begin;
alter table public.nexus_delivery_settings add column delivery_emails_enabled boolean not null default false;
alter table public.nexus_notifications add column delivery_event_key text unique;

-- Reuse the existing inbox and email outbox. A transition/version has one notification per recipient.
create or replace function private.relystra_notify_once(p_company uuid,p_audience text,p_event text,p_entity text,p_id uuid,p_title text,p_message text,p_section text,p_live boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid; inserted_id uuid; event_key text; action_url text; send_email boolean; project_id uuid;
begin
  if p_audience not in ('client','admin','both') then raise exception 'Invalid notification audience'; end if;
  action_url:='/portal?company='||p_company::text||'&section='||p_section;
  if p_entity='project' then select id into project_id from public.nexus_projects where id=p_id and company_id=p_company;
  elsif p_entity='build' then select b.project_id into project_id from public.nexus_system_cards b where b.id=p_id and b.company_id=p_company;
  elsif p_entity='client_request' then select r.project_id into project_id from public.nexus_client_requests r where r.id=p_id and r.company_id=p_company; end if;
  if project_id is not null then action_url:=action_url||'&project='||project_id::text; end if;
  select s.delivery_emails_enabled and p_live and c.name !~* '(nexus|relystra)[ _-]*qa|qa[ _-]*test'
    into send_email from public.nexus_delivery_settings s cross join public.nexus_companies c where c.id=p_company;
  for recipient in
    select m.user_id from public.nexus_company_members m where m.company_id=p_company and m.active and p_audience in ('client','both')
    union select a.user_id from public.nexus_platform_admins a where p_audience in ('admin','both')
  loop
    event_key:='relystra:'||p_event||':'||recipient::text;
    inserted_id:=null;
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url,delivery_event_key)
      values(p_company,recipient,'delivery',p_title,p_message,p_entity,p_id,auth.uid(),action_url,event_key)
      on conflict(delivery_event_key) do nothing returning id into inserted_id;
    if inserted_id is not null and send_email then
      perform private.nexus_enqueue_member_email(recipient,p_company,'approval',p_title,p_message,action_url,p_entity,p_id,event_key,jsonb_build_object('delivery_event',p_event));
    end if;
  end loop;
end $$;

create or replace function private.relystra_notify_delivery_transition()
returns trigger language plpgsql security definer set search_path='' as $$
declare live boolean:=false; project public.nexus_projects%rowtype;
begin
  if tg_table_name='nexus_build_plans' then
    if new.purchase_kind='diagnosis' and new.status='paid' and old.status is distinct from 'paid' then
      select e.livemode into live from public.nexus_delivery_payment_events e where e.plan_id=new.id limit 1;
      perform private.relystra_notify_once(new.company_id,'both','payment:'||new.id,'build_plan',new.id,
        case when live then 'Payment confirmed' else 'Test payment confirmed' end,
        case when new.purchase_kind='diagnosis' then 'Diagnosis access is ready. Open Diagnosis to continue.' else 'Your Build Package is activated. Relystra will review the Build Briefs before starting work.' end,
        case when new.purchase_kind='diagnosis' then 'diagnosis' else 'progress' end,live);
    end if;
  elsif tg_table_name='nexus_projects' then
    if new.project_type<>'build_package' then return new; end if;
    if tg_op='INSERT' then
      perform private.relystra_notify_once(new.company_id,'both','payment:'||new.build_plan_id,'project',new.id,
        case when new.payment_livemode then 'Payment confirmed' else 'Test payment confirmed' end,
        'Your Build Package is activated. Relystra will review the Build Briefs before starting work.','progress',new.payment_livemode);
      return new;
    end if;
    if new.draft_package is distinct from old.draft_package and new.draft_package is not null then
      perform private.relystra_notify_once(new.company_id,'client','draft:'||(new.draft_package->>'id'),'project',new.id,'Your draft is ready for review',
        'Test each Build, then approve it or describe a correction. Relystra will review any requested scope change.','progress',new.payment_livemode);
    end if;
    if new.final_package is distinct from old.final_package and new.final_package is not null then
      perform private.relystra_notify_once(new.company_id,'client','final:'||(new.final_package->>'id'),'project',new.id,'Your Final Package is ready',
        'Your Builds, tutorials and FAQs are available. Seven days of light support start with this handoff.','final-package',new.payment_livemode);
    end if;
    if new.package_stage='completed' and old.package_stage is distinct from 'completed' then
      perform private.relystra_notify_once(new.company_id,'client','support-ended:'||new.id,'project',new.id,'Your support period has ended',
        'Your delivered Builds, guides, FAQs and support history remain available. Open support requests remain on record.','support',new.payment_livemode);
    end if;
  elsif tg_table_name='nexus_system_cards' then
    if new.client_review is distinct from old.client_review and new.client_review is not null then
      select * into project from public.nexus_projects where id=new.project_id;
      perform private.relystra_notify_once(new.company_id,'admin','review:'||new.id||':'||md5(new.client_review::text),'build',new.id,'Client Build review received',
        'Review the client decision and feedback before continuing delivery.','progress',project.payment_livemode);
    end if;
  elsif tg_table_name='nexus_client_requests' then
    if new.support_context is null then return new; end if;
    select * into project from public.nexus_projects where id=new.project_id;
    if tg_op='INSERT' then
      if new.support_context->>'escalated'='true' then
        perform private.relystra_notify_once(new.company_id,'admin','support-request:'||new.id,'client_request',new.id,'Support question needs review',
          'The delivered sources could not answer this question. Review the Support Request.','support',project.payment_livemode);
      end if;
    elsif new.support_answer is distinct from old.support_answer and new.support_answered_by is not null then
      perform private.relystra_notify_once(new.company_id,'client','support-answer:'||new.id||':'||md5(new.support_answer),'client_request',new.id,'Relystra answered your support question',
        'Open Support to read the response.','support',project.payment_livemode);
    end if;
  end if;
  return new;
end $$;
create trigger relystra_payment_notice after update on public.nexus_build_plans for each row execute function private.relystra_notify_delivery_transition();
create trigger relystra_package_notice after insert or update on public.nexus_projects for each row execute function private.relystra_notify_delivery_transition();
create trigger relystra_review_notice after update on public.nexus_system_cards for each row execute function private.relystra_notify_delivery_transition();
create trigger relystra_support_notice after insert or update on public.nexus_client_requests for each row execute function private.relystra_notify_delivery_transition();

create or replace function private.relystra_notify_action_transition()
returns trigger language plpgsql security definer set search_path='' as $$
declare task public.nexus_tasks%rowtype; ready boolean; live boolean;
begin
  if new.work_kind<>'prebuild_action' then return new; end if;
  select e.livemode into live from public.nexus_build_plans p join public.nexus_delivery_payment_events e on e.plan_id=p.id
    where p.company_id=new.company_id and p.purchase_kind='diagnosis' and p.status='paid' order by p.paid_at desc limit 1;
  if new.status='ready_for_review' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.relystra_notify_once(new.company_id,'admin','action-review:'||new.id||':'||new.updated_at,'task',new.id,
      'Action response needs review','Review the submitted response before it becomes an accepted Build input.','actions',coalesce(live,false));
  end if;
  -- Scan dependents as well as the changed Action so approval of an upstream response releases the next input request.
  for task in select * from public.nexus_tasks where company_id=new.company_id and work_kind='prebuild_action'
    and (id=new.id or dependency_task_id=new.id) and responsible_party='client' and action_review_state='approved'
    and archived_at is null and notify_client and status in ('open','waiting_on_client','not_started','needs_revision')
  loop
    ready:=task.dependency_task_id is null or exists(select 1 from public.nexus_tasks d where d.id=task.dependency_task_id and d.company_id=task.company_id and d.archived_at is null and d.status in ('approved','completed','done','not_applicable'));
    if ready then
      perform private.relystra_notify_once(task.company_id,'client','action-input:'||task.id||':'||coalesce(task.reviewed_at::text,task.approved_at::text,'approved'),
        'task',task.id,case when task.status='needs_revision' then 'An Action needs clarification' else 'Your input is needed' end,
        task.title||'. Open Actions to provide the requested information.','actions',coalesce(live,false));
    end if;
  end loop;
  return new;
end $$;
create trigger relystra_action_notice after insert or update on public.nexus_tasks for each row execute function private.relystra_notify_action_transition();

-- Existing notification owners continue for historical work only.
drop trigger if exists nexus_client_task_notifications on public.nexus_tasks;
create trigger nexus_client_task_notifications after insert or update of status,notify_client on public.nexus_tasks
  for each row when (new.work_kind='legacy') execute function private.nexus_notify_client_on_task();
drop trigger if exists nexus_release_unblocked_client_tasks on public.nexus_tasks;
create trigger nexus_release_unblocked_client_tasks after update of status on public.nexus_tasks
  for each row when (new.work_kind='legacy') execute function private.nexus_notify_newly_unblocked_client_tasks();

revoke all on function private.relystra_notify_once(uuid,text,text,text,uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function private.relystra_notify_delivery_transition() from public,anon,authenticated;
revoke all on function private.relystra_notify_action_transition() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.nexus_approve_task(p_task_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.nexus_tasks%rowtype;
  m record;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be approved'; end if;
  if v.status <> 'ready_for_review' then raise exception 'Task is not ready for review'; end if;

  update public.nexus_tasks
  set status='completed',assignee='nexus',owner_scope='nexus',review_note=nullif(trim(coalesce(p_note,'')),''),reviewed_at=now(),completed_at=now(),updated_at=now()
  where id=p_task_id;

  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true and v.work_kind='legacy' loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,m.user_id,'task_approved','Step approved: '||v.title,'Relystra reviewed and completed this step.','task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_approved','task',v.id,'Relystra approved step: '||v.title);
  return v.id;
end
$function$;

CREATE OR REPLACE FUNCTION public.nexus_request_task_revision(p_task_id uuid, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.nexus_tasks%rowtype;
  m record;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be revised'; end if;
  if v.status <> 'ready_for_review' then raise exception 'Task is not ready for review'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Revision note is required'; end if;

  update public.nexus_tasks
  set status='needs_revision',assignee=case when v.work_kind='prebuild_action' and v.responsible_party in ('admin','ai') then 'nexus' else 'client' end,owner_scope=case when v.work_kind='prebuild_action' and v.responsible_party in ('admin','ai') then 'nexus' else 'client' end,review_note=trim(p_note),reviewed_at=now(),updated_at=now(),notify_client=(v.work_kind='legacy' or v.responsible_party='client')
  where id=p_task_id;

  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true and v.work_kind='legacy' loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,m.user_id,'task_revision','Changes requested: '||v.title,trim(p_note),'task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_revision_requested','task',v.id,'Revision requested: '||v.title);
  return v.id;
end
$function$;


commit;
