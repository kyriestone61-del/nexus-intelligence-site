-- Nexus pre-marketing security hardening.
-- Remove anonymous EXECUTE from SECURITY DEFINER functions that require authenticated/admin use.
-- The functions retain their internal authorization checks; this narrows the exposed API surface.

revoke execute on function public.nexus_admin_apply_manual_diagnosis(uuid,jsonb,jsonb,text) from anon;

-- This function inherited EXECUTE from PUBLIC in addition to explicit role grants.
revoke execute on function public.nexus_get_client_action_context(uuid) from public;
revoke execute on function public.nexus_get_client_action_context(uuid) from anon;
grant execute on function public.nexus_get_client_action_context(uuid) to authenticated, service_role;

revoke execute on function public.nexus_get_inbox_admin_preview(uuid) from anon;

-- Trigger function: no anonymous direct execution is required.
revoke execute on function public.nexus_sync_roi_from_approval_chain() from anon;
