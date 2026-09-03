-- Step 2 advisor hardening after production migration verification.
-- Keep browser-callable coordination RPCs as SECURITY INVOKER so RLS remains the enforcement boundary,
-- and add covering indexes for the foreign keys introduced by the redesign.

alter function public.nexus_save_discovery_admin_context(uuid,uuid,text) security invoker;
alter function public.nexus_send_discovery_information_request(uuid,uuid,uuid,jsonb) security invoker;
alter function public.nexus_release_document_request(uuid) security invoker;

create index if not exists nexus_discovery_context_project_idx
  on public.nexus_discovery_context_entries(project_id)
  where project_id is not null;
create index if not exists nexus_discovery_context_created_by_idx
  on public.nexus_discovery_context_entries(created_by);
create index if not exists nexus_discovery_gap_project_idx
  on public.nexus_discovery_gap_analyses(project_id)
  where project_id is not null;
create index if not exists nexus_discovery_gap_created_by_idx
  on public.nexus_discovery_gap_analyses(created_by)
  where created_by is not null;
