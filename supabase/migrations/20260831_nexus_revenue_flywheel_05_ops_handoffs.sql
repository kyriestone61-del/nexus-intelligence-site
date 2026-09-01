-- Operations/cohesion hardening discovered during live-schema review.
-- Prospect packets are routed to the founder decision queue (not client notifications),
-- and send approval requires verified business-contact provenance or a first-party inbound/opt-in context.

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
      and (
        lower(coalesce(l.contact_provenance->>'business_contact_verified','false'))='true'
        or lower(coalesce(l.contact_provenance->>'inbound_request','false'))='true'
        or (
          l.source='website_opportunity_snapshot'
          and lower(coalesce(l.contact_provenance->>'marketing_opt_in','false'))='true'
        )
      )
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

-- Packet review is a founder decision before the prospect becomes a Nexus client company.
create or replace function public.nexus_queue_outreach_packet_for_founder()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_company text;
  v_score smallint;
begin
  select company_name,opportunity_score into v_company,v_score
  from public.nexus_revenue_leads where id=new.lead_id;

  insert into public.nexus_founder_decision_queue(
    domain,title,context,recommended_action,consequence,source_ref,priority,status,due_at,next_review_at
  ) values(
    'pipeline',
    'Review outreach packet — '||coalesce(v_company,'Revenue lead'),
    coalesce(v_company,'Lead')||' has a generated evidence-backed outreach packet (AI Opportunity Score '||coalesce(v_score::text,'unknown')||'). Independent QA status: '||new.qa_status||'.',
    case when new.qa_status='passed' then 'Review the evidence/claim map, revise if needed, then explicitly approve or reject the packet.' else 'Do not approve. Review QA findings and regenerate/revise the packet.' end,
    'No prospect contact occurs automatically. Approval only makes the first outreach step send-ready; actual sending remains a separate human-controlled action.',
    'outreach_packet:'||new.id::text,
    case when new.qa_status='passed' then 'normal' else 'high' end,
    'open',
    now()+interval '1 day',
    now()
  );
  return new;
end
$function$;
revoke all on function public.nexus_queue_outreach_packet_for_founder() from public,anon,authenticated;

drop trigger if exists nexus_outreach_packet_founder_queue on public.nexus_outreach_packets;
create trigger nexus_outreach_packet_founder_queue
after insert on public.nexus_outreach_packets
for each row execute function public.nexus_queue_outreach_packet_for_founder();
