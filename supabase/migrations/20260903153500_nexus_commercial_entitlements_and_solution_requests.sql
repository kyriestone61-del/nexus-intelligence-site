-- Nexus highlighted-items commercial foundation.
-- Mirrors the current Nexus 2.0 Find / Build / Run model without inventing checkout prices.
-- Clients can see what is included, what the next service level adds, and request an individual implementation for scope + price.

create table if not exists public.nexus_commercial_offerings (
  code text primary key,
  name text not null,
  description text not null,
  client_outcome text not null,
  pricing_model text not null,
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.nexus_commercial_offerings(code,name,description,client_outcome,pricing_model,sort_order)
values
  ('find','Find My AI Opportunities','Evidence-backed business diagnosis, AI leverage opportunities, readiness gaps, economic case, risk profile, and a recommended first implementation.','Know what to improve first and why.','Fixed-fee or low-friction diagnostic; a limited free snapshot may be used for lead generation.',10),
  ('build','Build My AI Systems','Nexus scopes, configures, integrates, tests, trains, launches, and measures selected AI or automation implementations.','Turn selected opportunities into governed working systems.','Fixed scope based on business outcome, integration complexity, risk, data requirements, systems, and implementation module.',20),
  ('run','Run My AI Operations','Ongoing monitoring, optimization, governance, cost control, incident handling, model/workflow changes, reporting, and continuous opportunity discovery.','Keep deployed AI systems reliable, governed, economical, and improving.','Monthly recurring fee based on system criticality, run volume, governance burden, SLA, optimization cadence, and support level.',30)
on conflict(code) do update set name=excluded.name,description=excluded.description,client_outcome=excluded.client_outcome,pricing_model=excluded.pricing_model,sort_order=excluded.sort_order,active=true,updated_at=now();

create table if not exists public.nexus_company_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  offering_code text not null references public.nexus_commercial_offerings(code) on delete restrict,
  status text not null default 'active' check(status in ('active','pending','expired','cancelled')),
  source text not null default 'manual' check(source in ('manual','contract','purchase','legacy','diagnosis_delivery')),
  scope jsonb not null default '{}'::jsonb check(jsonb_typeof(scope)='object'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,offering_code)
);
create index if not exists nexus_company_entitlements_active_idx on public.nexus_company_entitlements(company_id,status,offering_code);

-- A released diagnosis proves that the Find service has been delivered; record that entitlement without inferring a paid price.
insert into public.nexus_company_entitlements(company_id,offering_code,status,source,scope,starts_at,created_by)
select distinct r.company_id,'find','active','diagnosis_delivery',jsonb_build_object('diagnosis_release_id',r.id),coalesce(r.released_at,now()),r.released_by
from public.nexus_diagnosis_report_releases r
where r.status='released' and r.revoked_at is null
on conflict(company_id,offering_code) do nothing;

create table if not exists public.nexus_solution_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  release_id uuid not null references public.nexus_diagnosis_report_releases(id) on delete cascade,
  opportunity_index int not null check(opportunity_index>=0),
  opportunity_title text not null,
  opportunity_snapshot jsonb not null check(jsonb_typeof(opportunity_snapshot)='object'),
  request_type text not null check(request_type in ('standalone_scope','included_activation')),
  status text not null default 'requested' check(status in ('requested','scoping','quoted','accepted','declined','cancelled','activated')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(release_id,opportunity_index,requested_by)
);
create index if not exists nexus_solution_purchase_requests_company_status_idx on public.nexus_solution_purchase_requests(company_id,status,requested_at desc);

alter table public.nexus_commercial_offerings enable row level security;
alter table public.nexus_company_entitlements enable row level security;
alter table public.nexus_solution_purchase_requests enable row level security;

revoke all on public.nexus_commercial_offerings from anon;
revoke all on public.nexus_company_entitlements from anon;
revoke all on public.nexus_solution_purchase_requests from anon;
revoke all on public.nexus_commercial_offerings from authenticated;
revoke all on public.nexus_company_entitlements from authenticated;
revoke all on public.nexus_solution_purchase_requests from authenticated;
grant select on public.nexus_commercial_offerings to authenticated;
grant select on public.nexus_company_entitlements to authenticated;
grant select on public.nexus_solution_purchase_requests to authenticated;

drop policy if exists nexus_commercial_offerings_authenticated_select on public.nexus_commercial_offerings;
create policy nexus_commercial_offerings_authenticated_select on public.nexus_commercial_offerings for select to authenticated using(active=true);
drop policy if exists nexus_company_entitlements_member_select on public.nexus_company_entitlements;
create policy nexus_company_entitlements_member_select on public.nexus_company_entitlements for select to authenticated using(public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));
drop policy if exists nexus_solution_purchase_requests_member_select on public.nexus_solution_purchase_requests;
create policy nexus_solution_purchase_requests_member_select on public.nexus_solution_purchase_requests for select to authenticated using(public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));

create or replace function public.nexus_client_commercial_context(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_offerings jsonb;
  v_entitlements jsonb;
  v_requests jsonb;
begin
  if not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('code',o.code,'name',o.name,'description',o.description,'client_outcome',o.client_outcome,'pricing_model',o.pricing_model,'sort_order',o.sort_order) order by o.sort_order),'[]'::jsonb) into v_offerings from public.nexus_commercial_offerings o where o.active is true;
  select coalesce(jsonb_agg(jsonb_build_object('offering_code',e.offering_code,'status',e.status,'source',e.source,'scope',e.scope,'starts_at',e.starts_at,'ends_at',e.ends_at)),'[]'::jsonb) into v_entitlements from public.nexus_company_entitlements e where e.company_id=p_company_id and e.status='active' and (e.ends_at is null or e.ends_at>now());
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'release_id',r.release_id,'opportunity_index',r.opportunity_index,'opportunity_title',r.opportunity_title,'request_type',r.request_type,'status',r.status,'requested_at',r.requested_at) order by r.requested_at desc),'[]'::jsonb) into v_requests from public.nexus_solution_purchase_requests r where r.company_id=p_company_id and r.requested_by=auth.uid();
  return jsonb_build_object('offerings',v_offerings,'entitlements',v_entitlements,'requests',v_requests);
end
$$;
revoke all on function public.nexus_client_commercial_context(uuid) from public,anon;
grant execute on function public.nexus_client_commercial_context(uuid) to authenticated;

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
  on conflict(release_id,opportunity_index,requested_by) do update set opportunity_title=excluded.opportunity_title,opportunity_snapshot=excluded.opportunity_snapshot,request_type=excluded.request_type,updated_at=now()
  returning * into v_request;

  for v_admin in select user_id from public.nexus_platform_admins loop
    if not exists(select 1 from public.nexus_notifications n where n.user_id=v_admin.user_id and n.related_type='solution_purchase_request' and n.related_id=v_request.id) then
      insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      values(v_release.company_id,v_admin.user_id,'commercial_request','Solution request: '||v_title,case when v_type='included_activation' then 'A client wants this recommendation added to the implementation plan under its current Build engagement.' else 'A client wants to purchase this recommendation as a separately scoped implementation. Scope the work and provide the authoritative price before checkout.' end,'solution_purchase_request',v_request.id,auth.uid(),'/portal');
    end if;
  end loop;

  return jsonb_build_object('id',v_request.id,'status',v_request.status,'request_type',v_request.request_type,'opportunity_title',v_request.opportunity_title);
end
$$;
revoke all on function public.nexus_request_solution_purchase(uuid,int) from public,anon;
grant execute on function public.nexus_request_solution_purchase(uuid,int) to authenticated;
