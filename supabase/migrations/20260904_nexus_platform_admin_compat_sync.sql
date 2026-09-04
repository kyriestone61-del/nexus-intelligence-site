-- Keep the canonical nexus_platform_members role model synchronized with the
-- legacy nexus_platform_admins compatibility table used by secured runtimes.

create or replace function private.nexus_sync_platform_admin_compat()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op='DELETE' then
    delete from public.nexus_platform_admins where user_id=old.user_id;
    return old;
  end if;
  if new.active is true and new.platform_role in ('owner','admin') then
    insert into public.nexus_platform_admins(user_id) values(new.user_id) on conflict(user_id) do nothing;
  else
    delete from public.nexus_platform_admins where user_id=new.user_id;
  end if;
  return new;
end
$function$;

drop trigger if exists nexus_platform_admin_compat_sync on public.nexus_platform_members;
create trigger nexus_platform_admin_compat_sync
after insert or update of platform_role,active or delete on public.nexus_platform_members
for each row execute function private.nexus_sync_platform_admin_compat();

insert into public.nexus_platform_admins(user_id)
select user_id from public.nexus_platform_members
where active is true and platform_role in ('owner','admin')
on conflict(user_id) do nothing;
