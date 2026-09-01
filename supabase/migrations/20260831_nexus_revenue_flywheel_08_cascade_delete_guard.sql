-- QA/QC hotfix: when a revenue lead is deleted, evidence cascades after the
-- parent row is already gone. Do not attempt to rescore a nonexistent parent.
-- Manual evidence deletion still recalculates the surviving lead.

create or replace function public.nexus_lead_evidence_rescore_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.nexus_revenue_leads where id=old.lead_id) then
      perform public.nexus_recalculate_revenue_lead_score(old.lead_id);
    end if;
    return old;
  end if;
  perform public.nexus_recalculate_revenue_lead_score(new.lead_id);
  return new;
end
$function$;

revoke all on function public.nexus_lead_evidence_rescore_trigger() from public,anon,authenticated;
