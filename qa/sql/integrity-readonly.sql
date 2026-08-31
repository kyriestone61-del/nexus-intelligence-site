-- READ-ONLY QA ONLY. This file must never mutate production data.

-- Cross-company project references must remain zero.
select 'tasks_project_company_mismatch' as check_name,count(*)::int as n
from public.nexus_tasks t join public.nexus_projects p on p.id=t.project_id
where t.company_id<>p.company_id
union all
select 'milestones_project_company_mismatch',count(*)::int
from public.nexus_milestones m join public.nexus_projects p on p.id=m.project_id
where m.company_id<>p.company_id
union all
select 'metrics_project_company_mismatch',count(*)::int
from public.nexus_metrics m join public.nexus_projects p on p.id=m.project_id
where m.company_id<>p.company_id
union all
select 'approvals_project_company_mismatch',count(*)::int
from public.nexus_approvals a join public.nexus_projects p on p.id=a.project_id
where a.company_id<>p.company_id
union all
select 'document_requests_project_company_mismatch',count(*)::int
from public.nexus_document_requests d join public.nexus_projects p on p.id=d.project_id
where d.company_id<>p.company_id
union all
select 'diagnosis_project_company_mismatch',count(*)::int
from public.nexus_diagnosis_runs d join public.nexus_projects p on p.id=d.project_id
where d.company_id<>p.company_id;

-- Every active project should eventually have an explicit type/engagement role.
select id,company_id,name,status,project_type,service_slug,created_at
from public.nexus_projects
where project_type is null
  and coalesce(lower(status),'') not in ('complete','completed','archived','cancelled','canceled')
order by created_at;

-- There should not be multiple unresolved diagnosis records for the same transcript.
select company_id,transcript_document_id,count(*)::int as unresolved_runs
from public.nexus_diagnosis_runs
where transcript_document_id is not null
  and status in ('ready_for_analysis','queued','analyzing','ready_for_review','revision_requested','blocked','failed','in_review')
group by company_id,transcript_document_id
having count(*)>1
order by unresolved_runs desc;

-- Status vocabulary inventory: use this after reset to confirm canonical persisted states.
select 'task' as domain,status,count(*)::int from public.nexus_tasks group by status
union all select 'diagnosis',status,count(*)::int from public.nexus_diagnosis_runs group by status
union all select 'project',status,count(*)::int from public.nexus_projects group by status
union all select 'document_request',status,count(*)::int from public.nexus_document_requests group by status
union all select 'approval',status,count(*)::int from public.nexus_approvals group by status
order by domain,status;

-- Company memory currently has no field-level visibility metadata. Review before exposing to clients.
select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='nexus_company_memory'
order by ordinal_position;

-- RLS should remain enabled on every client-bearing Nexus table.
select c.relname as table_name,c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced,
       count(p.policyname)::int as policy_count
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
where n.nspname='public'
  and c.relname in (
    'nexus_companies','nexus_projects','nexus_tasks','nexus_milestones','nexus_metrics',
    'nexus_documents','nexus_document_requests','nexus_diagnosis_runs','nexus_approvals',
    'nexus_company_memory','nexus_decision_register','nexus_evidence_registry'
  )
group by c.relname,c.relrowsecurity,c.relforcerowsecurity
order by c.relname;
