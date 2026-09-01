-- Enforce company/project/source lineage for every Nexus document at the database boundary.
-- UI checks remain defense-in-depth; this trigger prevents future clients/integrations
-- from linking evidence to another company's project, requirement, or request.

CREATE OR REPLACE FUNCTION private.nexus_guard_document_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_project_company uuid;
  v_requirement_company uuid;
  v_requirement_project uuid;
  v_request_company uuid;
  v_request_project uuid;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Document company is required';
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT p.company_id INTO v_project_company
    FROM public.nexus_projects p
    WHERE p.id=NEW.project_id;
    IF v_project_company IS NULL THEN RAISE EXCEPTION 'Document project not found'; END IF;
    IF v_project_company<>NEW.company_id THEN
      RAISE EXCEPTION 'Document project must belong to the same company';
    END IF;
  END IF;

  IF NEW.data_requirement_id IS NOT NULL THEN
    SELECT r.company_id,r.project_id INTO v_requirement_company,v_requirement_project
    FROM public.nexus_project_data_requirements r
    WHERE r.id=NEW.data_requirement_id;
    IF v_requirement_company IS NULL THEN RAISE EXCEPTION 'Document data requirement not found'; END IF;
    IF v_requirement_company<>NEW.company_id THEN
      RAISE EXCEPTION 'Document data requirement must belong to the same company';
    END IF;
    IF NEW.project_id IS NULL OR NEW.project_id<>v_requirement_project THEN
      RAISE EXCEPTION 'Document data requirement must belong to the same project';
    END IF;
  END IF;

  IF NEW.request_id IS NOT NULL THEN
    SELECT r.company_id,r.project_id INTO v_request_company,v_request_project
    FROM public.nexus_document_requests r
    WHERE r.id=NEW.request_id;
    IF v_request_company IS NULL THEN RAISE EXCEPTION 'Document request not found'; END IF;
    IF v_request_company<>NEW.company_id THEN
      RAISE EXCEPTION 'Document request must belong to the same company';
    END IF;
    IF v_request_project IS NOT NULL AND (NEW.project_id IS NULL OR NEW.project_id<>v_request_project) THEN
      RAISE EXCEPTION 'Document request must belong to the same project';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_nexus_guard_document_lineage ON public.nexus_documents;
CREATE TRIGGER trg_nexus_guard_document_lineage
BEFORE INSERT OR UPDATE OF company_id,project_id,data_requirement_id,request_id
ON public.nexus_documents
FOR EACH ROW EXECUTE FUNCTION private.nexus_guard_document_lineage();
