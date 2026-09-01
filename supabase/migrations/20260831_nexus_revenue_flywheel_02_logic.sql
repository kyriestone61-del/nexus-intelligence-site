-- Nexus multi-agent revenue flywheel: deterministic scoring, exception routing,
-- Snapshot synchronization, queue claiming, and human approval controls.

create or replace function public.nexus_classify_revenue_lead_exceptions(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v public.nexus_revenue_leads%rowtype;
  v_latest timestamptz;
begin
  select * into v from public.nexus_revenue_leads where id=p_lead_id;
  if v.id is null then return; end if;

  update public.nexus_lead_exceptions
     set status='resolved',resolved_at=now(),updated_at=now()
   where lead_id=p_lead_id and status in ('open','acknowledged');

  if nullif(btrim(v.business_email),'') is null then
    insert into public.nexus_lead_exceptions(lead_id,exception_code,severity,summary)
    values(v.id,'missing_business_email','high','No verified business email is available; outbound email must remain blocked.')
    on conflict do nothing;
  end if;

  if coalesce(v.contact_provenance,'{}'::jsonb)='{}'::jsonb then
    insert into public.nexus_lead_exceptions(lead_id,exception_code,severity,summary)
    values(v.id,'contact_provenance_missing','high','Business-contact provenance has not been recorded.')
    on conflict do nothing;
  end if;

  if v.score_confidence < 67 then
    insert into public.nexus_lead_exceptions(lead_id,exception_code,severity,summary,details)
    values(v.id,'insufficient_scoring_evidence','medium','Fewer than two of the three requested scoring signals are verified.',jsonb_build_object('score_confidence',v.score_confidence))
    on conflict do nothing;
  end if;

  select max(coalesce(observed_at,created_at)) into v_latest
    from public.nexus_lead_research_evidence
   where lead_id=v.id and verified;
  if v_latest is not null and v_latest < now()-interval '45 days' then
    insert into public.nexus_lead_exceptions(lead_id,exception_code,severity,summary,details)
    values(v.id,'stale_research','medium','Verified lead research is older than 45 days and should be refreshed.',jsonb_build_object('latest_verified_observation',v_latest))
    on conflict do nothing;
  end if;

  if coalesce(v.estimated_lost_monthly_revenue,0)>0 and coalesce(v.lost_revenue_basis,'{}'::jsonb)='{}'::jsonb then
    insert into public.nexus_lead_exceptions(lead_id,exception_code,severity,summary)
    values(v.id,'unsupported_revenue_estimate','high','Lost-revenue estimate has no stored calculation basis and may not be used in outreach.')
    on conflict do nothing;
  end if;

  if nullif(btrim(v.jurisdiction),'') is null then
    insert into public.nexus_lead_exceptions(lead_id,exception_code,severity,summary)
    values(v.id,'jurisdiction_review','medium','Lead jurisdiction is unknown; outreach compliance requires human review.')
    on conflict do nothing;
  end if;

  if v.do_not_contact then
    insert into public.nexus_lead_exceptions(lead_id,exception_code,severity,summary,details)
    values(v.id,'suppressed','critical','Lead is marked do-not-contact. No outreach may be generated for sending.',jsonb_build_object('reason',v.suppression_reason))
    on conflict do nothing;
  end if;
end
$function$;
revoke all on function public.nexus_classify_revenue_lead_exceptions(uuid) from public,anon,authenticated;
grant execute on function public.nexus_classify_revenue_lead_exceptions(uuid) to service_role;

create or replace function public.nexus_recalculate_revenue_lead_score(p_lead_id uuid)
returns smallint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_score integer:=100;
  v_known integer:=0;
  v_response numeric;
  v_booking boolean;
  v_review_bottleneck boolean:=false;
  v_review_checked boolean:=false;
  v_lead public.nexus_revenue_leads%rowtype;
  v_bottlenecks jsonb:='[]'::jsonb;
begin
  select * into v_lead from public.nexus_revenue_leads where id=p_lead_id for update;
  if v_lead.id is null then raise exception 'Lead not found'; end if;

  select e.numeric_value into v_response
    from public.nexus_lead_research_evidence e
   where e.lead_id=p_lead_id and e.verified and e.evidence_type='response_time' and e.numeric_value is not null
   order by coalesce(e.observed_at,e.created_at) desc limit 1;
  if v_response is not null then
    v_known:=v_known+1;
    if v_response>120 then
      v_score:=v_score-30;
      v_bottlenecks:=v_bottlenecks||jsonb_build_array(jsonb_build_object('code','slow_lead_response','label','Slow Lead Response','evidence','verified'));
    end if;
  end if;

  select case
           when lower(coalesce(e.metadata->>'has_automated_booking','')) in ('true','yes','1') then true
           when lower(coalesce(e.metadata->>'has_automated_booking','')) in ('false','no','0') then false
         end
    into v_booking
    from public.nexus_lead_research_evidence e
   where e.lead_id=p_lead_id and e.verified and e.evidence_type='booking'
   order by coalesce(e.observed_at,e.created_at) desc limit 1;
  if v_booking is not null then
    v_known:=v_known+1;
    if not v_booking then
      v_score:=v_score-20;
      v_bottlenecks:=v_bottlenecks||jsonb_build_array(jsonb_build_object('code','manual_booking','label','Manual Appointment Booking','evidence','verified'));
    end if;
  end if;

  select exists(
    select 1 from public.nexus_lead_research_evidence e
     where e.lead_id=p_lead_id and e.verified and e.evidence_type='review_bottleneck'
  ) into v_review_bottleneck;
  select exists(
    select 1 from public.nexus_lead_research_evidence e
     where e.lead_id=p_lead_id and e.verified
       and (e.evidence_type='review_bottleneck' or lower(coalesce(e.metadata->>'review_checked','false'))='true')
  ) into v_review_checked;
  if v_review_checked then
    v_known:=v_known+1;
    if v_review_bottleneck then
      v_score:=v_score-20;
      v_bottlenecks:=v_bottlenecks||jsonb_build_array(jsonb_build_object('code','review_followup_bottleneck','label','Reviews Mention Slow Follow-up / Administrative Bottlenecks','evidence','verified'));
    end if;
  end if;

  update public.nexus_revenue_leads
     set opportunity_score=greatest(0,least(100,v_score)),
         score_method='aaa_gap_score_v1',
         score_confidence=round((v_known::numeric/3)*100,2),
         score_evidence=jsonb_build_object(
           'verified_signal_count',v_known,
           'possible_signal_count',3,
           'rules',jsonb_build_object('response_over_120_minutes',30,'no_automated_booking',20,'review_bottleneck',20)
         ),
         response_time_minutes=case when v_response is null then response_time_minutes else round(v_response)::integer end,
         has_automated_booking=coalesce(v_booking,has_automated_booking),
         primary_bottlenecks=v_bottlenecks,
         urgency_score=greatest(0,least(100,100-v_score)),
         lead_summary=company_name||' has '||jsonb_array_length(v_bottlenecks)||' verified automation-gap signal(s).',
         suggested_action=case when v_score<=50 then 'Prepare evidence-backed personalized outreach packet for human review.' else 'Continue research/nurture; do not auto-generate <=50 outreach packet.' end,
         stage=case when do_not_contact then 'suppressed' when v_score<=50 then 'qualified' when stage in ('new','researching','qualified') then 'scored' else stage end,
         last_scored_at=now(),updated_at=now()
   where id=p_lead_id;

  perform public.nexus_classify_revenue_lead_exceptions(p_lead_id);

  if v_score<=50 and not v_lead.do_not_contact then
    insert into public.nexus_revenue_agent_jobs(job_type,lead_id,status,payload)
    values('generate_outreach_packet',p_lead_id,'queued',jsonb_build_object('reason','score_le_50','score',v_score))
    on conflict do nothing;
  end if;
  return greatest(0,least(100,v_score))::smallint;
end
$function$;
revoke all on function public.nexus_recalculate_revenue_lead_score(uuid) from public,anon,authenticated;
grant execute on function public.nexus_recalculate_revenue_lead_score(uuid) to service_role;

create or replace function public.nexus_lead_evidence_rescore_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    perform public.nexus_recalculate_revenue_lead_score(old.lead_id);
    return old;
  end if;
  perform public.nexus_recalculate_revenue_lead_score(new.lead_id);
  return new;
end
$function$;
revoke all on function public.nexus_lead_evidence_rescore_trigger() from public,anon,authenticated;
drop trigger if exists nexus_lead_evidence_rescore on public.nexus_lead_research_evidence;
create trigger nexus_lead_evidence_rescore
after insert or update of verified,numeric_value,metadata,observed_at or delete on public.nexus_lead_research_evidence
for each row execute function public.nexus_lead_evidence_rescore_trigger();

create or replace function public.nexus_lead_suppression_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.do_not_contact then
    new.stage:='suppressed';
    update public.nexus_revenue_agent_jobs set status='cancelled',updated_at=now() where lead_id=new.id and status in ('queued','running');
    update public.nexus_outreach_sequence_steps set status='cancelled',updated_at=now() where lead_id=new.id and status not in ('sent','replied','cancelled');
  end if;
  return new;
end
$function$;
revoke all on function public.nexus_lead_suppression_trigger() from public,anon,authenticated;
drop trigger if exists nexus_revenue_lead_suppression on public.nexus_revenue_leads;
create trigger nexus_revenue_lead_suppression
before update of do_not_contact on public.nexus_revenue_leads
for each row execute function public.nexus_lead_suppression_trigger();

create or replace function public.nexus_sync_opportunity_snapshot_to_revenue()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid;
begin
  insert into public.nexus_revenue_leads(
    source,source_ref,source_snapshot_lead_id,company_name,niche,business_email,business_phone,
    contact_provenance,opportunity_score,score_method,score_confidence,primary_bottlenecks,
    stage,do_not_contact,suppression_reason,lead_summary,suggested_action
  ) values(
    'website_opportunity_snapshot',new.id::text,new.id,coalesce(nullif(new.company_name,''),'Unnamed Snapshot Lead'),new.business_type,new.email,new.phone,
    jsonb_build_object('source','website_opportunity_snapshot','email_provided_by_prospect',true,'marketing_opt_in',new.marketing_opt_in,'sms_opt_in',new.sms_opt_in),
    new.opportunity_score,'website_snapshot_v1',100,
    coalesce((select jsonb_agg(jsonb_build_object('label',x)) from unnest(new.opportunity_areas) x),'[]'::jsonb),
    case when new.unsubscribed_at is not null then 'suppressed' when new.opportunity_score<=50 then 'qualified' else 'scored' end,
    new.unsubscribed_at is not null,
    case when new.unsubscribed_at is not null then 'Snapshot lead unsubscribed.' else null end,
    coalesce(new.primary_opportunity,'Website Opportunity Snapshot lead.'),
    case when new.opportunity_score<=50 then 'Prepare evidence-backed personalized outreach packet for human review.' else 'Nurture/research before outreach packet.' end
  )
  on conflict(source_snapshot_lead_id) do update set
    company_name=excluded.company_name,niche=excluded.niche,business_email=excluded.business_email,business_phone=excluded.business_phone,
    contact_provenance=excluded.contact_provenance,opportunity_score=excluded.opportunity_score,score_method=excluded.score_method,
    score_confidence=excluded.score_confidence,primary_bottlenecks=excluded.primary_bottlenecks,do_not_contact=excluded.do_not_contact,
    suppression_reason=excluded.suppression_reason,updated_at=now()
  returning id into v_id;

  perform public.nexus_classify_revenue_lead_exceptions(v_id);
  if new.opportunity_score<=50 and new.unsubscribed_at is null then
    insert into public.nexus_revenue_agent_jobs(job_type,lead_id,status,payload)
    values('generate_outreach_packet',v_id,'queued',jsonb_build_object('reason','snapshot_score_le_50','score',new.opportunity_score))
    on conflict do nothing;
  end if;
  return new;
end
$function$;
revoke all on function public.nexus_sync_opportunity_snapshot_to_revenue() from public,anon,authenticated;
drop trigger if exists nexus_snapshot_to_revenue on public.nexus_opportunity_snapshot_leads;
create trigger nexus_snapshot_to_revenue
after insert or update of company_name,email,phone,opportunity_score,primary_opportunity,opportunity_areas,unsubscribed_at,marketing_opt_in,sms_opt_in
on public.nexus_opportunity_snapshot_leads
for each row execute function public.nexus_sync_opportunity_snapshot_to_revenue();

create or replace function public.nexus_claim_revenue_agent_jobs(p_limit integer default 5)
returns setof public.nexus_revenue_agent_jobs
language plpgsql
security definer
set search_path=''
as $function$
begin
  return query
  with picked as (
    select id from public.nexus_revenue_agent_jobs
     where status='queued' and available_at<=now()
     order by created_at
     for update skip locked
     limit greatest(1,least(coalesce(p_limit,5),20))
  ), updated as (
    update public.nexus_revenue_agent_jobs j
       set status='running',attempts=j.attempts+1,started_at=now(),updated_at=now(),error=null
      from picked p where j.id=p.id
      returning j.*
  ) select * from updated;
end
$function$;
revoke all on function public.nexus_claim_revenue_agent_jobs(integer) from public,anon,authenticated;
grant execute on function public.nexus_claim_revenue_agent_jobs(integer) to service_role;

-- Admin/API lead intake: accepts raw structured payloads but does not invent missing values.
create or replace function public.nexus_admin_upsert_revenue_lead(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_source text:=coalesce(nullif(btrim(p_payload->>'source'),''),'manual');
  v_ref text:=nullif(btrim(p_payload->>'source_ref'),'');
  v_company text:=nullif(btrim(p_payload->>'company_name'),'');
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  if v_company is null then raise exception 'company_name is required'; end if;

  if v_ref is not null then
    select id into v_id from public.nexus_revenue_leads where source=v_source and source_ref=v_ref limit 1;
  end if;

  if v_id is null then
    insert into public.nexus_revenue_leads(
      source,source_ref,company_name,website,niche,geography,annual_revenue_min,annual_revenue_max,employee_count,
      decision_maker_name,decision_maker_title,business_email,business_phone,contact_provenance,jurisdiction,
      manual_touchpoints,social_cadence,lead_summary,suggested_action
    ) values(
      v_source,v_ref,v_company,nullif(p_payload->>'website',''),nullif(p_payload->>'niche',''),nullif(p_payload->>'geography',''),
      nullif(p_payload->>'annual_revenue_min','')::numeric,nullif(p_payload->>'annual_revenue_max','')::numeric,nullif(p_payload->>'employee_count','')::integer,
      nullif(p_payload->>'decision_maker_name',''),nullif(p_payload->>'decision_maker_title',''),nullif(p_payload->>'email',''),nullif(p_payload->>'phone',''),
      coalesce(p_payload->'contact_provenance','{}'::jsonb),nullif(p_payload->>'jurisdiction',''),coalesce(p_payload->'manual_touchpoints','[]'::jsonb),
      nullif(p_payload->>'social_cadence',''),nullif(p_payload->>'lead_summary',''),nullif(p_payload->>'suggested_action','')
    ) returning id into v_id;
  else
    update public.nexus_revenue_leads set
      company_name=v_company,website=coalesce(nullif(p_payload->>'website',''),website),niche=coalesce(nullif(p_payload->>'niche',''),niche),
      geography=coalesce(nullif(p_payload->>'geography',''),geography),decision_maker_name=coalesce(nullif(p_payload->>'decision_maker_name',''),decision_maker_name),
      decision_maker_title=coalesce(nullif(p_payload->>'decision_maker_title',''),decision_maker_title),business_email=coalesce(nullif(p_payload->>'email',''),business_email),
      business_phone=coalesce(nullif(p_payload->>'phone',''),business_phone),contact_provenance=case when p_payload ? 'contact_provenance' then p_payload->'contact_provenance' else contact_provenance end,
      jurisdiction=coalesce(nullif(p_payload->>'jurisdiction',''),jurisdiction),updated_at=now()
    where id=v_id;
  end if;
  perform public.nexus_classify_revenue_lead_exceptions(v_id);
  return v_id;
end
$function$;
revoke all on function public.nexus_admin_upsert_revenue_lead(jsonb) from public,anon;
grant execute on function public.nexus_admin_upsert_revenue_lead(jsonb) to authenticated,service_role;

create or replace function public.nexus_admin_approve_outreach_packet(p_packet_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  update public.nexus_outreach_packets
     set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
   where id=p_packet_id and status='pending_review' and qa_status='passed';
  if not found then raise exception 'Packet must be pending review with passed independent QA'; end if;
  update public.nexus_outreach_sequence_steps
     set status=case when step_no=1 then 'approved_ready' else status end,
         approved_by=case when step_no=1 then auth.uid() else approved_by end,
         approved_at=case when step_no=1 then now() else approved_at end,
         updated_at=now()
   where packet_id=p_packet_id;
  update public.nexus_revenue_leads l set stage='outreach_approved',updated_at=now()
   from public.nexus_outreach_packets p where p.id=p_packet_id and l.id=p.lead_id;
  return p_packet_id;
end
$function$;
revoke all on function public.nexus_admin_approve_outreach_packet(uuid) from public,anon;
grant execute on function public.nexus_admin_approve_outreach_packet(uuid) to authenticated,service_role;

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
  if v.status<>'approved_ready' then raise exception 'Outreach step requires explicit approval before it can be marked sent'; end if;
  update public.nexus_outreach_sequence_steps set status='sent',sent_at=now(),provider_message_id=p_provider_message_id,updated_at=now() where id=v.id;
  update public.nexus_revenue_leads set stage='contacted',updated_at=now() where id=v.lead_id;
  if v.step_no=1 then
    update public.nexus_outreach_sequence_steps set status='pending_approval',due_at=now()+interval '3 days',updated_at=now()
     where packet_id=v.packet_id and step_no=2 and status='waiting';
  end if;
  return v.id;
end
$function$;
revoke all on function public.nexus_admin_mark_outreach_sent(uuid,text) from public,anon;
grant execute on function public.nexus_admin_mark_outreach_sent(uuid,text) to authenticated,service_role;

create or replace function public.nexus_admin_record_outreach_reply(p_lead_id uuid,p_note text default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  update public.nexus_revenue_leads set stage='replied',updated_at=now(),lead_summary=coalesce(nullif(btrim(p_note),''),lead_summary) where id=p_lead_id;
  update public.nexus_outreach_sequence_steps set status='replied',updated_at=now() where lead_id=p_lead_id and status in ('waiting','pending_approval','approved_ready');
  return p_lead_id;
end
$function$;
revoke all on function public.nexus_admin_record_outreach_reply(uuid,text) from public,anon;
grant execute on function public.nexus_admin_record_outreach_reply(uuid,text) to authenticated,service_role;

create or replace view public.nexus_revenue_flywheel_health_v
with (security_invoker=true)
as
select
  count(*) as total_leads,
  count(*) filter (where opportunity_score<=50 and not do_not_contact) as qualifying_leads,
  count(*) filter (where opportunity_score<=50 and not do_not_contact and exists(select 1 from public.nexus_outreach_packets p where p.lead_id=l.id)) as qualifying_with_packet,
  count(*) filter (where stage='outreach_approved') as approved_for_outreach,
  count(*) filter (where stage='contacted') as contacted,
  count(*) filter (where stage='replied') as replied,
  count(*) filter (where stage='booked') as booked,
  count(*) filter (where stage='retainer') as retainers,
  count(*) filter (where stage='won') as won,
  count(*) filter (where do_not_contact) as suppressed,
  count(*) filter (where exists(select 1 from public.nexus_lead_exceptions e where e.lead_id=l.id and e.status in ('open','acknowledged'))) as leads_with_open_exceptions,
  coalesce(sum(estimated_lost_monthly_revenue) filter (where lost_revenue_basis<>'{}'::jsonb),0) as evidence_based_estimated_lost_monthly_revenue
from public.nexus_revenue_leads l;
grant select on public.nexus_revenue_flywheel_health_v to authenticated,service_role;
