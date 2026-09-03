-- The founder releases the vetted client report; the client then explicitly approves it or requests changes.
-- Report approval is version-specific so a founder re-release never inherits an approval from an older report version.

create table if not exists public.nexus_diagnosis_report_client_decisions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.nexus_diagnosis_report_releases(id) on delete cascade,
  report_version int not null check(report_version>0),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  decision text not null check(decision in ('approved','changes_requested')),
  note text,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(release_id,report_version,decided_by),
  constraint nexus_diagnosis_report_client_decision_note_ck check(decision<>'changes_requested' or nullif(btrim(note),'') is not null)
);
create index if not exists nexus_diagnosis_report_client_decisions_company_idx
  on public.nexus_diagnosis_report_client_decisions(company_id,decided_at desc);

alter table public.nexus_diagnosis_report_client_decisions enable row level security;
revoke all on public.nexus_diagnosis_report_client_decisions from anon;
revoke all on public.nexus_diagnosis_report_client_decisions from authenticated;
grant select on public.nexus_diagnosis_report_client_decisions to authenticated;

drop policy if exists nexus_diagnosis_report_client_decisions_select on public.nexus_diagnosis_report_client_decisions;
create policy nexus_diagnosis_report_client_decisions_select
on public.nexus_diagnosis_report_client_decisions
for select to authenticated
using(
  public.nexus_is_platform_admin()
  or (decided_by=auth.uid() and public.nexus_is_company_member(company_id))
);

create or replace function public.nexus_submit_diagnosis_report_decision(
  p_release_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_decision text:=lower(btrim(coalesce(p_decision,'')));
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_row public.nexus_diagnosis_report_client_decisions%rowtype;
  v_admin record;
  v_task_id uuid;
  v_task_title text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_release
  from public.nexus_diagnosis_report_releases
  where id=p_release_id and status='released' and revoked_at is null;
  if v_release.id is null then raise exception 'Released diagnosis report not found'; end if;
  if not public.nexus_is_company_member(v_release.company_id) and not public.nexus_is_platform_admin() then raise exception 'Company membership required'; end if;
  if v_decision not in ('approved','changes_requested') then raise exception 'Decision must be approved or changes_requested'; end if;
  if v_decision='changes_requested' and v_note is null then raise exception 'Explain what should change before resubmitting the report'; end if;

  insert into public.nexus_diagnosis_report_client_decisions(
    release_id,report_version,company_id,decision,note,decided_by,decided_at,updated_at
  ) values(
    v_release.id,v_release.report_version,v_release.company_id,v_decision,v_note,auth.uid(),now(),now()
  )
  on conflict(release_id,report_version,decided_by) do update set
    decision=excluded.decision,
    note=excluded.note,
    decided_at=now(),
    updated_at=now()
  returning * into v_row;

  if v_decision='changes_requested' then
    v_task_title:='Review client diagnosis changes — report v'||v_release.report_version::text;
    select t.id into v_task_id
    from public.nexus_tasks t
    where t.source_diagnosis_run_id=v_release.diagnosis_run_id
      and t.assignee='nexus'
      and t.title=v_task_title
    limit 1;

    if v_task_id is null then
      insert into public.nexus_tasks(
        company_id,project_id,title,description,assignee,status,priority,created_by,notify_client,
        task_type,instructions,form_schema,response_data,phase,source_diagnosis_run_id,owner_scope
      ) values(
        v_release.company_id,v_release.project_id,v_task_title,
        'The client requested changes to the released diagnosis report before approval.',
        'nexus','open','high',auth.uid(),false,
        'diagnosis_client_revision',
        'Review the client note, compare it with the immutable AI diagnosis and founder adjustment audit trail, make only evidence-supported client-report adjustments, then re-release a new report version for approval.',
        '[]'::jsonb,
        jsonb_build_object('client_decision_id',v_row.id,'release_id',v_release.id,'report_version',v_release.report_version,'client_note',v_note),
        'diagnosis',v_release.diagnosis_run_id,'nexus'
      ) returning id into v_task_id;
    else
      update public.nexus_tasks
      set status=case when status in ('completed','done','not_applicable') then 'open' else status end,
          priority='high',
          description='The client requested changes to the released diagnosis report before approval.',
          instructions='Review the client note, compare it with the immutable AI diagnosis and founder adjustment audit trail, make only evidence-supported client-report adjustments, then re-release a new report version for approval.',
          response_data=coalesce(response_data,'{}'::jsonb)||jsonb_build_object('client_decision_id',v_row.id,'release_id',v_release.id,'report_version',v_release.report_version,'client_note',v_note),
          updated_at=now()
      where id=v_task_id;
    end if;
  end if;

  for v_admin in select user_id from public.nexus_platform_admins loop
    insert into public.nexus_notifications(
      company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url
    ) values(
      v_release.company_id,v_admin.user_id,'diagnosis_client_decision',
      case when v_decision='approved' then 'Client approved diagnosis report v'||v_release.report_version::text else 'Client requested diagnosis changes — v'||v_release.report_version::text end,
      case when v_decision='approved' then 'The client approved the released diagnosis report. Implementation selections remain separate and governed by the client’s service access.' else 'The client requested changes before approving the report: '||v_note end,
      'diagnosis_report_client_decision',v_row.id,auth.uid(),
      case when v_task_id is null then '/portal?view=diagnosis-report&release='||v_release.id::text else '/portal?view=inbox&task='||v_task_id::text end
    );
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(
    v_release.company_id,auth.uid(),'diagnosis_client_decision','diagnosis_report_release',v_release.id,
    case when v_decision='approved' then 'Client approved diagnosis report version '||v_release.report_version::text||'.' else 'Client requested changes to diagnosis report version '||v_release.report_version::text||'.' end
  );

  return jsonb_build_object(
    'id',v_row.id,
    'release_id',v_release.id,
    'report_version',v_release.report_version,
    'decision',v_row.decision,
    'note',v_row.note,
    'decided_at',v_row.decided_at,
    'nexus_task_id',v_task_id
  );
end
$$;

revoke all on function public.nexus_submit_diagnosis_report_decision(uuid,text,text) from public,anon;
grant execute on function public.nexus_submit_diagnosis_report_decision(uuid,text,text) to authenticated;
