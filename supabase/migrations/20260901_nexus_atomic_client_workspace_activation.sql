create or replace function public.nexus_activate_client_workspace(
  p_name text,
  p_website text default null,
  p_industry text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_company public.nexus_companies%rowtype;
  v_project public.nexus_projects%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Company name is required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select c.* into v_company
  from public.nexus_company_members m
  join public.nexus_companies c on c.id = m.company_id
  where m.user_id = v_user and m.active = true
  order by m.created_at asc
  limit 1;

  if v_company.id is null then
    insert into public.nexus_companies(name, website, industry, created_by)
    values (
      btrim(p_name),
      nullif(btrim(coalesce(p_website, '')), ''),
      nullif(btrim(coalesce(p_industry, '')), ''),
      v_user
    )
    returning * into v_company;

    insert into public.nexus_company_members(company_id, user_id, member_role, added_by)
    values (v_company.id, v_user, 'owner', v_user);
  end if;

  select p.* into v_project
  from public.nexus_projects p
  where p.company_id = v_company.id
  order by p.created_at asc
  limit 1;

  if v_project.id is null then
    insert into public.nexus_projects(
      company_id, name, service_type, service_slug, status, summary, created_by
    ) values (
      v_company.id,
      'Nexus Opportunity Assessment',
      'AI Opportunity Assessment / Intake',
      'ai-opportunity-assessment',
      'planning',
      'Initial Nexus discovery, evidence preparation, and opportunity definition.',
      v_user
    )
    returning * into v_project;
  end if;

  return jsonb_build_object(
    'company_id', v_company.id,
    'company_name', v_company.name,
    'project_id', v_project.id,
    'project_name', v_project.name
  );
end;
$$;

revoke all on function public.nexus_activate_client_workspace(text,text,text) from public, anon;
grant execute on function public.nexus_activate_client_workspace(text,text,text) to authenticated;
