-- Apply only after portal-foundation-hardening.js is deployed and verified.
-- Client workspaces then read Company Memory through nexus_get_company_memory_client(uuid),
-- while the raw table remains available only to Nexus platform administrators.

DROP POLICY IF EXISTS "nexus members view company memory" ON public.nexus_company_memory;
DROP POLICY IF EXISTS "nexus admins view company memory" ON public.nexus_company_memory;

CREATE POLICY "nexus admins view company memory"
ON public.nexus_company_memory
FOR SELECT TO authenticated
USING (public.nexus_is_platform_admin());

-- Defense in depth: the client-safe function continues to enforce active company membership.
REVOKE ALL ON FUNCTION public.nexus_get_company_memory_client(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_get_company_memory_client(uuid) TO authenticated,service_role;
