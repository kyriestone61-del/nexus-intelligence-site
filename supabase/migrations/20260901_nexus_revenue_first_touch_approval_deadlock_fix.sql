-- Fix a first-touch approval deadlock discovered by parallel production QA.
-- The outreach packet approval is the human approval for Email 1. Email 2 retains
-- its own +3-day follow-up approval chain after Email 1 is actually marked sent.

CREATE OR REPLACE FUNCTION private.nexus_create_revenue_approval_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cid uuid;
  v_type text;
  v_title text;
  v_entity uuid;
  v_requester uuid:=coalesce(auth.uid(),NEW.created_by,private.nexus_default_platform_admin_user());
BEGIN
  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Nexus platform administrator is required for approval accountability';
  END IF;

  IF TG_TABLE_NAME='nexus_outreach_packets' THEN
    IF NEW.status<>'pending_review' OR NEW.qa_status<>'passed' THEN RETURN NEW; END IF;
    v_type:='outreach_packet';
    v_title:='Approve outreach packet';
    v_entity:=NEW.id;
  ELSE
    -- Email 1 is governed by the packet approval. Creating a second chain for
    -- the same first-touch send makes packet approval and step approval depend
    -- on one another. Only later follow-up steps receive their own chain.
    IF NEW.status<>'pending_approval' OR NEW.step_no=1 THEN RETURN NEW; END IF;
    v_type:='outreach_step';
    v_title:='Approve outreach step '||NEW.step_no::text;
    v_entity:=NEW.id;
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.nexus_approval_chains c
    WHERE c.entity_type=v_type AND c.entity_id=v_entity
      AND c.status IN ('draft','pending','changes_requested','approved')
  ) THEN RETURN NEW; END IF;

  INSERT INTO public.nexus_approval_chains(
    title,description,approval_type,entity_type,entity_id,visibility,status,
    current_step,requested_by,started_at,metadata
  ) VALUES(
    v_title,
    'Human approval required before any prospect-facing outreach becomes send-ready.',
    'revenue_outreach',v_type,v_entity,'internal','pending',1,v_requester,now(),
    jsonb_build_object('lead_id',NEW.lead_id)
  ) RETURNING id INTO cid;

  INSERT INTO public.nexus_approval_chain_steps(
    chain_id,step_order,step_name,instructions,approver_scope,status
  ) VALUES(
    cid,1,'Founder review',
    'Verify evidence, claims, tone, compliance, and send-readiness.',
    'platform_admin','pending'
  );

  INSERT INTO public.nexus_approval_events(chain_id,event_type,actor_id,note)
  VALUES(cid,'submitted',v_requester,'Revenue approval created automatically.');

  PERFORM private.nexus_notify_approval_step((
    SELECT id FROM public.nexus_approval_chain_steps WHERE chain_id=cid AND step_order=1
  ));
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.nexus_guard_revenue_approval_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_packet_id uuid;
BEGIN
  IF TG_TABLE_NAME='nexus_outreach_packets' THEN
    IF NEW.status='approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM private.nexus_require_entity_chain_approved('outreach_packet',NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME='nexus_outreach_sequence_steps' THEN
    IF NEW.status='approved_ready' AND OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.step_no=1 THEN
        -- First-touch send-readiness is authorized by the packet-level review.
        v_packet_id:=NEW.packet_id;
        PERFORM private.nexus_require_entity_chain_approved('outreach_packet',v_packet_id);
      ELSE
        -- Follow-ups remain separately approved after their due date is created.
        PERFORM private.nexus_require_entity_chain_approved('outreach_step',NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

-- Retire active first-touch step chains created by the former circular design.
-- Historical completed/rejected chains and their notifications are preserved as
-- audit artifacts; no notification guard is bypassed by this repair.
WITH target_chains AS (
  SELECT c.id
  FROM public.nexus_approval_chains c
  JOIN public.nexus_outreach_sequence_steps s
    ON c.entity_type='outreach_step' AND c.entity_id=s.id
  WHERE s.step_no=1
    AND c.approval_type='revenue_outreach'
    AND c.status IN ('draft','pending','changes_requested')
)
UPDATE public.nexus_approval_chain_steps s
SET status='cancelled',updated_at=now()
WHERE s.chain_id IN (SELECT id FROM target_chains)
  AND s.status IN ('queued','pending','changes_requested');

WITH target_chains AS (
  SELECT c.id
  FROM public.nexus_approval_chains c
  JOIN public.nexus_outreach_sequence_steps s
    ON c.entity_type='outreach_step' AND c.entity_id=s.id
  WHERE s.step_no=1
    AND c.approval_type='revenue_outreach'
    AND c.status IN ('draft','pending','changes_requested')
)
UPDATE public.nexus_approval_chains c
SET status='cancelled',cancelled_at=now(),updated_at=now()
WHERE c.id IN (SELECT id FROM target_chains);
