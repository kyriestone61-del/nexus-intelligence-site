-- Prepared locally only. Preserve authorization and storage status; expose only a current, sanitized review decision.
create or replace function private.relystra_package_progress(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; builds jsonb;
begin
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package';
  if auth.uid() is null or p.id is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p.company_id)) then raise exception 'Package access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'outcome',b.purpose,'status',b.build_status,
    'review_decision',case when b.client_review->>'content_digest'=md5(b.delivery_content::text)
      and exists(select 1 from jsonb_array_elements(p.draft_package->'items') item
        where item->>'build_id'=b.id::text and item->>'content_digest'=md5(b.delivery_content::text))
      -- Acceptance belongs to unchanged Build content, not the package revision ID.
      -- Existing final-QA gates carry these approvals forward when another Build changes.
      and (b.client_review->>'decision'='approve'
        or (b.client_review->>'draft_id'=p.draft_package->>'id'
          and b.client_review->>'decision' in ('minor_revision','problem')))
      then b.client_review->>'decision' else null end,
    'percent',case when b.build_status='complete' then 100 when counts.total=0 then 0 else least(90,floor(counts.done::numeric*90/counts.total)::integer) end)
    order by b.created_at,b.id),'[]') into builds from public.nexus_system_cards b
    cross join lateral (select count(*)::integer total,count(*) filter(where t.status in ('completed','approved','done'))::integer done
      from public.nexus_tasks t where t.build_id=b.id and t.work_kind='build_task' and t.archived_at is null) counts
    where b.project_id=p.id and b.opportunity_id is not null;
  return jsonb_build_object('project_id',p.id,'name',p.name,'stage',p.package_stage,'livemode',p.payment_livemode,'builds',builds,
    'percent',case when p.package_stage in ('support','completed') then 100 else coalesce((select floor(avg((i->>'percent')::numeric))::integer from jsonb_array_elements(builds) i),0) end,
    'support_starts_at',p.support_starts_at,'support_ends_at',p.support_ends_at);
end $$;
