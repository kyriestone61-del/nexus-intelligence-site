-- Target-profile classification and evidence-backed lost-revenue estimator.
-- These controls make target fit and economic-impact outputs explicit without inventing values.

create or replace view public.nexus_revenue_lead_fit_v
with (security_invoker=true)
as
select
  l.id as lead_id,
  l.company_name,
  l.niche,
  l.annual_revenue_min,
  l.annual_revenue_max,
  l.employee_count,
  case
    when nullif(btrim(l.niche),'') is null then null
    else lower(l.niche) ~ '(local service|legal|law|real estate|e-commerce|ecommerce|logistics|healthcare|clinic)'
  end as niche_fit,
  case
    when l.annual_revenue_min is null and l.annual_revenue_max is null then null
    else coalesce(l.annual_revenue_max,l.annual_revenue_min) >= 1000000
      and coalesce(l.annual_revenue_min,l.annual_revenue_max) <= 15000000
  end as revenue_fit,
  case when l.employee_count is null then null else l.employee_count between 10 and 100 end as team_fit,
  case
    when (nullif(btrim(l.niche),'') is not null and not (lower(l.niche) ~ '(local service|legal|law|real estate|e-commerce|ecommerce|logistics|healthcare|clinic)'))
      or ((l.annual_revenue_min is not null or l.annual_revenue_max is not null) and not (
        coalesce(l.annual_revenue_max,l.annual_revenue_min) >= 1000000
        and coalesce(l.annual_revenue_min,l.annual_revenue_max) <= 15000000
      ))
      or (l.employee_count is not null and l.employee_count not between 10 and 100)
      then 'outside_target'
    when nullif(btrim(l.niche),'') is not null
      and l.annual_revenue_min is not null
      and l.annual_revenue_max is not null
      and l.employee_count is not null
      then 'target_fit'
    else 'possible_fit'
  end as target_fit_status
from public.nexus_revenue_leads l;
grant select on public.nexus_revenue_lead_fit_v to authenticated,service_role;

create or replace function public.nexus_admin_calculate_lost_revenue_estimate(
  p_lead_id uuid,
  p_monthly_lead_volume numeric,
  p_response_loss_rate numeric,
  p_close_rate numeric,
  p_average_customer_value numeric,
  p_evidence_ids uuid[]
)
returns numeric
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_estimate numeric;
  v_required integer;
  v_verified integer;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  if p_monthly_lead_volume is null or p_monthly_lead_volume < 0 then raise exception 'Monthly lead volume must be non-negative'; end if;
  if p_response_loss_rate is null or p_response_loss_rate < 0 or p_response_loss_rate > 1 then raise exception 'Response loss rate must be between 0 and 1'; end if;
  if p_close_rate is null or p_close_rate < 0 or p_close_rate > 1 then raise exception 'Close rate must be between 0 and 1'; end if;
  if p_average_customer_value is null or p_average_customer_value < 0 then raise exception 'Average customer value must be non-negative'; end if;
  v_required:=coalesce(cardinality(p_evidence_ids),0);
  if v_required=0 then raise exception 'At least one verified evidence record is required'; end if;

  select count(*) into v_verified
  from public.nexus_lead_research_evidence e
  where e.lead_id=p_lead_id and e.verified and e.id=any(p_evidence_ids);
  if v_verified<>v_required then raise exception 'Every economic-model evidence reference must belong to the lead and be verified'; end if;

  v_estimate:=round(p_monthly_lead_volume*p_response_loss_rate*p_close_rate*p_average_customer_value,2);
  update public.nexus_revenue_leads
     set estimated_lost_monthly_revenue=v_estimate,
         lost_revenue_basis=jsonb_build_object(
           'model','monthly_leads_x_response_loss_x_close_rate_x_average_customer_value',
           'monthly_lead_volume',p_monthly_lead_volume,
           'response_loss_rate',p_response_loss_rate,
           'close_rate',p_close_rate,
           'average_customer_value',p_average_customer_value,
           'evidence_ids',to_jsonb(p_evidence_ids),
           'calculated_at',now(),
           'calculation_note','Estimate, not realized revenue. Every input requires verified lead evidence and human review.'
         ),
         updated_at=now()
   where id=p_lead_id;
  if not found then raise exception 'Lead not found'; end if;
  perform public.nexus_classify_revenue_lead_exceptions(p_lead_id);
  return v_estimate;
end
$function$;
revoke all on function public.nexus_admin_calculate_lost_revenue_estimate(uuid,numeric,numeric,numeric,numeric,uuid[]) from public,anon;
grant execute on function public.nexus_admin_calculate_lost_revenue_estimate(uuid,numeric,numeric,numeric,numeric,uuid[]) to authenticated,service_role;
