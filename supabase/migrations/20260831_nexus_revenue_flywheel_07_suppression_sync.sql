-- QA/QC hotfix: direct do-not-contact changes must create/resolve the explicit
-- suppression exception after the lead row is committed to its new state.

create or replace function public.nexus_revenue_lead_suppression_exception_sync()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform public.nexus_classify_revenue_lead_exceptions(new.id);
  return new;
end
$function$;

revoke all on function public.nexus_revenue_lead_suppression_exception_sync() from public,anon,authenticated;

drop trigger if exists nexus_revenue_lead_suppression_exception_sync on public.nexus_revenue_leads;
create trigger nexus_revenue_lead_suppression_exception_sync
after update of do_not_contact,suppression_reason on public.nexus_revenue_leads
for each row execute function public.nexus_revenue_lead_suppression_exception_sync();
