begin;
create or replace function private.relystra_guard_build_dependencies()
returns trigger language plpgsql security definer set search_path='' as $$
declare dependency text;
begin
  if new.build_spec is null then return new; end if;
  if tg_op='UPDATE' and old.build_review_state='approved' and new.build_review_state<>'approved'
    and exists(select 1 from public.nexus_opportunities d where d.company_id=new.company_id and d.id<>new.id and d.build_review_state='approved'
      and coalesce(d.build_spec->'dependencies','[]') ? new.id::text) then
    raise exception 'Review the dependent Builds before withdrawing this prerequisite';
  end if;
  if new.build_review_state<>'approved' then return new; end if;
  if jsonb_typeof(coalesce(new.build_spec->'dependencies','[]'))<>'array' then raise exception 'Choose approved prerequisite Builds'; end if;
  for dependency in select jsonb_array_elements_text(coalesce(new.build_spec->'dependencies','[]')) loop
    if dependency=new.id::text or not exists(select 1 from public.nexus_opportunities d where d.id::text=dependency and d.company_id=new.company_id and d.build_review_state='approved') then
      raise exception 'Dependencies must be other approved Builds for this client';
    end if;
    if exists(select 1 from public.nexus_system_cards b where b.opportunity_id::text=dependency and b.company_id=new.company_id and b.build_status<>'complete') then
      raise exception 'A purchased prerequisite must finish before approving this dependent Build';
    end if;
  end loop;
  if exists(with recursive prerequisites(id,path) as (
    select value,array[new.id::text,value] from jsonb_array_elements_text(coalesce(new.build_spec->'dependencies','[]'))
    union all select next.value,p.path||next.value from prerequisites p join public.nexus_opportunities d on d.id::text=p.id and d.company_id=new.company_id
      cross join lateral jsonb_array_elements_text(coalesce(d.build_spec->'dependencies','[]')) next(value)
      where not p.id=any(p.path[1:array_length(p.path,1)-1])
  ) select 1 from prerequisites where id=new.id::text) then raise exception 'Build dependencies cannot form a cycle'; end if;
  return new;
end $$;
create trigger relystra_build_dependencies before insert or update on public.nexus_opportunities
  for each row execute function private.relystra_guard_build_dependencies();

-- Clients can mark their existing notifications read, but cannot forge or rewrite delivery deduplication keys.
create policy relystra_notification_origin on public.nexus_notifications as restrictive for insert to authenticated with check(delivery_event_key is null);
create or replace function private.relystra_guard_notification_key()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.delivery_event_key is distinct from old.delivery_event_key then raise exception 'Delivery notification identity is immutable'; end if;
  return new;
end $$;
create trigger relystra_notification_key before update on public.nexus_notifications for each row execute function private.relystra_guard_notification_key();
revoke all on function private.relystra_guard_build_dependencies(),private.relystra_guard_notification_key() from public,anon,authenticated;
-- Preserve existing engagements, while preventing retired creation paths from bypassing paid activation.
create or replace function private.relystra_guard_new_project_kind()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.project_type is distinct from 'build_package' then raise exception 'New Projects are created by verified Build Package payment'; end if;
  return new;
end $$;
create trigger relystra_new_project_kind before insert on public.nexus_projects for each row execute function private.relystra_guard_new_project_kind();

create or replace function private.relystra_validate_delivery_settings()
returns trigger language plpgsql set search_path='' as $$
declare tier text; guidance jsonb; value jsonb;
begin
  foreach tier in array array['simple','standard','advanced'] loop
    foreach guidance in array array[new.price_guidance,new.duration_guidance] loop
      value:=guidance->tier;
      if jsonb_typeof(value) is distinct from 'array' then raise exception 'Each tier requires minimum and maximum guidance'; end if;
      if jsonb_array_length(value)<>2 or jsonb_typeof(value->0)<>'number' or jsonb_typeof(value->1)<>'number' then raise exception 'Each tier requires two numeric guidance values'; end if;
      if value->>0 !~ '^[0-9]+$' or value->>1 !~ '^[0-9]+$' then raise exception 'Guidance uses whole cents and business days'; end if;
      if (value->>0)::numeric<1 or (value->>1)::numeric<(value->>0)::numeric then raise exception 'Guidance maximum must be at least its positive minimum'; end if;
    end loop;
  end loop;
  new.updated_by:=auth.uid();new.updated_at:=now();return new;
end $$;
create trigger relystra_settings_valid before update on public.nexus_delivery_settings for each row execute function private.relystra_validate_delivery_settings();
revoke all on function private.relystra_guard_new_project_kind(),private.relystra_validate_delivery_settings() from public,anon,authenticated;
commit;
