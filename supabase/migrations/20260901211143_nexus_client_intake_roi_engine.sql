create table if not exists public.nexus_client_intake (
  company_id uuid primary key references public.nexus_companies(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','reviewed')),
  current_step smallint not null default 1 check (current_step between 1 and 3),
  business_profile jsonb not null default '{}'::jsonb,
  bottlenecks jsonb not null default '[]'::jsonb,
  discovery_context text,
  evidence_summary jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  updated_by uuid default auth.uid(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nexus_client_intake enable row level security;
revoke all on table public.nexus_client_intake from anon, authenticated;
grant select, insert, update, delete on table public.nexus_client_intake to authenticated;

drop policy if exists "nexus members view client intake" on public.nexus_client_intake;
create policy "nexus members view client intake"
on public.nexus_client_intake for select to authenticated
using (public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));

drop policy if exists "nexus members create client intake" on public.nexus_client_intake;
create policy "nexus members create client intake"
on public.nexus_client_intake for insert to authenticated
with check (
  public.nexus_is_platform_admin()
  or (public.nexus_is_company_member(company_id) and created_by = (select auth.uid()))
);

drop policy if exists "nexus members update client intake" on public.nexus_client_intake;
create policy "nexus members update client intake"
on public.nexus_client_intake for update to authenticated
using (public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id))
with check (
  public.nexus_is_platform_admin()
  or (public.nexus_is_company_member(company_id) and updated_by = (select auth.uid()))
);

drop policy if exists "nexus admins delete client intake" on public.nexus_client_intake;
create policy "nexus admins delete client intake"
on public.nexus_client_intake for delete to authenticated
using (public.nexus_is_platform_admin());

drop trigger if exists nexus_client_intake_touch_updated_at on public.nexus_client_intake;
create trigger nexus_client_intake_touch_updated_at
before update on public.nexus_client_intake
for each row execute function public.nexus_touch_updated_at();

create table if not exists public.nexus_roi_estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  project_id uuid references public.nexus_projects(id) on delete set null,
  diagnosis_run_id uuid references public.nexus_diagnosis_runs(id) on delete set null,
  title text not null,
  summary text,
  monthly_hours_saved numeric(12,2),
  hourly_value_cents integer,
  monthly_value_cents integer,
  implementation_complexity smallint check (implementation_complexity between 1 and 5),
  confidence text not null default 'estimated' check (confidence in ('estimated','directional','measured','verified')),
  recommendation text,
  status text not null default 'draft' check (status in ('draft','published','approved','revision_requested','rejected','archived')),
  client_visible boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid(),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nexus_roi_estimates_company_idx on public.nexus_roi_estimates(company_id, status, sort_order);
create index if not exists nexus_roi_estimates_diagnosis_idx on public.nexus_roi_estimates(diagnosis_run_id);

alter table public.nexus_roi_estimates enable row level security;
revoke all on table public.nexus_roi_estimates from anon, authenticated;
grant select, insert, update, delete on table public.nexus_roi_estimates to authenticated;

drop policy if exists "nexus admins manage roi estimates" on public.nexus_roi_estimates;
create policy "nexus admins manage roi estimates"
on public.nexus_roi_estimates for all to authenticated
using (public.nexus_is_platform_admin())
with check (public.nexus_is_platform_admin());

drop policy if exists "nexus members view published roi estimates" on public.nexus_roi_estimates;
create policy "nexus members view published roi estimates"
on public.nexus_roi_estimates for select to authenticated
using (
  public.nexus_is_platform_admin()
  or (client_visible and status <> 'draft' and public.nexus_is_company_member(company_id))
);

drop trigger if exists nexus_roi_estimates_touch_updated_at on public.nexus_roi_estimates;
create trigger nexus_roi_estimates_touch_updated_at
before update on public.nexus_roi_estimates
for each row execute function public.nexus_touch_updated_at();
