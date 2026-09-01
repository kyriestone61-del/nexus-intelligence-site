-- Enforce the +3-day follow-up schedule at the server boundary.
-- A follow-up may be reviewed/approved early, but it cannot be marked sent
-- before the due_at timestamp created when Email 1 is actually sent.

CREATE OR REPLACE FUNCTION public.nexus_admin_mark_outreach_sent(
  p_step_id uuid,
  p_provider_message_id text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v public.nexus_outreach_sequence_steps%rowtype;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN
    RAISE EXCEPTION 'Nexus administrator access required';
  END IF;

  SELECT * INTO v
  FROM public.nexus_outreach_sequence_steps
  WHERE id=p_step_id
  FOR UPDATE;

  IF v.id IS NULL THEN RAISE EXCEPTION 'Outreach step not found'; END IF;
  IF v.status <> 'approved_ready' THEN
    RAISE EXCEPTION 'Outreach step requires explicit approval before it can be marked sent';
  END IF;
  IF NOT public.nexus_revenue_lead_contactable(v.lead_id) THEN
    RAISE EXCEPTION 'Lead has unresolved contactability/compliance blockers';
  END IF;

  IF v.step_no=2 THEN
    IF v.due_at IS NULL THEN
      RAISE EXCEPTION 'Follow-up due date has not been created by Step 1 send';
    END IF;
    IF now() < v.due_at THEN
      RAISE EXCEPTION 'Follow-up cannot be sent before its scheduled due date';
    END IF;
  END IF;

  UPDATE public.nexus_outreach_sequence_steps
  SET status='sent',sent_at=now(),provider_message_id=p_provider_message_id,updated_at=now()
  WHERE id=v.id;

  UPDATE public.nexus_revenue_leads
  SET stage='contacted',updated_at=now()
  WHERE id=v.lead_id;

  IF v.step_no=1 THEN
    UPDATE public.nexus_outreach_sequence_steps
    SET status='pending_approval',due_at=now()+interval '3 days',updated_at=now()
    WHERE packet_id=v.packet_id AND step_no=2 AND status='waiting';
  END IF;

  RETURN v.id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_admin_mark_outreach_sent(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_admin_mark_outreach_sent(uuid,text) TO authenticated,service_role;
