-- Run after the Cloudflare Pages deployment uses the trusted, quota-bound
-- submit_relystra_opportunity_snapshot RPC. This avoids a public intake outage
-- during the database/application deployment overlap.
begin;

revoke all on function public.submit_nexus_opportunity_snapshot(jsonb) from public,anon,authenticated;
revoke execute on function nexus_public_internal.submit_opportunity_snapshot(jsonb) from anon,authenticated;

commit;
