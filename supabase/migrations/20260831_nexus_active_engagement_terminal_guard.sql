-- Ensure an active-engagement pointer can never remain attached to a terminal project.
-- If exactly one other open project remains, select it deterministically; otherwise leave the
-- company without a pointer so the admin must choose explicitly.

CREATE OR REPLACE FUNCTION public.nexus_reconcile_active_engagement_after_project_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_remaining uuid;
  v_count integer;
  v_actor uuid;
BEGIN
  IF NEW.status NOT IN ('complete','cancelled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Only act when this project is actually the current pointer.
  IF NOT EXISTS (
    SELECT 1 FROM public.nexus_active_engagements ae
    WHERE ae.company_id=NEW.company_id AND ae.project_id=NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.nexus_active_engagements
  WHERE company_id=NEW.company_id AND project_id=NEW.id;

  SELECT count(*),min(id)
  INTO v_count,v_remaining
  FROM public.nexus_projects p
  WHERE p.company_id=NEW.company_id
    AND p.status NOT IN ('complete','cancelled');

  IF v_count=1 AND v_remaining IS NOT NULL THEN
    v_actor:=coalesce(auth.uid(),NEW.created_by);
    INSERT INTO public.nexus_active_engagements(company_id,project_id,updated_by,updated_at)
    VALUES(NEW.company_id,v_remaining,v_actor,now())
    ON CONFLICT(company_id) DO UPDATE SET
      project_id=excluded.project_id,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS nexus_project_terminal_reconcile_active_engagement ON public.nexus_projects;
CREATE TRIGGER nexus_project_terminal_reconcile_active_engagement
AFTER UPDATE OF status ON public.nexus_projects
FOR EACH ROW
WHEN (NEW.status IN ('complete','cancelled'))
EXECUTE FUNCTION public.nexus_reconcile_active_engagement_after_project_terminal();

REVOKE ALL ON FUNCTION public.nexus_reconcile_active_engagement_after_project_terminal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_reconcile_active_engagement_after_project_terminal() TO service_role;
