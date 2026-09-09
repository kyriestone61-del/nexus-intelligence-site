begin;
-- An existing active owner keeps their role when another paid scope is accepted.
create or replace function public.relystra_complete_initial_invite(p_plan_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; d public.nexus_discovery_requests%rowtype;
begin
 select * into p from public.nexus_build_plans where id=p_plan_id and status='paid';
 select * into d from public.nexus_discovery_requests where id=p.source_discovery_id and company_id=p.company_id and initial_plan_id=p.id for update;
 if d.id is null then raise exception 'Verified initial engagement required'; end if;
 if d.invited_user_id is not null then return; end if;
 if not exists(select 1 from public.nexus_company_members where company_id=d.company_id and user_id=p_user_id and active) then
  perform public.relystra_queue_client_invite(p_user_id,d.company_id,d.report_approved_by,d.email,d.full_name);
 end if;
 update public.nexus_discovery_requests set invited_user_id=p_user_id where id=d.id;
end $$;
revoke all on function public.relystra_complete_initial_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.relystra_complete_initial_invite(uuid,uuid) to service_role;
commit;
