-- Explicitly remove implicit PUBLIC/anon EXECUTE from the Action Item Processing
-- Engine's SECURITY DEFINER RPCs. Authorization inside each RPC still enforces
-- client company membership or Nexus platform-admin scope.

revoke execute on function public.nexus_start_task(uuid) from public, anon;
grant execute on function public.nexus_start_task(uuid) to authenticated;

revoke execute on function public.nexus_request_task_help(uuid,text) from public, anon;
grant execute on function public.nexus_request_task_help(uuid,text) to authenticated;

revoke execute on function public.nexus_submit_task_for_review(uuid,jsonb) from public, anon;
grant execute on function public.nexus_submit_task_for_review(uuid,jsonb) to authenticated;

revoke execute on function public.nexus_approve_task(uuid,text) from public, anon;
grant execute on function public.nexus_approve_task(uuid,text) to authenticated;

revoke execute on function public.nexus_request_task_revision(uuid,text) from public, anon;
grant execute on function public.nexus_request_task_revision(uuid,text) to authenticated;

revoke execute on function public.nexus_admin_task_action(uuid,text,text,text) from public, anon;
grant execute on function public.nexus_admin_task_action(uuid,text,text,text) to authenticated;

revoke execute on function public.nexus_assign_action_template(uuid,uuid,text,date,text) from public, anon;
grant execute on function public.nexus_assign_action_template(uuid,uuid,text,date,text) to authenticated;

revoke execute on function public.nexus_assign_action_package(uuid,uuid,text,date) from public, anon;
grant execute on function public.nexus_assign_action_package(uuid,uuid,text,date) to authenticated;
