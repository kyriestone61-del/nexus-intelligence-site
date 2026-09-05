-- RELYSTRA Phase Zero hardening: a measured result must be a real before/after
-- observation recorded after QA, and the legacy plan-confirm RPC cannot be called
-- directly by ordinary authenticated sessions.

create or replace function private.nexus_phase_zero_measured_evidence_count(p_project_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  with qa as (
    select max(recorded_at) as qa_at
    from public.nexus_engagement_gate_records
    where project_id=p_project_id and gate_code='qa_passed' and status='passed'
  )
  select (
    select count(*)::integer
    from public.nexus_metrics m, qa
    where m.project_id=p_project_id
      and m.baseline_value is not null
      and m.current_value is not null
      and m.measured_at is not null
      and qa.qa_at is not null
      and m.measured_at >= qa.qa_at
  ) + (
    select count(*)::integer
    from public.nexus_improvement_ledger l, qa
    where l.project_id=p_project_id
      and l.before_value is not null
      and l.after_value is not null
      and nullif(btrim(coalesce(l.actual_result,'')),'') is not null
      and qa.qa_at is not null
      and l.updated_at >= qa.qa_at
  );
$function$;

create or replace function private.nexus_validate_phase_zero_gate_record()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status='passed' and new.gate_code='measurement_complete'
     and private.nexus_phase_zero_measured_evidence_count(new.project_id)<1 then
    raise exception 'Measurement cannot close until a before/after result is recorded after QA';
  end if;
  return new;
end
$function$;

drop trigger if exists nexus_engagement_gate_records_validate on public.nexus_engagement_gate_records;
create trigger nexus_engagement_gate_records_validate
before insert or update of gate_code,status,evidence,evidence_ref,note
on public.nexus_engagement_gate_records
for each row execute function private.nexus_validate_phase_zero_gate_record();

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
    (1,'scope_signed','Signed scope'),(2,'payment_confirmed','Payment confirmed'),
    (3,'onboarding_complete','Onboarding complete'),(4,'implementation_complete','Implementation complete'),
    (5,'qa_passed','QA passed'),(6,'measurement_complete','Measurement complete'),
    (7,'handoff_complete','Handoff complete'),(8,'client_accepted','Client accepted')
  ) as x(ord,gate_code,label)
  left join public.nexus_engagement_gate_records g on g.project_id=p.id and g.gate_code=x.gate_code;

  select count(*),count(*) filter(where status not in ('completed','approved','done','not_applicable','cancelled','canceled'))
  into v_total,v_open
  from public.nexus_tasks
  where project_id=p.id and archived_at is null and source_resolution_proposal_id is not null;

  v_measured:=private.nexus_phase_zero_measured_evidence_count(p.id);

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
    when 'measurement' then 'Record a post-QA before/after result against the agreed baseline.'
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

-- The wrapper remains callable by authenticated admins. The old direct function is now
-- server/service-only so future browser code cannot accidentally bypass commercial close.
revoke execute on function public.nexus_confirm_resolution_plan(uuid) from authenticated;
grant execute on function public.nexus_confirm_resolution_plan(uuid) to service_role;

revoke all on function private.nexus_phase_zero_measured_evidence_count(uuid) from public,anon,authenticated;
revoke all on function private.nexus_validate_phase_zero_gate_record() from public,anon,authenticated;
