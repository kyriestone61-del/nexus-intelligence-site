-- Revenue/founder approvals are Nexus-global rather than client-company scoped.
-- Permit company_id=NULL only for global records; existing RLS already limits such rows to platform admins.
ALTER TABLE public.nexus_notifications ALTER COLUMN company_id DROP NOT NULL;

COMMENT ON COLUMN public.nexus_notifications.company_id IS
  'Client-company scope when present. NULL is reserved for Nexus-global/platform-admin notifications such as Revenue Flywheel approvals.';
