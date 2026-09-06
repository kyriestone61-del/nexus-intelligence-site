-- Security-critical recovery mail is claimed before ordinary notification mail.
-- The change preserves the existing queue, skip-locked concurrency model and batch limits.

create or replace function public.nexus_claim_email_batch(p_limit integer default 20)
returns setof public.nexus_email_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with claimed as (
    select e.id
    from public.nexus_email_outbox e
    where e.status='queued' and e.available_at<=now()
    order by case when e.message_kind='auth_recovery' then 0 else 1 end,
             e.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),50))
  ), updated as (
    update public.nexus_email_outbox e
       set status='sending',attempts=e.attempts+1,updated_at=now()
      from claimed c
     where e.id=c.id
     returning e.*
  )
  select * from updated;
end
$$;

revoke all on function public.nexus_claim_email_batch(integer) from public, anon, authenticated;
grant execute on function public.nexus_claim_email_batch(integer) to service_role;
