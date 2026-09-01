-- Final approval-chain enforcement. This file sorts after the chain schema on clean rebuilds.

-- Service-generated Revenue Flywheel records always have a human accountable requester.
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
  IF v_requester IS NULL THEN RAISE EXCEPTION 'Nexus platform administrator is required for approval accountability'; END IF;
  IF TG_TABLE_NAME='nexus_outreach_packets' THEN
    IF NEW.status<>'pending_review' OR NEW.qa_status<>'passed' THEN RETURN NEW; END IF;
    v_type:='outreach_packet';v_title:='Approve outreach packet';v_entity:=NEW.id;
  ELSE
    IF NEW.status<>'pending_approval' THEN RETURN NEW; END IF;
    v_type:='outreach_step';v_title:='Approve outreach step '||NEW.step_no::text;v_entity:=NEW.id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type=v_type AND c.entity_id=v_entity AND c.status IN ('draft','pending','changes_requested','approved')) THEN RETURN NEW; END IF;
  INSERT INTO public.nexus_approval_chains(title,description,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at,metadata)
  VALUES(v_title,'Human approval required before any prospect-facing outreach becomes send-ready.','revenue_outreach',v_type,v_entity,'internal','pending',1,v_requester,now(),jsonb_build_object('lead_id',NEW.lead_id)) RETURNING id INTO cid;
  INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,instructions,approver_scope,status)
  VALUES(cid,1,'Founder review','Verify evidence, claims, tone, compliance, and send-readiness.','platform_admin','pending');
  INSERT INTO public.nexus_approval_events(chain_id,event_type,actor_id,note) VALUES(cid,'submitted',v_requester,'Revenue approval created automatically.');
  PERFORM private.nexus_notify_approval_step((SELECT id FROM public.nexus_approval_chain_steps WHERE chain_id=cid AND step_order=1));
  RETURN NEW;
END
$function$;

-- Reinstall the diagnosis release-chain trigger as UPDATE-only. Diagnosis rows are
-- initially created before approval, so an INSERT trigger is unnecessary and avoiding
-- OLD on INSERT keeps the trigger contract deterministic.
DROP TRIGGER IF EXISTS nexus_diagnosis_report_release_chain ON public.nexus_diagnosis_runs;
CREATE TRIGGER nexus_diagnosis_report_release_chain
AFTER UPDATE OF status ON public.nexus_diagnosis_runs
FOR EACH ROW
WHEN (NEW.status='approved' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION private.nexus_create_internal_release_chain();

CREATE OR REPLACE FUNCTION private.nexus_guard_diagnosis_report_release_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status='released' THEN PERFORM private.nexus_require_entity_chain_approved('diagnosis_report_release',NEW.diagnosis_run_id); END IF;
  ELSIF NEW.status='released' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.report_version IS DISTINCT FROM NEW.report_version) THEN
    PERFORM private.nexus_require_entity_chain_approved('diagnosis_report_release',NEW.diagnosis_run_id);
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS nexus_guard_diagnosis_report_release_chain ON public.nexus_diagnosis_report_releases;
CREATE TRIGGER nexus_guard_diagnosis_report_release_chain
BEFORE INSERT OR UPDATE OF status,report_version ON public.nexus_diagnosis_report_releases
FOR EACH ROW EXECUTE FUNCTION private.nexus_guard_diagnosis_report_release_chain();

CREATE OR REPLACE FUNCTION private.nexus_guard_revenue_approval_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_TABLE_NAME='nexus_outreach_packets' THEN
    IF NEW.status='approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM private.nexus_require_entity_chain_approved('outreach_packet',NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME='nexus_outreach_sequence_steps' THEN
    IF NEW.status='approved_ready' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM private.nexus_require_entity_chain_approved('outreach_step',NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS nexus_guard_outreach_packet_approval_chain ON public.nexus_outreach_packets;
CREATE TRIGGER nexus_guard_outreach_packet_approval_chain
BEFORE UPDATE OF status ON public.nexus_outreach_packets
FOR EACH ROW EXECUTE FUNCTION private.nexus_guard_revenue_approval_chain();
DROP TRIGGER IF EXISTS nexus_guard_outreach_step_approval_chain ON public.nexus_outreach_sequence_steps;
CREATE TRIGGER nexus_guard_outreach_step_approval_chain
BEFORE UPDATE OF status ON public.nexus_outreach_sequence_steps
FOR EACH ROW EXECUTE FUNCTION private.nexus_guard_revenue_approval_chain();

-- Existing pending steps created by migration backfill immediately surface in the Inbox.
DO $notify$
DECLARE s record;
BEGIN
  FOR s IN SELECT id FROM public.nexus_approval_chain_steps WHERE status='pending' LOOP
    PERFORM private.nexus_notify_approval_step(s.id);
  END LOOP;
END
$notify$;
