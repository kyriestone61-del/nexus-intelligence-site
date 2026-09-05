-- RELYSTRA Phase Zero: enforce one complete client lifecycle from commercial close
-- through implementation, QA, measured result, handoff, client acceptance, and completion.
-- This is intentionally additive/backward-compatible with the existing Nexus-prefixed schema.

-- 1) Expand the canonical engagement-stage vocabulary while retaining legacy aliases
-- because older functions can still write build_test/launch inside the same transaction.
alter table public.nexus_projects drop constraint if exists nexus_projects_engagement_stage_check;
update public.nexus_projects set engagement_stage='implementation' where engagement_stage='build_test';
update public.nexus_projects set engagement_stage='acceptance' where engagement_stage='launch';
alter table public.nexus_projects add constraint nexus_projects_engagement_stage_check check (
  engagement_stage = any(array[
    'discovery'::text,'diagnosis'::text,'commercial'::text,'onboarding'::text,
    'implementation'::text,'verification'::text,'measurement'::text,
    'acceptance'::text,'complete'::text,
    -- Legacy aliases retained only so older server functions cannot hard-fail before
    -- the Phase Zero wrapper normalizes the transaction.
    'build_test'::text,'launch'::text
  ])
);

-- 2) One authoritative record per project/gate. No direct client writes: state changes
-- are made only through SECURITY DEFINER RPCs with explicit authorization and validation.
create table if not exists public.nexus_engagement_gate_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  project_id uuid not null references public.nexus_projects(id) on delete cascade,
  gate_code text not null check (gate_code = any(array[
    'scope_signed'::text,'payment_confirmed'::text,'onboarding_complete'::text,
    'implementation_complete'::text,'qa_passed'::text,'measurement_complete'::text,
    'handoff_complete'::text,'client_accepted'::text
  ])),
  status text not null default 'pending' check (status = any(array['pending'::text,'passed'::text,'failed'::text])),
  evidence_ref text,
  evidence jsonb not null default '{}'::jsonb,
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,gate_code)
);
create index if not exists nexus_engagement_gate_records_company_project_idx
  on public.nexus_engagement_gate_records(company_id,project_id,gate_code);

alter table public.nexus_engagement_gate_records enable row level security;
drop policy if exists "relystra members view engagement gates" on public.nexus_engagement_gate_records;
create policy "relystra members view engagement gates"
  on public.nexus_engagement_gate_records for select to authenticated
  using (public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));
revoke all on public.nexus_engagement_gate_records from anon;
revoke insert,update,delete on public.nexus_engagement_gate_records from authenticated;
grant select on public.nexus_engagement_gate_records to authenticated;

create or replace function private.nexus_phase_zero_stage_position(p_stage text)
returns integer
language sql
immutable
set search_path to ''
as $function$
  select case lower(coalesce(p_stage,''))
    when 'discovery' then 1
    when 'diagnosis' then 2
    when 'commercial' then 3
    when 'onboarding' then 4
    when 'implementation' then 5
    when 'build_test' then 5
    when 'verification' then 6
    when 'measurement' then 7
    when 'acceptance' then 8
    when 'launch' then 8
    when 'complete' then 9
    else null end;
$function$;

create or replace function private.nexus_phase_zero_has_gate(p_project_id uuid,p_gate_code text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists(
    select 1 from public.nexus_engagement_gate_records g
    where g.project_id=p_project_id and g.gate_code=p_gate_code and g.status='passed'
  );
$function$;

-- The only place that automatically moves Phase Zero forward. It never skips a stage.
create or replace function private.nexus_phase_zero_try_advance(p_project_id uuid)
returns public.nexus_projects
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p public.nexus_projects%rowtype;
  v_advanced boolean;
  m record;
begin
  select * into p from public.nexus_projects where id=p_project_id for update;
  if p.id is null then raise exception 'Project not found'; end if;

  loop
    v_advanced:=false;

    if p.engagement_stage='commercial'
       and private.nexus_phase_zero_has_gate(p.id,'scope_signed')
       and private.nexus_phase_zero_has_gate(p.id,'payment_confirmed') then
      update public.nexus_projects
      set engagement_stage='onboarding',status='active',
          client_status_update='Commercial close verified. Kickoff and implementation readiness are next.',
          client_status_updated_at=now(),updated_at=now()
      where id=p.id returning * into p;
      v_advanced:=true;

    elsif p.engagement_stage='onboarding'
       and private.nexus_phase_zero_has_gate(p.id,'onboarding_complete') then
      update public.nexus_projects
      set engagement_stage='implementation',status='active',
          client_status_update='Kickoff complete. Approved implementation work is now active.',
          client_status_updated_at=now(),updated_at=now()
      where id=p.id returning * into p;

      -- Only now release dependency-free client work. Downstream tasks remain blocked by
      -- their existing dependency chain. Relystra-owned work remains not_started so the
      -- admin action engine can start it explicitly.
      update public.nexus_tasks
      set status=case when owner_scope='client' then 'waiting_on_client' else 'not_started' end,
          notify_client=(owner_scope='client'),updated_at=now()
      where project_id=p.id and archived_at is null and dependency_task_id is null
        and status in ('not_started','open');

      for m in select user_id from public.nexus_company_members where company_id=p.company_id and active is true loop
        insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
        values(p.company_id,m.user_id,'implementation_ready','Implementation is ready',
          'Commercial close and kickoff are complete. Open Relystra to see the next dependency-cleared action.',
          'project',p.id,auth.uid(),'/portal');
      end loop;
      v_advanced:=true;

    elsif p.engagement_stage='implementation'
       and private.nexus_phase_zero_has_gate(p.id,'implementation_complete') then
      update public.nexus_projects
      set engagement_stage='verification',
          client_status_update='Implementation is complete. Relystra is verifying the delivered system against acceptance criteria.',
          client_status_updated_at=now(),updated_at=now()
      where id=p.id returning * into p;
      v_advanced:=true;

    elsif p.engagement_stage='verification'
       and private.nexus_phase_zero_has_gate(p.id,'qa_passed') then
      update public.nexus_projects
      set engagement_stage='measurement',
          client_status_update='QA passed. The next step is to measure the post-implementation result against the baseline.',
          client_status_updated_at=now(),updated_at=now()
      where id=p.id returning * into p;
      v_advanced:=true;

    elsif p.engagement_stage='measurement'
       and private.nexus_phase_zero_has_gate(p.id,'measurement_complete') then
      update public.nexus_projects
      set engagement_stage='acceptance',
          client_status_update='Measured results are ready for final handoff and client acceptance.',
          client_status_updated_at=now(),updated_at=now()
      where id=p.id returning * into p;
      for m in select user_id from public.nexus_company_members where company_id=p.company_id and active is true loop
        insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
        values(p.company_id,m.user_id,'engagement_acceptance_ready','Final review is ready',
          'Relystra has completed measurement. Review the result, handoff, and acceptance step in your workspace.',
          'project',p.id,auth.uid(),'/portal');
      end loop;
      v_advanced:=true;

    elsif p.engagement_stage='acceptance'
       and private.nexus_phase_zero_has_gate(p.id,'handoff_complete')
       and private.nexus_phase_zero_has_gate(p.id,'client_accepted') then
      update public.nexus_projects
      set engagement_stage='complete',status='complete',
          client_status_update='Engagement complete: implementation verified, result measured, handoff completed, and client acceptance recorded.',
          client_status_updated_at=now(),updated_at=now()
      where id=p.id returning * into p;
      v_advanced:=true;
    end if;

    exit when not v_advanced;
  end loop;
  return p;
end
$function$;

-- Wrap the existing governed Resolution Plan function so confirmed recommendations are
-- prepared but cannot become actionable implementation work until signed scope + payment.
create or replace function public.nexus_phase_zero_confirm_resolution_plan(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_summary jsonb;
  v_project_id uuid;
  v_company_id uuid;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;

  v_summary:=public.nexus_confirm_resolution_plan(p_run_id);
  select project_id,company_id into v_project_id,v_company_id
  from public.nexus_diagnosis_runs where id=p_run_id;
  if v_project_id is null then raise exception 'Confirmed plan did not produce a project'; end if;

  -- Freeze all generated execution actions before the transaction becomes visible.
  update public.nexus_tasks
  set status='not_started',notify_client=false,updated_at=now()
  where project_id=v_project_id and archived_at is null
    and source_diagnosis_run_id=p_run_id
    and status not in ('completed','approved','done','not_applicable','cancelled','canceled');

  update public.nexus_projects
  set engagement_stage='commercial',status='planning',
      client_status_update='Action plan confirmed. Signed scope and payment verification are required before kickoff.',
      client_status_updated_at=now(),client_status_updated_by=auth.uid(),updated_at=now()
  where id=v_project_id;

  v_summary:=coalesce(v_summary,'{}'::jsonb)||jsonb_build_object(
    'plan_status','commercial_gate',
    'project_id',v_project_id,
    'implementation_released',false,
    'required_gates',jsonb_build_array('scope_signed','payment_confirmed')
  );
  update public.nexus_diagnosis_runs set orchestration_summary=v_summary,updated_at=now() where id=p_run_id;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v_company_id,auth.uid(),'phase_zero_commercial_gate_opened','project',v_project_id,
    'Resolution plan confirmed. Implementation remains frozen until signed scope and payment are verified.');
  return v_summary;
end
$function$;

-- Generic admin gate recorder. client_accepted is deliberately excluded so internal
-- completion cannot be mistaken for customer acceptance.
create or replace function public.nexus_admin_record_engagement_gate(
  p_project_id uuid,
  p_gate_code text,
  p_status text default 'passed',
  p_evidence_ref text default null,
  p_note text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p public.nexus_projects%rowtype;
  v_gate text:=lower(btrim(coalesce(p_gate_code,'')));
  v_status text:=lower(btrim(coalesce(p_status,'passed')));
  v_open integer;
  v_total integer;
  v_measured integer;
  v_row public.nexus_engagement_gate_records%rowtype;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if v_gate not in ('scope_signed','payment_confirmed','onboarding_complete','implementation_complete','qa_passed','measurement_complete','handoff_complete') then
    raise exception 'Unsupported administrator gate';
  end if;
  if v_status not in ('passed','failed') then raise exception 'Gate status must be passed or failed'; end if;
  select * into p from public.nexus_projects where id=p_project_id for update;
  if p.id is null then raise exception 'Project not found'; end if;

  if v_status='passed' and v_gate in ('scope_signed','payment_confirmed','qa_passed')
     and nullif(btrim(coalesce(p_evidence_ref,'')),'') is null then
    raise exception 'This gate requires an evidence reference';
  end if;

  if v_status='passed' and v_gate='implementation_complete' then
    select count(*),count(*) filter(where status not in ('completed','approved','done','not_applicable','cancelled','canceled'))
      into v_total,v_open
    from public.nexus_tasks
    where project_id=p.id and archived_at is null and source_resolution_proposal_id is not null;
    if v_open>0 then raise exception 'Implementation cannot close while % governed action(s) remain open',v_open; end if;
    if v_total=0 and nullif(btrim(coalesce(p_evidence_ref,'')),'') is null then
      raise exception 'No governed implementation actions exist; provide an external implementation evidence reference';
    end if;
  end if;

  if v_status='passed' and v_gate='measurement_complete' then
    select
      (select count(*) from public.nexus_metrics m where m.project_id=p.id and m.current_value is not null and m.measured_at is not null)
      +(select count(*) from public.nexus_improvement_ledger l where l.project_id=p.id and nullif(btrim(coalesce(l.actual_result,'')),'') is not null)
      into v_measured;
    if coalesce(v_measured,0)<1 then
      raise exception 'Measurement cannot close until at least one post-implementation result is recorded';
    end if;
  end if;

  if v_status='passed' and v_gate='handoff_complete'
     and nullif(btrim(coalesce(p_evidence_ref,'')),'') is null
     and nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'Handoff completion requires a note or evidence reference';
  end if;

  insert into public.nexus_engagement_gate_records(company_id,project_id,gate_code,status,evidence_ref,evidence,note,recorded_by,recorded_at,updated_at)
  values(p.company_id,p.id,v_gate,v_status,nullif(btrim(coalesce(p_evidence_ref,'')),''),coalesce(p_evidence,'{}'::jsonb),
    nullif(btrim(coalesce(p_note,'')),''),auth.uid(),now(),now())
  on conflict(project_id,gate_code) do update set
    status=excluded.status,evidence_ref=excluded.evidence_ref,evidence=excluded.evidence,note=excluded.note,
    recorded_by=excluded.recorded_by,recorded_at=now(),updated_at=now()
  returning * into v_row;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(p.company_id,auth.uid(),'phase_zero_gate_'||v_status,'project',p.id,
    replace(v_gate,'_',' ')||' marked '||v_status||case when p_note is null then '' else ': '||left(p_note,180) end);

  if v_status='passed' then perform private.nexus_phase_zero_try_advance(p.id); end if;
  return public.nexus_get_phase_zero_status(p.id);
end
$function$;

-- Customer-owned final acceptance. A company member can accept only at the acceptance stage.
create or replace function public.nexus_client_accept_engagement(
  p_project_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p public.nexus_projects%rowtype;
  v_decision text:=lower(btrim(coalesce(p_decision,'')));
  a record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.nexus_projects where id=p_project_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if not public.nexus_is_company_member(p.company_id) then raise exception 'Company membership required'; end if;
  if p.engagement_stage<>'acceptance' then raise exception 'This engagement is not ready for final acceptance'; end if;
  if v_decision not in ('accepted','changes_requested') then raise exception 'Decision must be accepted or changes_requested'; end if;
  if v_decision='changes_requested' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Describe the requested change'; end if;

  insert into public.nexus_engagement_gate_records(company_id,project_id,gate_code,status,evidence_ref,evidence,note,recorded_by,recorded_at,updated_at)
  values(p.company_id,p.id,'client_accepted',case when v_decision='accepted' then 'passed' else 'failed' end,
    'portal-client-acceptance',jsonb_build_object('source','client_portal','decision',v_decision),
    nullif(btrim(coalesce(p_note,'')),''),auth.uid(),now(),now())
  on conflict(project_id,gate_code) do update set
    status=excluded.status,evidence_ref=excluded.evidence_ref,evidence=excluded.evidence,note=excluded.note,
    recorded_by=excluded.recorded_by,recorded_at=now(),updated_at=now();

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(p.company_id,auth.uid(),'phase_zero_client_'||v_decision,'project',p.id,
    case when v_decision='accepted' then 'Client accepted the measured delivery and closeout.' else 'Client requested changes during final acceptance.' end);

  if v_decision='accepted' then
    perform private.nexus_phase_zero_try_advance(p.id);
  else
    for a in select user_id from public.nexus_platform_admins loop
      insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      values(p.company_id,a.user_id,'client_changes_requested','Client requested changes',
        coalesce(nullif(btrim(p_note),''),'Review the engagement acceptance record.'),'project',p.id,auth.uid(),'/portal');
    end loop;
  end if;
  return public.nexus_get_phase_zero_status(p.id);
end
$function$;

-- Manual fallback when the client gives written acceptance outside the portal.
create or replace function public.nexus_admin_record_external_client_acceptance(
  p_project_id uuid,
  p_evidence_ref text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare p public.nexus_projects%rowtype;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into p from public.nexus_projects where id=p_project_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.engagement_stage<>'acceptance' then raise exception 'Project must be in acceptance before external acceptance can be recorded'; end if;
  if nullif(btrim(coalesce(p_evidence_ref,'')),'') is null then raise exception 'Written acceptance evidence reference is required'; end if;
  insert into public.nexus_engagement_gate_records(company_id,project_id,gate_code,status,evidence_ref,evidence,note,recorded_by,recorded_at,updated_at)
  values(p.company_id,p.id,'client_accepted','passed',btrim(p_evidence_ref),jsonb_build_object('source','external_written_acceptance'),
    nullif(btrim(coalesce(p_note,'')),''),auth.uid(),now(),now())
  on conflict(project_id,gate_code) do update set status='passed',evidence_ref=excluded.evidence_ref,evidence=excluded.evidence,
    note=excluded.note,recorded_by=excluded.recorded_by,recorded_at=now(),updated_at=now();
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(p.company_id,auth.uid(),'phase_zero_external_client_acceptance','project',p.id,'Recorded written client acceptance from external evidence: '||left(btrim(p_evidence_ref),160));
  perform private.nexus_phase_zero_try_advance(p.id);
  return public.nexus_get_phase_zero_status(p.id);
end
$function$;

-- Read model for both admin and client UI.
create or replace function public.nexus_get_phase_zero_status(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  p public.nexus_projects%rowtype;
  v_gates jsonb;
  v_open integer;
  v_total integer;
  v_measured integer;
  v_next text;
  v_stage text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.nexus_projects where id=p_project_id;
  if p.id is null then raise exception 'Project not found'; end if;
  if not public.nexus_is_platform_admin() and not public.nexus_is_company_member(p.company_id) then raise exception 'Project access denied'; end if;
  v_stage:=case p.engagement_stage when 'build_test' then 'implementation' when 'launch' then 'acceptance' else p.engagement_stage end;

  select jsonb_agg(jsonb_build_object(
    'gate_code',x.gate_code,'label',x.label,'status',coalesce(g.status,'pending'),
    'evidence_ref',g.evidence_ref,'note',g.note,'recorded_at',g.recorded_at,'recorded_by',g.recorded_by
  ) order by x.ord) into v_gates
  from (values
    (1,'scope_signed','Signed scope'),(2,'payment_confirmed','Payment confirmed'),(3,'onboarding_complete','Onboarding complete'),
    (4,'implementation_complete','Implementation complete'),(5,'qa_passed','QA passed'),(6,'measurement_complete','Measurement complete'),
    (7,'handoff_complete','Handoff complete'),(8,'client_accepted','Client accepted')
  ) as x(ord,gate_code,label)
  left join public.nexus_engagement_gate_records g on g.project_id=p.id and g.gate_code=x.gate_code;

  select count(*),count(*) filter(where status not in ('completed','approved','done','not_applicable','cancelled','canceled'))
  into v_total,v_open from public.nexus_tasks where project_id=p.id and archived_at is null and source_resolution_proposal_id is not null;
  select
    (select count(*) from public.nexus_metrics m where m.project_id=p.id and m.current_value is not null and m.measured_at is not null)
    +(select count(*) from public.nexus_improvement_ledger l where l.project_id=p.id and nullif(btrim(coalesce(l.actual_result,'')),'') is not null)
  into v_measured;

  v_next:=case v_stage
    when 'discovery' then 'Complete discovery evidence and fit confirmation.'
    when 'diagnosis' then 'Approve the diagnosis and confirm the governed resolution plan.'
    when 'commercial' then case
      when not private.nexus_phase_zero_has_gate(p.id,'scope_signed') then 'Record the signed scope / SOW.'
      when not private.nexus_phase_zero_has_gate(p.id,'payment_confirmed') then 'Confirm payment before kickoff.'
      else 'Commercial requirements are complete.' end
    when 'onboarding' then 'Complete client kickoff and implementation readiness.'
    when 'implementation' then case when coalesce(v_open,0)>0 then 'Complete the remaining governed implementation actions.' else 'Record implementation completion evidence.' end
    when 'verification' then 'Run QA against the delivered system and record the QA evidence.'
    when 'measurement' then 'Record a post-implementation result against the agreed baseline.'
    when 'acceptance' then case
      when not private.nexus_phase_zero_has_gate(p.id,'handoff_complete') then 'Complete the client handoff / training.'
      when not private.nexus_phase_zero_has_gate(p.id,'client_accepted') then 'Obtain final client acceptance.'
      else 'Closeout requirements are complete.' end
    when 'complete' then 'Engagement complete.'
    else 'Review the engagement lifecycle.' end;

  return jsonb_build_object(
    'project_id',p.id,'company_id',p.company_id,'project_name',p.name,'project_status',p.status,
    'current_stage',v_stage,'raw_stage',p.engagement_stage,'next_required',v_next,
    'stages',jsonb_build_array('discovery','diagnosis','commercial','onboarding','implementation','verification','measurement','acceptance','complete'),
    'gates',coalesce(v_gates,'[]'::jsonb),
    'implementation_tasks_total',coalesce(v_total,0),'implementation_tasks_open',coalesce(v_open,0),
    'measured_evidence_count',coalesce(v_measured,0),
    'client_status_update',p.client_status_update,
    'can_complete',(v_stage='acceptance' and private.nexus_phase_zero_has_gate(p.id,'handoff_complete') and private.nexus_phase_zero_has_gate(p.id,'client_accepted'))
  );
end
$function$;

-- Replace the old four-stage manual transition RPC with the canonical Phase Zero sequence.
-- Forward moves require their prior-stage evidence; backward moves remain an explicit admin override.
create or replace function public.nexus_transition_engagement_stage(
  p_project_id uuid,
  p_next_stage text,
  p_reason text default null,
  p_allow_backward boolean default false
)
returns public.nexus_projects
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p public.nexus_projects%rowtype;
  v_next text:=lower(btrim(coalesce(p_next_stage,'')));
  v_old_pos integer;
  v_new_pos integer;
  v_open integer;
  v_measured integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if v_next in ('build_test','launch') then raise exception 'Legacy engagement stages cannot be selected'; end if;
  select * into p from public.nexus_projects where id=p_project_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  v_old_pos:=private.nexus_phase_zero_stage_position(p.engagement_stage);
  v_new_pos:=private.nexus_phase_zero_stage_position(v_next);
  if v_new_pos is null then raise exception 'Unknown engagement stage'; end if;

  if v_new_pos<v_old_pos then
    if not p_allow_backward then raise exception 'Backward stage movement requires an explicit override'; end if;
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Backward stage movement requires a reason'; end if;
  elsif v_new_pos>v_old_pos+1 then
    raise exception 'Engagement stages cannot be skipped';
  elsif v_new_pos=v_old_pos+1 then
    if p.engagement_stage='commercial' and not (private.nexus_phase_zero_has_gate(p.id,'scope_signed') and private.nexus_phase_zero_has_gate(p.id,'payment_confirmed')) then raise exception 'Signed scope and payment are required before onboarding'; end if;
    if p.engagement_stage='onboarding' and not private.nexus_phase_zero_has_gate(p.id,'onboarding_complete') then raise exception 'Onboarding completion is required before implementation'; end if;
    if p.engagement_stage in ('implementation','build_test') and not private.nexus_phase_zero_has_gate(p.id,'implementation_complete') then raise exception 'Implementation completion is required before verification'; end if;
    if p.engagement_stage='verification' and not private.nexus_phase_zero_has_gate(p.id,'qa_passed') then raise exception 'QA must pass before measurement'; end if;
    if p.engagement_stage='measurement' and not private.nexus_phase_zero_has_gate(p.id,'measurement_complete') then raise exception 'Measurement must be complete before acceptance'; end if;
    if p.engagement_stage in ('acceptance','launch') and not (private.nexus_phase_zero_has_gate(p.id,'handoff_complete') and private.nexus_phase_zero_has_gate(p.id,'client_accepted')) then raise exception 'Handoff and client acceptance are required before completion'; end if;
  end if;

  update public.nexus_projects
  set engagement_stage=v_next,
      status=case when v_next='complete' then 'complete' when status='planning' and v_next in ('onboarding','implementation','verification','measurement','acceptance') then 'active' else status end,
      updated_at=now()
  where id=p.id returning * into p;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(p.company_id,auth.uid(),'engagement_stage_changed','project',p.id,
    'Engagement stage changed to '||v_next||case when p_reason is null then '' else ': '||left(p_reason,180) end);
  return p;
end
$function$;

revoke all on function private.nexus_phase_zero_stage_position(text) from public,anon,authenticated;
revoke all on function private.nexus_phase_zero_has_gate(uuid,text) from public,anon,authenticated;
revoke all on function private.nexus_phase_zero_try_advance(uuid) from public,anon,authenticated;

revoke all on function public.nexus_phase_zero_confirm_resolution_plan(uuid) from public,anon;
grant execute on function public.nexus_phase_zero_confirm_resolution_plan(uuid) to authenticated,service_role;
revoke all on function public.nexus_admin_record_engagement_gate(uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.nexus_admin_record_engagement_gate(uuid,text,text,text,text,jsonb) to authenticated,service_role;
revoke all on function public.nexus_client_accept_engagement(uuid,text,text) from public,anon;
grant execute on function public.nexus_client_accept_engagement(uuid,text,text) to authenticated,service_role;
revoke all on function public.nexus_admin_record_external_client_acceptance(uuid,text,text) from public,anon;
grant execute on function public.nexus_admin_record_external_client_acceptance(uuid,text,text) to authenticated,service_role;
revoke all on function public.nexus_get_phase_zero_status(uuid) from public,anon;
grant execute on function public.nexus_get_phase_zero_status(uuid) to authenticated,service_role;
revoke all on function public.nexus_transition_engagement_stage(uuid,text,text,boolean) from public,anon;
grant execute on function public.nexus_transition_engagement_stage(uuid,text,text,boolean) to authenticated,service_role;
