-- Human OS pre-marketing security gate.
-- Prevent authenticated users from probing another user's Plus entitlement.
create or replace function public.hlo_is_plus_member(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.role() <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.hlo_billing_entitlements e
    where e.user_id = p_user_id
      and e.entitlement_key = 'human_os_plus'
      and e.status in ('active', 'trialing', 'grace')
      and (e.current_period_end is null or e.current_period_end > now())
  );
end;
$$;

revoke all on function public.hlo_is_plus_member(uuid) from public;
grant execute on function public.hlo_is_plus_member(uuid) to authenticated, service_role;
