-- Final revenue-flywheel release controls.
-- Approval is re-evaluated at the moment of action so a stale packet cannot bypass
-- later suppression/contact/compliance changes.

create or replace function public.nexus_revenue_lead_contactable(p_lead_id uuid)
returns boolean
language sql
security definer
stable
set search_path=''
as $function$
  select coalesce((
    select
      not l.do_not_contact
      and l.stage <> 'suppressed'
      and nullif(btrim(l.business_email),'') is not null
      and coalesce(l.contact_provenance,'{}'::jsonb) <> '{}'::jsonb
      and not exists (
        select 1 from public.nexus_lead_exceptions e
        where e.lead_id=l.id
          and e.status in ('open','acknowledged')
          and e.severity in ('high','critical')
      )
    from public.nexus_revenue_leads l
    where l.id=p_lead_id
  ),false)
$function$;
revoke all on function public.nexus_revenue_lead_contactable(uuid) from public,anon,authenticated;
grant execute on function public.nexus_revenue_lead_contactable(uuid) to service_role;

create or replace function public.nexus_admin_approve_outreach_packet(p_packet_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_lead_id uuid;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;

  select lead_id into v_lead_id
  from public.nexus_outreach_packets
  where id=p_packet_id and status='pending_review' and qa_status='passed'
  for update;
  if v_lead_id is null then raise exception 'Packet must be pending review with passed independent QA'; end if;
  if not public.nexus_revenue_lead_contactable(v_lead_id) then
    raise exception 'Lead has unresolved contactability/compliance blockers';
  end if;

  update public.nexus_outreach_packets
     set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
   where id=p_packet_id;

  update public.nexus_outreach_sequence_steps
     set status=case when step_no=1 then 'approved_ready' else status end,
         approved_by=case when step_no=1 then auth.uid() else approved_by end,
         approved_at=case when step_no=1 then now() else approved_at end,
         updated_at=now()
   where packet_id=p_packet_id;

  update public.nexus_revenue_leads set stage='outreach_approved',updated_at=now() where id=v_lead_id;
  return p_packet_id;
end
$function$;
revoke all on function public.nexus_admin_approve_outreach_packet(uuid) from public,anon;
grant execute on function public.nexus_admin_approve_outreach_packet(uuid) to authenticated,service_role;

-- Step 2 has its own explicit approval after the +3 day due date is created by Step 1 send.
create or replace function public.nexus_admin_approve_outreach_step(p_step_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_step public.nexus_outreach_sequence_steps%rowtype;
  v_packet public.nexus_outreach_packets%rowtype;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v_step from public.nexus_outreach_sequence_steps where id=p_step_id for update;
  if v_step.id is null then raise exception 'Outreach step not found'; end if;
  if v_step.status <> 'pending_approval' then raise exception 'Outreach step is not pending approval'; end if;
  select * into v_packet from public.nexus_outreach_packets where id=v_step.packet_id;
  if v_packet.status <> 'approved' or v_packet.qa_status <> 'passed' then raise exception 'Approved QA-passed packet required'; end if;
  if not public.nexus_revenue_lead_contactable(v_step.lead_id) then raise exception 'Lead has unresolved contactability/compliance blockers'; end if;
  if v_step.step_no=2 and v_step.due_at is null then raise exception 'Follow-up due date has not been created by Step 1 send'; end if;

  update public.nexus_outreach_sequence_steps
     set status='approved_ready',approved_by=auth.uid(),approved_at=now(),updated_at=now()
   where id=v_step.id;
  return v_step.id;
end
$function$;
revoke all on function public.nexus_admin_approve_outreach_step(uuid) from public,anon;
grant execute on function public.nexus_admin_approve_outreach_step(uuid) to authenticated,service_role;

-- Marking sent also re-checks live contactability; a stale approval cannot override suppression.
create or replace function public.nexus_admin_mark_outreach_sent(p_step_id uuid,p_provider_message_id text default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v public.nexus_outreach_sequence_steps%rowtype;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v from public.nexus_outreach_sequence_steps where id=p_step_id for update;
  if v.id is null then raise exception 'Outreach step not found'; end if;
  if v.status <> 'approved_ready' then raise exception 'Outreach step requires explicit approval before it can be marked sent'; end if;
  if not public.nexus_revenue_lead_contactable(v.lead_id) then raise exception 'Lead has unresolved contactability/compliance blockers'; end if;

  update public.nexus_outreach_sequence_steps
     set status='sent',sent_at=now(),provider_message_id=p_provider_message_id,updated_at=now()
   where id=v.id;
  update public.nexus_revenue_leads set stage='contacted',updated_at=now() where id=v.lead_id;

  if v.step_no=1 then
    update public.nexus_outreach_sequence_steps
       set status='pending_approval',due_at=now()+interval '3 days',updated_at=now()
     where packet_id=v.packet_id and step_no=2 and status='waiting';
  end if;
  return v.id;
end
$function$;
revoke all on function public.nexus_admin_mark_outreach_sent(uuid,text) from public,anon;
grant execute on function public.nexus_admin_mark_outreach_sent(uuid,text) to authenticated,service_role;
