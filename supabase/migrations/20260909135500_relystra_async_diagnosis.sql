alter table public.nexus_diagnosis_runs add column if not exists execution_lease_id uuid;
alter table public.nexus_diagnosis_runs add column if not exists execution_lease_expires_at timestamptz;
-- Persist bounded analysis stages so a complete diagnosis can exceed a single
-- Edge request without publishing partial reports or exposing provider payloads.
create table public.relystra_diagnosis_jobs (
  run_id uuid primary key references public.nexus_diagnosis_runs(id) on delete cascade,
  lease_id uuid not null,
  payload jsonb not null,
  execution jsonb not null,
  stage integer not null default 0 check(stage between 0 and 3),
  partial_result jsonb not null default '{}',
  stage_lease_id uuid,
  stage_lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table public.relystra_diagnosis_jobs enable row level security;
revoke all on public.relystra_diagnosis_jobs from public,anon,authenticated;
grant all on public.relystra_diagnosis_jobs to service_role;

create function public.relystra_enqueue_diagnosis_job(p_run_id uuid,p_lease_id uuid,p_payload jsonb,p_execution jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.nexus_diagnosis_runs%rowtype; j public.relystra_diagnosis_jobs%rowtype;
begin
  select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
  if r.id is null or r.status<>'analyzing' or r.execution_lease_id is distinct from p_lease_id or r.execution_lease_expires_at<=now() then raise exception 'DIAGNOSIS_LEASE_LOST'; end if;
  select * into j from public.relystra_diagnosis_jobs where run_id=p_run_id;
  if j.run_id is not null and j.lease_id=p_lease_id then return true; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2000000 or jsonb_typeof(p_execution) is distinct from 'object' then raise exception 'INVALID_DIAGNOSIS_REQUEST'; end if;
  delete from public.relystra_diagnosis_jobs where run_id=p_run_id;
  insert into public.relystra_diagnosis_jobs(run_id,lease_id,payload,execution) values(p_run_id,p_lease_id,p_payload,p_execution);
  update public.nexus_diagnosis_runs set execution_lease_expires_at=now()+interval '12 minutes' where id=p_run_id;
  return true;
end $$;
create function public.relystra_claim_diagnosis_stage(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.relystra_diagnosis_jobs%rowtype; r public.nexus_diagnosis_runs%rowtype; stage_lease uuid:=gen_random_uuid();
begin
  select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
  select * into j from public.relystra_diagnosis_jobs where run_id=p_run_id for update;
  if j.run_id is null then return null; end if;
  if r.status<>'analyzing' or r.execution_lease_id is distinct from j.lease_id then delete from public.relystra_diagnosis_jobs where run_id=p_run_id; return null; end if;
  if j.expires_at<=now() then return jsonb_build_object('status','expired','lease_id',j.lease_id); end if;
  if j.stage=3 then return to_jsonb(j)||jsonb_build_object('status','complete'); end if;
  if j.stage_lease_expires_at>now() then return jsonb_build_object('status','busy','lease_id',j.lease_id,'stage',j.stage); end if;
  update public.relystra_diagnosis_jobs set stage_lease_id=stage_lease,stage_lease_expires_at=now()+interval '2 minutes' where run_id=p_run_id returning * into j;
  return to_jsonb(j)||jsonb_build_object('status','claimed');
end $$;
create function public.relystra_advance_diagnosis_stage(p_run_id uuid,p_lease_id uuid,p_stage_lease_id uuid,p_stage integer,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_result) is distinct from 'object' then raise exception 'INVALID_DIAGNOSIS_STAGE'; end if;
  update public.relystra_diagnosis_jobs j set partial_result=partial_result||p_result,stage=stage+1,stage_lease_id=null,stage_lease_expires_at=null
    where j.run_id=p_run_id and j.lease_id=p_lease_id and j.stage_lease_id=p_stage_lease_id and j.stage=p_stage and j.stage<3
    and exists(select 1 from public.nexus_diagnosis_runs r where r.id=j.run_id and r.status='analyzing' and r.execution_lease_id=j.lease_id);
  return found;
end $$;
create function public.relystra_discard_diagnosis_job(p_run_id uuid,p_lease_id uuid)
returns void language sql security definer set search_path='' as $$
 delete from public.relystra_diagnosis_jobs where run_id=p_run_id and lease_id=p_lease_id;
$$;
revoke all on function public.relystra_enqueue_diagnosis_job(uuid,uuid,jsonb,jsonb),public.relystra_claim_diagnosis_stage(uuid),public.relystra_advance_diagnosis_stage(uuid,uuid,uuid,integer,jsonb),public.relystra_discard_diagnosis_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.relystra_enqueue_diagnosis_job(uuid,uuid,jsonb,jsonb),public.relystra_claim_diagnosis_stage(uuid),public.relystra_advance_diagnosis_stage(uuid,uuid,uuid,integer,jsonb),public.relystra_discard_diagnosis_job(uuid,uuid) to service_role;
