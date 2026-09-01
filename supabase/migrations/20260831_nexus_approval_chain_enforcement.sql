-- Enforce approval-chain completion at consequential release/outreach boundaries.
-- These trigger guards protect the backend even if a browser button or future integration bypasses the Inbox UI.

CREATE OR REPLACE FUNCTION private.nexus_guard_diagnosis_report_release_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status='released' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.report_version IS DISTINCT FROM NEW.report_version) THEN
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

-- Existing pending steps created by the backfill should immediately surface in the Inbox.
DO $notify$
DECLARE s record;
BEGIN
  FOR s IN SELECT id FROM public.nexus_approval_chain_steps WHERE status='pending' LOOP
    PERFORM private.nexus_notify_approval_step(s.id);
  END LOOP;
END
$notify$;
