-- Complete the price-agnostic commercial foundation with an admin entitlement control.
-- Re-requesting a previously declined/cancelled solution returns it to requested instead of silently leaving it closed.

create or replace function public.nexus_set_company_entitlement(
  p_company_id uuid,
  p_offering_code text,
  p_status text default 'active',
  p_scope jsonb default '{}'::jsonb,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_code text:=lower(btrim(coalesce(p_offering_code,'')));
  v_status text:=lower(btrim(coalesce(p_status,'active')));
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  if not exists(select 1 from public.nexus_companies where id=p_company_id) then raise exception 'Company not found'; end if;
  if not exists(select 1 from public.nexus_commercial_offerings where code=v_code and active is true) then raise exception 'Commercial offering not found'; end if;
  if v_status not in ('active','pending','expired','cancelled') then raise exception 'Invalid entitlement status'; end if;
  if jsonb_typeof(coalesce(p_scope,'{}'::jsonb))<>'object' then raise exception 'Entitlement scope must be an object'; end if;

  insert into public.nexus_company_entitlements(company_id,offering_code,status,source,scope,starts_at,ends_at,created_by,updated_at)
  values(p_company_id,v_code,v_status,'manual',coalesce(p_scope,'{}'::jsonb),now(),p_ends_at,auth.uid(),now())
  on conflict(company_id,offering_code) do update set status=excluded.status,source='manual',scope=excluded.scope,ends_at=excluded.ends_at,updated_at=now(),created_by=coalesce(public.nexus_company_entitlements.created_by,auth.uid())
  returning id into v_id;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(p_company_id,auth.uid(),'commercial_entitlement_updated','company',p_company_id,'Nexus commercial entitlement updated: '||v_code||' → '||v_status||'.');
  return v_id;
end
$$;
revoke all on function public.nexus_set_company_entitlement(uuid,text,text,jsonb,timestamptz) from public,anon;
grant execute on function public.nexus_set_company_entitlement(uuid,text,text,jsonb,timestamptz) to authenticated;

create or replace function public.nexus_request_solution_purchase(p_release_id uuid,p_opportunity_index int)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_opp jsonb;
  v_title text;
  v_has_build boolean;
  v_type text;
  v_request public.nexus_solution_purchase_requests%rowtype;
  v_admin record;
begin
  select * into v_release from public.nexus_diagnosis_report_releases where id=p_release_id and status='released' and revoked_at is null;
  if v_release.id is null then raise exception 'Released diagnosis report not found'; end if;
  if not (public.nexus_is_platform_admin() or public.nexus_is_company_member(v_release.company_id)) then raise exception 'Not authorized'; end if;
  if p_opportunity_index is null or p_opportunity_index<0 then raise exception 'Opportunity index is required'; end if;
  v_opp:=v_release.client_report->'opportunities'->p_opportunity_index;
  if v_opp is null or jsonb_typeof(v_opp)<>'object' then raise exception 'Opportunity not found in this released report'; end if;
  v_title:=nullif(btrim(v_opp->>'title'),'');
  if v_title is null then raise exception 'Opportunity title is missing'; end if;
  select exists(select 1 from public.nexus_company_entitlements e where e.company_id=v_release.company_id and e.offering_code='build' and e.status='active' and (e.ends_at is null or e.ends_at>now())) into v_has_build;
  v_type:=case when v_has_build then 'included_activation' else 'standalone_scope' end;

  insert into public.nexus_solution_purchase_requests(company_id,release_id,opportunity_index,opportunity_title,opportunity_snapshot,request_type,status,requested_by)
  values(v_release.company_id,v_release.id,p_opportunity_index,v_title,v_opp,v_type,'requested',auth.uid())
  on conflict(release_id,opportunity_index,requested_by) do update set
    opportunity_title=excluded.opportunity_title,
    opportunity_snapshot=excluded.opportunity_snapshot,
    request_type=excluded.request_type,
    status=case when public.nexus_solution_purchase_requests.status in ('declined','cancelled') then 'requested' else public.nexus_solution_purchase_requests.status end,
    updated_at=now()
  returning * into v_request;

  for v_admin in select user_id from public.nexus_platform_admins loop
    if not exists(select 1 from public.nexus_notifications n where n.user_id=v_admin.user_id and n.related_type='solution_purchase_request' and n.related_id=v_request.id and n.created_at>=v_request.updated_at-interval '5 seconds') then
      insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      values(v_release.company_id,v_admin.user_id,'commercial_request','Solution request: '||v_title,case when v_type='included_activation' then 'A client wants this recommendation added to the implementation plan under its current Build engagement.' else 'A client wants to purchase this recommendation as a separately scoped implementation. Scope the work and provide the authoritative price before checkout.' end,'solution_purchase_request',v_request.id,auth.uid(),'/portal');
    end if;
  end loop;
  return jsonb_build_object('id',v_request.id,'status',v_request.status,'request_type',v_request.request_type,'opportunity_title',v_request.opportunity_title);
end
$$;
revoke all on function public.nexus_request_solution_purchase(uuid,int) from public,anon;
grant execute on function public.nexus_request_solution_purchase(uuid,int) to authenticated;
