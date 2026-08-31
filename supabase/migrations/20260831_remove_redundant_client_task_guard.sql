-- The private task-update boundary already allows the secured
-- nexus_submit_task_for_review RPC to hand a client-owned task to Nexus while
-- preserving the RLS boundary. This older public trigger duplicated the guard
-- with stricter logic and rejected that legitimate client -> Nexus handoff.
-- Remove only the redundant trigger; keep the legacy function for compatibility.

drop trigger if exists nexus_guard_client_task_update_trigger on public.nexus_tasks;

comment on function public.nexus_guard_client_task_update() is
  'Legacy client task guard retained for compatibility; active task-update enforcement is handled by private.nexus_enforce_task_update_boundary.';
