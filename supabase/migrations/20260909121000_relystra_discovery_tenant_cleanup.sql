-- Only the protected QA bootstrap may erase disposable commercial fixtures.
-- Ordinary company and financial retention constraints remain unchanged.
create or replace function public.relystra_cleanup_qa_commerce(p_run_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare fixture public.nexus_qa_fixture_runs; company uuid;
begin
 select * into fixture from public.nexus_qa_fixture_runs where run_key=p_run_key for update;
 if not found then return null; end if;
 select id into company from public.nexus_companies where id=fixture.company_id and name='Nexus QA '||p_run_key for update;
 if company is null or fixture.admin_user_id is null or fixture.client_user_id is null then raise exception 'Registered QA fixture required'; end if;
 if exists(select 1 from public.nexus_build_plans where company_id=company and checkout_livemode is true)
  or exists(select 1 from public.nexus_delivery_payment_events where plan_id in (select id from public.nexus_build_plans where company_id=company) and livemode is true)
  then raise exception 'Live commercial records cannot be erased by QA cleanup'; end if;
 -- One statement validates cyclic financial/Discovery foreign keys only after
 -- every record belonging to this registered synthetic tenant is removed.
 with events as (delete from public.nexus_delivery_payment_events where plan_id in (select id from public.nexus_build_plans where company_id=company)),
 plans as (delete from public.nexus_build_plans where company_id=company),
 discoveries as (delete from public.nexus_discovery_requests where company_id=company)
 delete from public.nexus_companies where id=company;
 return company;
end $$;
revoke all on function public.relystra_cleanup_qa_commerce(text) from public,anon,authenticated;
grant execute on function public.relystra_cleanup_qa_commerce(text) to service_role;
