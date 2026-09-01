-- Add explicit human-accountability provenance to Revenue Flywheel artifacts.
-- System/service-generated records inherit the active Nexus platform administrator when no actor is supplied.

ALTER TABLE public.nexus_outreach_packets
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.nexus_outreach_sequence_steps
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION private.nexus_default_platform_admin_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT a.user_id
  FROM public.nexus_platform_admins a
  ORDER BY a.created_at,a.user_id
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION private.nexus_default_platform_admin_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.nexus_default_platform_admin_user() TO service_role;

CREATE OR REPLACE FUNCTION private.nexus_set_revenue_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by:=coalesce(auth.uid(),private.nexus_default_platform_admin_user());
  END IF;
  IF NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'Nexus platform administrator is required for revenue workflow accountability';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS nexus_outreach_packet_created_by ON public.nexus_outreach_packets;
CREATE TRIGGER nexus_outreach_packet_created_by
BEFORE INSERT ON public.nexus_outreach_packets
FOR EACH ROW EXECUTE FUNCTION private.nexus_set_revenue_created_by();

DROP TRIGGER IF EXISTS nexus_outreach_step_created_by ON public.nexus_outreach_sequence_steps;
CREATE TRIGGER nexus_outreach_step_created_by
BEFORE INSERT ON public.nexus_outreach_sequence_steps
FOR EACH ROW EXECUTE FUNCTION private.nexus_set_revenue_created_by();

UPDATE public.nexus_outreach_packets
SET created_by=private.nexus_default_platform_admin_user()
WHERE created_by IS NULL;
UPDATE public.nexus_outreach_sequence_steps
SET created_by=private.nexus_default_platform_admin_user()
WHERE created_by IS NULL;

ALTER TABLE public.nexus_outreach_packets ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE public.nexus_outreach_sequence_steps ALTER COLUMN created_by SET NOT NULL;
