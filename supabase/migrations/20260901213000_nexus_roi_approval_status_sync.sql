create or replace function public.nexus_sync_roi_from_approval_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'roi_estimate'
     and new.entity_id is not null
     and new.status is distinct from old.status then
    update public.nexus_roi_estimates
    set status = case new.status
      when 'approved' then 'approved'
      when 'changes_requested' then 'revision_requested'
      when 'rejected' then 'rejected'
      else status
    end,
    approved_at = case when new.status = 'approved' then coalesce(approved_at, now()) else approved_at end,
    updated_at = now()
    where id = new.entity_id;
  end if;
  return new;
end;
$$;

revoke all on function public.nexus_sync_roi_from_approval_chain() from public;

drop trigger if exists nexus_roi_approval_status_sync on public.nexus_approval_chains;
create trigger nexus_roi_approval_status_sync
after update of status on public.nexus_approval_chains
for each row
when (new.entity_type = 'roi_estimate')
execute function public.nexus_sync_roi_from_approval_chain();
