-- Parallel QA found that high/medium-readiness Snapshot inserts fail because
-- nexus_snapshot_after_insert() uses founder_decision_queue domain='lead', while
-- the governed decision taxonomy allows 'pipeline'. Keep the taxonomy stable and
-- route qualified Snapshot reviews into the existing pipeline domain.

CREATE OR REPLACE FUNCTION public.nexus_snapshot_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  primary_label text;
  segment text;
  readiness text;
  result_body text;
BEGIN
  primary_label:=case new.primary_opportunity
    when 'admin' then 'administrative workflow automation'
    when 'leads' then 'lead capture and follow-up'
    when 'reporting' then 'reporting and operating visibility'
    when 'customer' then 'customer response and service'
    when 'scheduling' then 'scheduling and intake'
    when 'knowledge' then 'company knowledge access'
    when 'systems' then 'connecting disconnected systems'
    else new.primary_opportunity
  end;
  readiness:=case
    when new.timeline='month' and new.authority='owner' then 'high'
    when new.timeline in ('month','quarter') and new.authority in ('owner','manager') then 'medium'
    else 'early'
  end;
  segment:=coalesce(primary_label,'general AI opportunity');

  UPDATE public.nexus_opportunity_snapshot_leads
  SET lead_segment=segment,
      lead_readiness=readiness,
      marketing_opt_in_at=case when marketing_opt_in then coalesce(marketing_opt_in_at,now()) else null end
  WHERE id=new.id;

  result_body:='Hi '||new.first_name||E',\n\nYour Nexus AI Opportunity Snapshot is complete.\n\nOpportunity score: '||new.opportunity_score||E'/100\nPrimary opportunity: '||segment||E'\n\nRecommended first workflow: validate the highest-friction repeatable workflow in this area, document the current baseline, and test the smallest controlled improvement before expanding scope.\n\nYour Snapshot is a high-level screening result, not the deeper Client Diagnosis. A fit call or deeper diagnostic is the appropriate next step when you want a defensible implementation recommendation.\n\n— Nexus Intelligence';

  INSERT INTO public.nexus_email_outbox(
    recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,payload,dedupe_key,status,available_at
  ) VALUES(
    new.email,'snapshot_result','Your Nexus AI Opportunity Snapshot',result_body,'/book','opportunity_snapshot',new.id,
    jsonb_build_object('segment',segment,'readiness',readiness,'score',new.opportunity_score),
    'snapshot-result:'||new.id,'queued',now()
  ) ON CONFLICT(dedupe_key) DO NOTHING;

  IF readiness IN ('high','medium') THEN
    INSERT INTO public.nexus_founder_decision_queue(
      domain,title,context,recommended_action,consequence,source_ref,priority,status,due_at
    ) VALUES(
      'pipeline',
      'Qualified Nexus Snapshot lead: '||coalesce(new.company_name,new.first_name),
      'Score '||new.opportunity_score||'/100 · '||segment||' · readiness '||readiness,
      'Review the Snapshot and determine whether to invite the prospect to a fit call.',
      'A qualified prospect may cool if follow-up is delayed.',
      'snapshot:'||new.id,
      case when readiness='high' then 'high' else 'normal' end,
      'open',now()+interval '1 day'
    );
  END IF;

  IF new.marketing_opt_in THEN
    INSERT INTO public.nexus_email_outbox(
      recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,payload,dedupe_key,status,available_at
    ) VALUES(
      new.email,'snapshot_followup','A practical next step for '||segment,
      'Your Snapshot pointed to '||segment||E'.\n\nBefore adding AI, write down the current workflow in five lines: trigger, inputs, steps, human decisions, and measurable output. That simple map makes the next conversation materially more useful.\n\nIf you want Nexus to help validate the workflow, use the fit-call link below.',
      '/book','opportunity_snapshot',new.id,jsonb_build_object('sequence',1,'segment',segment),
      'snapshot-followup-1:'||new.id,'queued',now()+interval '2 days'
    ) ON CONFLICT(dedupe_key) DO NOTHING;

    INSERT INTO public.nexus_email_outbox(
      recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,payload,dedupe_key,status,available_at
    ) VALUES(
      new.email,'snapshot_followup','What evidence should you gather before automating?',
      'For '||segment||E', the safest next move is evidence—not more tooling. Capture one normal example, one exception, the current handling time, and the person who owns the decision.\n\nThat gives Nexus enough signal to decide whether a deeper diagnostic is justified.',
      '/assessment','opportunity_snapshot',new.id,jsonb_build_object('sequence',2,'segment',segment),
      'snapshot-followup-2:'||new.id,'queued',now()+interval '5 days'
    ) ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;

  RETURN new;
END
$function$;
