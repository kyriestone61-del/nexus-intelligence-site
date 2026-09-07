begin;
create or replace function private.relystra_workspace_snapshot(p_company_id uuid,p_project_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; d public.nexus_diagnosis_runs%rowtype; actions jsonb; builds jsonb; projects jsonb; diagnosis_access boolean; cfg public.nexus_delivery_settings%rowtype;
begin
  if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Client workspace access required'; end if;
  if not exists(select 1 from public.nexus_companies where id=p_company_id) then raise exception 'Client not found'; end if;
  if p_project_id is not null then
    select * into p from public.nexus_projects where id=p_project_id and company_id=p_company_id;
    if p.id is null then raise exception 'Project does not belong to this client'; end if;
  else
    select x.* into p from public.nexus_projects x left join public.nexus_active_engagements a on a.company_id=x.company_id and a.project_id=x.id
      where x.company_id=p_company_id and x.status not in ('complete','completed','cancelled','canceled','archived')
        and ((x.paid_at is not null and x.activated_at is not null) or a.project_id is not null)
      order by (a.project_id is not null) desc,x.activated_at desc nulls last,x.id limit 1;
  end if;
  select * into d from public.nexus_diagnosis_runs where company_id=p_company_id and (project_id is null or project_id=p.id)
    and status<>'draft' order by created_at desc,id limit 1;
  select exists(select 1 from public.nexus_company_entitlements where company_id=p_company_id and offering_code='find' and status='active'
    and starts_at<=now() and (ends_at is null or ends_at>now())) into diagnosis_access;
  select jsonb_build_object('total',count(*),'suggested',count(*) filter(where action_review_state='suggested'),
    'accepted',count(*) filter(where status in ('completed','approved','done','not_applicable')),
    'review',count(*) filter(where action_review_state='approved' and status='ready_for_review'),
    'client',count(*) filter(where action_review_state='approved' and responsible_party='client' and status not in ('completed','approved','done','not_applicable','ready_for_review')),
    'admin',count(*) filter(where action_review_state='approved' and responsible_party='admin' and status not in ('completed','approved','done','not_applicable','ready_for_review')),
    'ai_processing',count(*) filter(where action_review_state='approved' and responsible_party='ai' and status='in_progress'),
    'ai',count(*) filter(where status<>'in_progress' and action_review_state='approved' and responsible_party='ai' and status not in ('completed','approved','done','not_applicable','ready_for_review')))
    into actions from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' and archived_at is null and action_review_state not in ('rejected','postponed')
      and source_diagnosis_run_id=d.id;
  select jsonb_build_object('approved',jsonb_array_length(public.relystra_build_menu(p_company_id)),
    'proposed',(select count(*) from public.nexus_opportunities where company_id=p_company_id and build_review_state='proposed')) into builds;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'paid',paid_at is not null,'stage',package_stage) order by activated_at desc nulls last,created_at desc),'[]')
    into projects from public.nexus_projects where company_id=p_company_id;
  select * into cfg from public.nexus_delivery_settings where singleton;
  return jsonb_build_object('company_id',p_company_id,'project_id',p.id,'project_type',p.project_type,'projects',projects,
    'diagnosis',jsonb_build_object('id',d.id,'status',d.status,'access',diagnosis_access),
    'actions',actions,'builds',builds,'payment_pending',exists(select 1 from public.nexus_build_plans where company_id=p_company_id and status='awaiting_payment'),
    'package',case when p.project_type='build_package' then public.relystra_package_progress(p.id) else null end,
    'offer',jsonb_build_object('price_cents',cfg.diagnosis_price_cents,'currency',cfg.currency,'checkout_enabled',cfg.checkout_enabled));
end $$;
create or replace function public.relystra_workspace_snapshot(p_company_id uuid,p_project_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.relystra_workspace_snapshot(p_company_id,p_project_id) $$;
revoke all on function private.relystra_workspace_snapshot(uuid,uuid),public.relystra_workspace_snapshot(uuid,uuid) from public,anon;
grant execute on function private.relystra_workspace_snapshot(uuid,uuid),public.relystra_workspace_snapshot(uuid,uuid) to authenticated;
commit;
