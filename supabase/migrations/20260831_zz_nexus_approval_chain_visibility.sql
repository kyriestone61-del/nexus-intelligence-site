-- Final privacy/integrity boundary for approval chains.

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.nexus_approval_chains'::regclass
      AND conname='nexus_approval_chains_company_project_fkey'
  ) THEN
    ALTER TABLE public.nexus_approval_chains
      ADD CONSTRAINT nexus_approval_chains_company_project_fkey
      FOREIGN KEY(company_id,project_id)
      REFERENCES public.nexus_projects(company_id,id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.nexus_approval_chains'::regclass
      AND conname='nexus_approval_chains_visibility_company_check'
  ) THEN
    ALTER TABLE public.nexus_approval_chains
      ADD CONSTRAINT nexus_approval_chains_visibility_company_check
      CHECK (visibility<>'company' OR company_id IS NOT NULL);
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.nexus_approval_chains'::regclass
      AND conname='nexus_approval_chains_global_project_check'
  ) THEN
    ALTER TABLE public.nexus_approval_chains
      ADD CONSTRAINT nexus_approval_chains_global_project_check
      CHECK (company_id IS NOT NULL OR project_id IS NULL);
  END IF;
END $$;

DROP POLICY IF EXISTS "nexus members view company approval chains" ON public.nexus_approval_chains;
CREATE POLICY "nexus members view company approval chains" ON public.nexus_approval_chains
FOR SELECT TO authenticated
USING (
  visibility='company'
  AND status<>'draft'
  AND company_id IS NOT NULL
  AND public.nexus_is_company_member(company_id)
);

DROP POLICY IF EXISTS "nexus members view company approval steps" ON public.nexus_approval_chain_steps;
CREATE POLICY "nexus members view company approval steps" ON public.nexus_approval_chain_steps
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.nexus_approval_chains c
  WHERE c.id=chain_id
    AND c.visibility='company'
    AND c.status<>'draft'
    AND c.company_id IS NOT NULL
    AND public.nexus_is_company_member(c.company_id)
));

DROP POLICY IF EXISTS "nexus members view company approval events" ON public.nexus_approval_events;
CREATE POLICY "nexus members view company approval events" ON public.nexus_approval_events
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.nexus_approval_chains c
  WHERE c.id=chain_id
    AND c.visibility='company'
    AND c.status<>'draft'
    AND c.company_id IS NOT NULL
    AND public.nexus_is_company_member(c.company_id)
));
