-- Generated recommendations reuse the administrator review boundary. Generation never approves a Build.
begin;
create or replace function private.relystra_propose_builds(p_company_id uuid,p_run_id uuid,p_run_updated_at timestamptz,p_input_versions jsonb,p_builds jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare actual jsonb; spec jsonb; ids uuid[]:='{}'; run public.nexus_diagnosis_runs%rowtype;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into run from public.nexus_diagnosis_runs where id=p_run_id and company_id=p_company_id and status='approved' for share;
  if run.id is null then raise exception 'Approved diagnosis required'; end if;
  if run.updated_at is distinct from p_run_updated_at then raise exception 'Diagnosis changed during generation. Review it and generate again'; end if;
  if jsonb_typeof(p_builds) is distinct from 'array' or jsonb_array_length(p_builds)>25 then raise exception 'Generate no more than 25 evidence-backed Builds'; end if;
  perform 1 from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' order by id for share;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') into actual
    from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' and archived_at is null
      and action_review_state='approved' and status in ('completed','approved','done');
  -- Compare the timestamp values, not their JSON formatting across PostgREST and PostgreSQL.
  if jsonb_typeof(p_input_versions) is distinct from 'array' or jsonb_array_length(p_input_versions)<>jsonb_array_length(actual)
    or exists(select 1 from jsonb_array_elements(actual) a where not exists(select 1 from jsonb_array_elements(p_input_versions) b
      where a->>'id'=b->>'id' and (a->>'updated_at')::timestamptz=(b->>'updated_at')::timestamptz)) then
    raise exception 'Accepted inputs changed during generation. Review them and generate again'; end if;
  for spec in select value from jsonb_array_elements(p_builds) loop
    -- The caller cannot elevate model output to approved, attach a different diagnosis, or provide paid terms.
    spec:=(spec-array['price_cents','currency','duration_min','duration_max','complexity','build_approved_at','build_approved_by'])
      ||jsonb_build_object('diagnosis_run_id',p_run_id,'generation_source','ai_recommendation','input_versions',actual);
    ids:=array_append(ids,private.relystra_save_build(p_company_id,null,spec,'propose'));
  end loop;
  return ids;
end $$;
create or replace function public.relystra_propose_builds(p_company_id uuid,p_run_id uuid,p_run_updated_at timestamptz,p_input_versions jsonb,p_builds jsonb)
returns uuid[] language sql security invoker set search_path='' as $$ select private.relystra_propose_builds(p_company_id,p_run_id,p_run_updated_at,p_input_versions,p_builds) $$;
revoke all on function private.relystra_propose_builds(uuid,uuid,timestamptz,jsonb,jsonb),public.relystra_propose_builds(uuid,uuid,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function private.relystra_propose_builds(uuid,uuid,timestamptz,jsonb,jsonb),public.relystra_propose_builds(uuid,uuid,timestamptz,jsonb,jsonb) to authenticated;
commit;
