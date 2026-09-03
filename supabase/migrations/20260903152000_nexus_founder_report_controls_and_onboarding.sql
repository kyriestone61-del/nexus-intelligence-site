-- Nexus highlighted-items Phase 2
-- 1) Preserve the immutable AI diagnosis while allowing audited founder edits to the client-facing report.
-- 2) Send a one-time workspace-ready notification when a company member is first activated.

create table if not exists public.nexus_diagnosis_report_adjustments (
  id uuid primary key default gen_random_uuid(),
  diagnosis_run_id uuid not null references public.nexus_diagnosis_runs(id) on delete cascade,
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in (
    'replace_executive_summary',
    'hide_opportunity',
    'rewrite_opportunity',
    'add_opportunity',
    'replace_first_move'
  )),
  target_key text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  constraint nexus_diagnosis_report_adjustment_target_ck check (
    (adjustment_type in ('hide_opportunity','rewrite_opportunity') and nullif(btrim(target_key),'') is not null)
    or adjustment_type not in ('hide_opportunity','rewrite_opportunity')
  )
);

create index if not exists nexus_diagnosis_report_adjustments_run_active_idx
  on public.nexus_diagnosis_report_adjustments(diagnosis_run_id,created_at,id)
  where revoked_at is null;

alter table public.nexus_diagnosis_report_adjustments enable row level security;
revoke all on public.nexus_diagnosis_report_adjustments from anon;
revoke all on public.nexus_diagnosis_report_adjustments from authenticated;
grant select on public.nexus_diagnosis_report_adjustments to authenticated;

drop policy if exists nexus_diagnosis_report_adjustments_admin_select on public.nexus_diagnosis_report_adjustments;
create policy nexus_diagnosis_report_adjustments_admin_select
on public.nexus_diagnosis_report_adjustments
for select
to authenticated
using (public.nexus_is_platform_admin());

create or replace function private.nexus_report_opportunity_matches(p_item jsonb,p_target text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case
    when p_target like 'rank:%' then coalesce(p_item->>'rank','')=substr(p_target,6)
    else coalesce(p_item->>'title','')=coalesce(p_target,'')
  end
$$;

revoke all on function private.nexus_report_opportunity_matches(jsonb,text) from public,anon,authenticated;

create or replace function public.nexus_effective_client_report(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_report jsonb;
  v_items jsonb;
  v_item jsonb;
  v_adj public.nexus_diagnosis_report_adjustments%rowtype;
  v_next_rank int;
begin
  if not public.nexus_is_platform_admin() then
    raise exception 'Nexus administrator access required';
  end if;

  select analysis_result into v_result
  from public.nexus_diagnosis_runs
  where id=p_run_id;

  if v_result is null then raise exception 'Diagnosis has no analysis result'; end if;
  v_report:=public.nexus_client_report_projection(v_result);

  for v_adj in
    select *
    from public.nexus_diagnosis_report_adjustments
    where diagnosis_run_id=p_run_id and revoked_at is null
    order by created_at,id
  loop
    if v_adj.adjustment_type='replace_executive_summary' then
      if nullif(btrim(v_adj.payload->>'text'),'') is not null then
        v_report:=jsonb_set(v_report,'{executive_summary}',to_jsonb(v_adj.payload->>'text'),true);
      end if;

    elsif v_adj.adjustment_type='hide_opportunity' then
      select coalesce(jsonb_agg(x.item order by x.ord),'[]'::jsonb) into v_items
      from jsonb_array_elements(coalesce(v_report->'opportunity_backlog','[]'::jsonb)) with ordinality x(item,ord)
      where not private.nexus_report_opportunity_matches(x.item,v_adj.target_key);
      v_report:=jsonb_set(v_report,'{opportunity_backlog}',v_items,true);

    elsif v_adj.adjustment_type='rewrite_opportunity' then
      select coalesce(jsonb_agg(
        case when private.nexus_report_opportunity_matches(x.item,v_adj.target_key) then
          jsonb_strip_nulls(
            x.item || jsonb_build_object(
              'title',coalesce(nullif(btrim(v_adj.payload->>'title'),''),x.item->>'title'),
              'problem',coalesce(nullif(btrim(v_adj.payload->>'problem'),''),x.item->>'problem'),
              'recommendation',coalesce(nullif(btrim(v_adj.payload->>'recommendation'),''),x.item->>'recommendation')
            )
          )
        else x.item end
        order by x.ord
      ),'[]'::jsonb) into v_items
      from jsonb_array_elements(coalesce(v_report->'opportunity_backlog','[]'::jsonb)) with ordinality x(item,ord);
      v_report:=jsonb_set(v_report,'{opportunity_backlog}',v_items,true);

    elsif v_adj.adjustment_type='add_opportunity' then
      if nullif(btrim(v_adj.payload->>'title'),'') is not null and nullif(btrim(v_adj.payload->>'recommendation'),'') is not null then
        v_next_rank:=jsonb_array_length(coalesce(v_report->'opportunity_backlog','[]'::jsonb))+1;
        v_item:=jsonb_strip_nulls(jsonb_build_object(
          'rank',v_next_rank,
          'title',v_adj.payload->>'title',
          'problem',nullif(btrim(v_adj.payload->>'problem'),''),
          'recommendation',v_adj.payload->>'recommendation',
          'human_controls',case when jsonb_typeof(v_adj.payload->'human_controls')='array' then v_adj.payload->'human_controls' else '[]'::jsonb end
        ));
        v_report:=jsonb_set(v_report,'{opportunity_backlog}',coalesce(v_report->'opportunity_backlog','[]'::jsonb)||jsonb_build_array(v_item),true);
      end if;

    elsif v_adj.adjustment_type='replace_first_move' then
      v_item:=coalesce(v_report->'smallest_safe_pilot','{}'::jsonb);
      if nullif(btrim(v_adj.payload->>'title'),'') is not null then
        v_item:=jsonb_set(v_item,'{title}',to_jsonb(v_adj.payload->>'title'),true);
      end if;
      if nullif(btrim(v_adj.payload->>'summary'),'') is not null then
        v_item:=jsonb_set(v_item,'{summary}',to_jsonb(v_adj.payload->>'summary'),true);
      end if;
      v_report:=jsonb_set(v_report,'{smallest_safe_pilot}',v_item,true);
    end if;
  end loop;

  return v_report;
end
$$;

revoke all on function public.nexus_effective_client_report(uuid) from public,anon;
grant execute on function public.nexus_effective_client_report(uuid) to authenticated;

create or replace function public.nexus_preview_diagnosis_client_report(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.nexus_diagnosis_runs%rowtype;
  v_adjustments jsonb;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v_run from public.nexus_diagnosis_runs where id=p_run_id;
  if v_run.id is null then raise exception 'Diagnosis run not found'; end if;
  if v_run.analysis_result is null then raise exception 'Diagnosis has no analysis result'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'adjustment_type',a.adjustment_type,
    'target_key',a.target_key,
    'payload',a.payload,
    'reason',a.reason,
    'created_at',a.created_at
  ) order by a.created_at,a.id),'[]'::jsonb)
  into v_adjustments
  from public.nexus_diagnosis_report_adjustments a
  where a.diagnosis_run_id=p_run_id and a.revoked_at is null;

  return jsonb_build_object(
    'run_id',v_run.id,
    'status',v_run.status,
    'report',public.nexus_effective_client_report(p_run_id),
    'adjustments',v_adjustments
  );
end
$$;

revoke all on function public.nexus_preview_diagnosis_client_report(uuid) from public,anon;
grant execute on function public.nexus_preview_diagnosis_client_report(uuid) to authenticated;

create or replace function public.nexus_add_diagnosis_report_adjustment(
  p_run_id uuid,
  p_adjustment_type text,
  p_target_key text default null,
  p_payload jsonb default '{}'::jsonb,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.nexus_diagnosis_runs%rowtype;
  v_id uuid;
  v_type text:=lower(btrim(coalesce(p_adjustment_type,'')));
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v_run from public.nexus_diagnosis_runs where id=p_run_id for update;
  if v_run.id is null then raise exception 'Diagnosis run not found'; end if;
  if v_run.analysis_result is null then raise exception 'Diagnosis has no analysis result'; end if;
  if v_run.status not in ('ready_for_review','in_review','approved') then raise exception 'Diagnosis must be reviewable before client-report adjustments can be saved'; end if;
  if v_type not in ('replace_executive_summary','hide_opportunity','rewrite_opportunity','add_opportunity','replace_first_move') then raise exception 'Invalid report adjustment type'; end if;
  if jsonb_typeof(v_payload)<>'object' then raise exception 'Adjustment payload must be an object'; end if;
  if v_type in ('hide_opportunity','rewrite_opportunity') and nullif(btrim(coalesce(p_target_key,'')),'') is null then raise exception 'Opportunity target is required'; end if;
  if v_type='replace_executive_summary' and nullif(btrim(v_payload->>'text'),'') is null then raise exception 'Executive summary text is required'; end if;
  if v_type='add_opportunity' and (nullif(btrim(v_payload->>'title'),'') is null or nullif(btrim(v_payload->>'recommendation'),'') is null) then raise exception 'Founder recommendation title and recommendation are required'; end if;
  if v_type='replace_first_move' and nullif(btrim(v_payload->>'title'),'') is null and nullif(btrim(v_payload->>'summary'),'') is null then raise exception 'First-move title or summary is required'; end if;

  insert into public.nexus_diagnosis_report_adjustments(
    diagnosis_run_id,company_id,adjustment_type,target_key,payload,reason,created_by
  ) values(
    v_run.id,v_run.company_id,v_type,nullif(btrim(coalesce(p_target_key,'')),''),v_payload,nullif(btrim(coalesce(p_reason,'')),''),auth.uid()
  ) returning id into v_id;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v_run.company_id,auth.uid(),'diagnosis_report_adjusted','diagnosis_run',v_run.id,'Founder saved an audited client-report adjustment: '||v_type||'.');

  return v_id;
end
$$;

revoke all on function public.nexus_add_diagnosis_report_adjustment(uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.nexus_add_diagnosis_report_adjustment(uuid,text,text,jsonb,text) to authenticated;

create or replace function public.nexus_revoke_diagnosis_report_adjustment(p_adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_adj public.nexus_diagnosis_report_adjustments%rowtype;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v_adj from public.nexus_diagnosis_report_adjustments where id=p_adjustment_id for update;
  if v_adj.id is null then raise exception 'Report adjustment not found'; end if;
  if v_adj.revoked_at is null then
    update public.nexus_diagnosis_report_adjustments
    set revoked_at=now(),revoked_by=auth.uid()
    where id=v_adj.id;
    insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(v_adj.company_id,auth.uid(),'diagnosis_report_adjustment_revoked','diagnosis_run',v_adj.diagnosis_run_id,'Founder restored the client report by revoking an adjustment.');
  end if;
end
$$;

revoke all on function public.nexus_revoke_diagnosis_report_adjustment(uuid) from public,anon;
grant execute on function public.nexus_revoke_diagnosis_report_adjustment(uuid) to authenticated;

-- The report release now freezes the founder-reviewed effective client report, not the immutable raw AI result.
create or replace function public.nexus_release_diagnosis_report(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.nexus_diagnosis_runs%rowtype;
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_member record;
  v_pref public.nexus_notification_preferences%rowtype;
  v_email text;
  v_phone text;
  v_action text;
  v_client_report jsonb;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v_run from public.nexus_diagnosis_runs where id=p_run_id for update;
  if v_run.id is null then raise exception 'Diagnosis not found'; end if;
  if v_run.status <> 'approved' or v_run.analysis_result is null then raise exception 'Only an approved diagnosis can be released'; end if;

  v_client_report:=public.nexus_effective_client_report(v_run.id);

  insert into public.nexus_diagnosis_report_releases(
    company_id,project_id,diagnosis_run_id,client_report,status,report_version,released_by,released_at,updated_at
  ) values(
    v_run.company_id,v_run.project_id,v_run.id,v_client_report,'released',1,auth.uid(),now(),now()
  )
  on conflict(diagnosis_run_id) do update set
    client_report=excluded.client_report,
    status='released',
    report_version=public.nexus_diagnosis_report_releases.report_version+1,
    released_by=auth.uid(),released_at=now(),revoked_at=null,updated_at=now()
  returning * into v_release;

  v_action := '/portal?view=diagnosis-report&release='||v_release.id::text;
  for v_member in select m.user_id from public.nexus_company_members m where m.company_id=v_run.company_id and m.active is true loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v_run.company_id,v_member.user_id,'diagnosis_report','Your Nexus diagnosis report is ready','Nexus has released a client report for your review. Open it to review the findings and ask questions.','diagnosis_report_release',v_release.id,auth.uid(),v_action);

    select * into v_pref from public.nexus_notification_preferences where company_id=v_run.company_id and user_id=v_member.user_id;
    select email into v_email from auth.users where id=v_member.user_id;
    select phone into v_phone from public.nexus_profiles where user_id=v_member.user_id;

    if v_email is not null and coalesce(v_pref.email_enabled,true) and coalesce(v_pref.report_emails,true) then
      insert into public.nexus_email_outbox(company_id,user_id,recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,dedupe_key)
      values(v_run.company_id,v_member.user_id,v_email,'diagnosis_report','Your Nexus diagnosis report is ready','Nexus has released your diagnosis report. Review the findings in your secure workspace and submit any questions directly from the report.',v_action,'diagnosis_report_release',v_release.id,'diagnosis_report:'||v_release.id::text||':'||v_member.user_id::text||':v'||v_release.report_version::text)
      on conflict(dedupe_key) do nothing;
    end if;

    if nullif(btrim(v_phone),'') is not null and coalesce(v_pref.sms_enabled,false) and coalesce(v_pref.report_sms,true) then
      insert into public.nexus_sms_outbox(company_id,user_id,recipient_phone,message_kind,body_text,action_url,related_type,related_id,dedupe_key)
      values(v_run.company_id,v_member.user_id,v_phone,'diagnosis_report','Nexus Intelligence: your diagnosis report is ready in your secure workspace.',v_action,'diagnosis_report_release',v_release.id,'diagnosis_report:'||v_release.id::text||':'||v_member.user_id::text||':v'||v_release.report_version::text)
      on conflict(dedupe_key) do nothing;
    end if;
  end loop;
  return v_release.id;
end
$$;

revoke all on function public.nexus_release_diagnosis_report(uuid) from public,anon;
grant execute on function public.nexus_release_diagnosis_report(uuid) to authenticated;

-- One-time onboarding notice for newly activated company members. Existing active memberships are not backfilled.
create or replace function private.nexus_notify_new_company_member()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_task_title text;
  v_message text;
begin
  if new.active is not true then return new; end if;
  if tg_op='UPDATE' and old.active is true then return new; end if;

  select t.title into v_task_title
  from private.nexus_client_action_context_unchecked(new.company_id) ctx
  join public.nexus_tasks t on t.id=ctx.task_id
  where ctx.canonical_state='WAITING_ON_YOU'
  order by case lower(coalesce(t.priority,'normal')) when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
           t.due_date nulls last,t.created_at
  limit 1;

  v_message:=case when nullif(btrim(coalesce(v_task_title,'')),'') is not null
    then 'Your Nexus workspace is ready. Your first available step is “'||v_task_title||'”. Open Today to complete it; Nexus will surface later responsibilities only when they are ready.'
    else 'Your Nexus workspace is ready. Open Today for the current next step. Nexus will surface tasks, requests, approvals, and responsibilities as they become ready.'
  end;

  if not exists (
    select 1 from public.nexus_notifications n
    where n.company_id=new.company_id and n.user_id=new.user_id
      and n.notification_type='workspace_ready' and n.related_type='company_onboarding' and n.related_id=new.company_id
  ) then
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(new.company_id,new.user_id,'workspace_ready','Your Nexus workspace is ready',v_message,'company_onboarding',new.company_id,new.added_by,'/portal');
  end if;

  perform private.nexus_enqueue_member_email(
    new.user_id,new.company_id,'onboarding','Your Nexus workspace is ready',v_message,
    '/portal','company_onboarding',new.company_id,
    'company_onboarding:'||new.company_id::text||':'||new.user_id::text,
    jsonb_build_object('member_role',new.member_role,'first_task',v_task_title)
  );

  return new;
end
$$;

revoke all on function private.nexus_notify_new_company_member() from public,anon,authenticated;

drop trigger if exists nexus_company_member_onboarding_notice on public.nexus_company_members;
create trigger nexus_company_member_onboarding_notice
after insert or update of active on public.nexus_company_members
for each row execute function private.nexus_notify_new_company_member();
