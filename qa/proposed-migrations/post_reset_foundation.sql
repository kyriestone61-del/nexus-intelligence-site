-- PROPOSAL ONLY — DO NOT APPLY TO PRODUCTION DURING THE ACTIVE RESET.
-- This file is intentionally stored under qa/proposed-migrations, not supabase/migrations.
-- It addresses three P0 reset findings: explicit active engagement, client-safe Company Memory,
-- and transactional/idempotent self-service onboarding.

-- 1) Explicit active-engagement identity with a database-enforced company/project match.
alter table public.nexus_projects
  add constraint nexus_projects_company_id_id_key unique (company_id,id);

create table public.nexus_active_engagements (
  company_id uuid primary key references public.nexus_companies(id) on delete cascade,
  project_id uuid not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint nexus_active_engagement_company_project_fkey
    foreign key (company_id,project_id)
    references public.nexus_projects(company_id,id)
    on delete cascade
);

alter table public.nexus_active_engagements enable row level security;

create policy "nexus members view active engagement"
on public.nexus_active_engagements
for select to authenticated
using (public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));

create policy "nexus admins manage active engagement"
on public.nexus_active_engagements
for all to authenticated
using (public.nexus_is_platform_admin())
with check (public.nexus_is_platform_admin());

create or replace function public.nexus_set_active_engagement(p_company_id uuid,p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.nexus_is_platform_admin() then
    raise exception 'Nexus administrator access required';
  end if;

  if not exists(
    select 1 from public.nexus_projects p
    where p.id=p_project_id and p.company_id=p_company_id
      and p.status not in ('complete','cancelled')
  ) then
    raise exception 'Active engagement project not found for this company';
  end if;

  insert into public.nexus_active_engagements(company_id,project_id,updated_by,updated_at)
  values(p_company_id,p_project_id,auth.uid(),now())
  on conflict(company_id) do update
    set project_id=excluded.project_id,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at;

  return p_project_id;
end
$function$;

revoke all on function public.nexus_set_active_engagement(uuid,uuid) from public,anon;
grant execute on function public.nexus_set_active_engagement(uuid,uuid) to authenticated,service_role;

-- 2) Client-safe Company Memory projection. The existing base table remains internal-capable.
-- security_invoker ensures the underlying nexus_company_memory RLS policy still applies.
create or replace view public.nexus_company_memory_client
with (security_invoker=true)
as
select company_id,goals,systems,terminology,updated_at
from public.nexus_company_memory;

grant select on public.nexus_company_memory_client to authenticated;

-- 3) Atomic and idempotent self-service onboarding.
-- One call creates company + owner membership + initial discovery project + active-engagement record.
-- A retry by a user who already has an active company membership returns that workspace instead of
-- creating a duplicate company/project.
create or replace function public.nexus_onboard_company_atomic(
  p_name text,
  p_website text default null,
  p_industry text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_company uuid;
  v_project uuid;
  v_name text:=nullif(btrim(p_name),'');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if v_name is null then
    raise exception 'Company name is required';
  end if;

  -- Idempotent retry / legacy-onboarding recovery: self-service users operate one initial
  -- company workspace. Additional companies remain an explicit Nexus-admin operation.
  select m.company_id into v_company
  from public.nexus_company_members m
  where m.user_id=v_user and m.active is true
  order by m.created_at
  limit 1;

  if v_company is not null then
    select ae.project_id into v_project
    from public.nexus_active_engagements ae
    where ae.company_id=v_company;

    if v_project is null then
      select p.id into v_project
      from public.nexus_projects p
      where p.company_id=v_company
        and p.status not in ('complete','cancelled')
      order by p.created_at
      limit 1;

      if v_project is not null and not exists(
        select 1
        from public.nexus_projects p2
        where p2.company_id=v_company
          and p2.status not in ('complete','cancelled')
          and p2.id<>v_project
      ) then
        insert into public.nexus_active_engagements(company_id,project_id,updated_by)
        values(v_company,v_project,v_user)
        on conflict(company_id) do nothing;
      elsif exists(
        select 1 from public.nexus_projects p3
        where p3.company_id=v_company and p3.status not in ('complete','cancelled')
      ) then
        raise exception 'Existing workspace has multiple active projects; Nexus must select the active engagement.';
      end if;
    end if;

    return jsonb_build_object('company_id',v_company,'project_id',v_project,'created',false);
  end if;

  insert into public.nexus_companies(name,website,industry,created_by)
  values(v_name,nullif(btrim(p_website),''),nullif(btrim(p_industry),''),v_user)
  returning id into v_company;

  insert into public.nexus_company_members(company_id,user_id,member_role,active,added_by)
  values(v_company,v_user,'owner',true,v_user);

  insert into public.nexus_projects(
    company_id,name,service_type,service_slug,status,summary,created_by,project_type
  ) values(
    v_company,
    'Nexus Opportunity Assessment',
    'AI Opportunity Assessment / Intake',
    'ai-opportunity-assessment',
    'planning',
    'Initial Nexus discovery, evidence preparation, and opportunity definition.',
    v_user,
    'discovery'
  ) returning id into v_project;

  insert into public.nexus_active_engagements(company_id,project_id,updated_by)
  values(v_company,v_project,v_user);

  return jsonb_build_object('company_id',v_company,'project_id',v_project,'created',true);
end
$function$;

revoke all on function public.nexus_onboard_company_atomic(text,text,text) from public,anon;
grant execute on function public.nexus_onboard_company_atomic(text,text,text) to authenticated,service_role;

-- Suggested one-time backfill after review, NOT included here:
-- Populate nexus_active_engagements only for companies with exactly one non-complete/non-cancelled project.
-- Companies with >1 active project must be reviewed manually rather than guessed from created_at ordering.
