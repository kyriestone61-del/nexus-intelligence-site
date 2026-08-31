-- Restrict diagnosis release RPCs to signed-in users only.
-- Each function also performs its own Nexus platform-admin authorization check.

revoke execute on function public.nexus_release_approval(uuid) from public, anon;
revoke execute on function public.nexus_release_client_task(uuid) from public, anon;
revoke execute on function public.nexus_release_document_request(uuid) from public, anon;

grant execute on function public.nexus_release_approval(uuid) to authenticated;
grant execute on function public.nexus_release_client_task(uuid) to authenticated;
grant execute on function public.nexus_release_document_request(uuid) to authenticated;
