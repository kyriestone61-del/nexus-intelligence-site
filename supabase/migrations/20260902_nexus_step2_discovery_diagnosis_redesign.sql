-- Nexus Step 2: Discovery & Diagnosis redesign
-- Principle: sophisticated internally, simple externally.
-- Adds a reusable discovery framework, durable admin context, gap-analysis history,
-- direct client information requests without faux approval chains, and diagnosis-to-template mapping.

create table if not exists public.nexus_discovery_framework_requirements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  domain text not null,
  requirement text not null,
  default_question text not null,
  desired_evidence text,
  material boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nexus_discovery_framework_requirements enable row level security;
drop policy if exists "nexus admins view discovery framework" on public.nexus_discovery_framework_requirements;
create policy "nexus admins view discovery framework" on public.nexus_discovery_framework_requirements
for select to authenticated using (public.nexus_is_platform_admin());

insert into public.nexus_discovery_framework_requirements(code,domain,requirement,default_question,desired_evidence,material,sort_order) values
('business_offer','Business model','Primary products/services and value proposition are understood.','What does the company sell or provide, and which offers matter most to the business?','Product/service list, pricing page, catalog, proposal, or representative invoice.',true,10),
('customer_profile','Business model','Primary customer segments and buying context are understood.','Who are the primary customers, and what usually causes them to buy?','Customer segments, ICP notes, CRM export, or representative customer examples.',true,20),
('business_goals','Business model','Near-term business goals and desired outcomes are explicit.','What are the top business outcomes you want over the next 90 days and 6–12 months?','Goals, OKRs, planning notes, owner statement, or current targets.',true,30),
('revenue_flow','Business model','How the company makes money and where revenue is captured is understood.','How does revenue flow from first customer contact through payment and fulfillment?','Sales process, invoices, checkout flow, pipeline report, or revenue summary.',true,40),
('lead_sources','Customer journey','Primary lead/customer acquisition sources are known.','How do new customers usually find or contact the business today?','Channel report, referral process, website analytics, social analytics, or CRM source data.',true,50),
('sales_process','Customer journey','The inquiry-to-sale process and ownership are mapped.','What happens from first inquiry to completed sale, including who owns each handoff?','CRM stages, sales SOP, intake form, email examples, or call notes.',true,60),
('follow_up','Customer journey','Follow-up method, cadence, and failure points are known.','How are leads and customers followed up with, and where do follow-ups fall through?','CRM tasks, inbox examples, automation map, scripts, or follow-up report.',true,70),
('customer_questions','Customer journey','Repeated customer questions and service friction are known.','What questions or requests do customers repeat most often?','FAQ, email/chat samples, support tickets, or staff notes.',false,80),
('marketing_channels','Marketing','Active marketing channels and operating cadence are known.','Which marketing channels are active, and how consistently are they operated?','Content calendar, campaign report, social profiles, analytics, or ad account summary.',false,90),
('content_workflow','Marketing','Content creation, review, publishing, and ownership are understood.','How is content planned, created, approved, and published today?','Content calendar, SOP, approval flow, templates, or publishing screenshots.',false,100),
('core_process','Operations','The core value-delivery workflow is mapped end to end.','Walk through the core work from trigger to completed customer outcome.','SOP, workflow diagram, checklist, project/order record, or representative transaction.',true,110),
('process_owners','Operations','Owners and decision rights for core workflow steps are known.','Who owns each major step, handoff, exception, and approval in the core workflow?','Org chart, responsibility matrix, SOP, or owner statement.',true,120),
('repetitive_work','Operations','High-frequency repetitive work is identified.','Which tasks repeat every day or week, and approximately how often?','Task list, calendar, time estimate, checklist, or representative work log.',true,130),
('handoffs','Operations','Cross-person/system handoffs and duplicate entry are identified.','Where is information copied, re-entered, handed off, or manually reconciled between people or systems?','Workflow screenshots, spreadsheets, integration map, or examples of duplicate entry.',true,140),
('exceptions','Operations','Common exceptions and failure paths are understood.','What exceptions, mistakes, rework, or edge cases interrupt the normal process most often?','Issue log, return/rework examples, support tickets, or staff notes.',true,150),
('delays','Operations','Material delays and queues are identified.','Where does work wait, stall, or depend on someone remembering the next step?','Cycle-time report, queue screenshot, backlog, or representative examples.',true,160),
('systems_inventory','Systems & data','Primary systems, spreadsheets, inboxes, and manual tools are known.','What systems, spreadsheets, inboxes, calendars, and manual tools are used to run the work?','Software list, screenshots, systems map, or admin settings.',true,170),
('system_boundaries','Systems & data','System-of-record and integration boundaries are understood.','Where is authoritative information stored, and which systems do not communicate with each other?','Systems map, integration settings, API list, or representative records.',true,180),
('data_quality','Systems & data','Material data-quality limitations are known.','What data is missing, inconsistent, duplicated, outdated, or difficult to trust?','Data export, reconciliation example, error log, or owner statement.',true,190),
('documentation','Systems & data','Existing SOPs, templates, checklists, reports, and dashboards are inventoried.','What SOPs, templates, checklists, reports, or dashboards already exist?','SOPs, templates, dashboards, reports, or a statement that they do not exist.',false,200),
('volume','Measurement','Workload/transaction volume is quantified enough to size opportunities.','What volume moves through the main workflow in a typical day, week, or month?','Order count, ticket count, appointment count, transaction export, or representative estimate.',true,210),
('time_baseline','Measurement','Current labor/time baseline exists for material workflows.','How much staff time does the current process consume in a typical week or month?','Time log, staffing estimate, calendar evidence, or measured sample.',true,220),
('quality_baseline','Measurement','Error/rework/service-quality baseline is understood where material.','How often do errors, rework, missed follow-ups, delays, or customer issues occur?','Error log, return rate, SLA report, ticket data, or measured sample.',true,230),
('business_metrics','Measurement','Decision-relevant KPIs and source systems are known.','Which metrics matter most for proving improvement, and where are those metrics measured today?','KPI report, dashboard, spreadsheet, analytics, or owner statement.',true,240),
('constraints','Constraints & governance','Budget, technology, security, privacy, compliance, and human-approval constraints are known.','What budget, technology, privacy, security, compliance, or human-approval constraints must Nexus respect?','Policy, contract requirement, platform limitation, budget range, or owner statement.',true,250),
('human_judgment','Constraints & governance','Work that must remain human-controlled is identified.','Which decisions or customer interactions require human judgment or explicit approval?','Approval policy, escalation rules, role description, or owner statement.',true,260),
('change_readiness','Constraints & governance','Team readiness, adoption risk, and responsible implementers are understood.','Who would own adoption of a change, and what could prevent the team from using it consistently?','Team roles, training notes, owner statement, or implementation history.',false,270),
('desired_state','Desired state','A concrete 90-day desired operating state is explicit.','What would a noticeably better operation look like 90 days from now?','Target workflow, service target, owner statement, or measurable desired state.',true,280),
('success_definition','Desired state','Engagement success criteria are explicit and measurable where possible.','What would make this engagement unquestionably valuable, and how should Nexus measure that?','Target KPI, acceptance criteria, baseline/target pair, or owner statement.',true,290),
('first_priority','Desired state','The client’s highest-priority burden/opportunity is understood.','If Nexus could remove or materially reduce one operational burden first, what should it be?','Owner statement, priority list, or current pain-point evidence.',true,300)
on conflict (code) do update set
  domain=excluded.domain,
  requirement=excluded.requirement,
  default_question=excluded.default_question,
  desired_evidence=excluded.desired_evidence,
  material=excluded.material,
  active=true,
  sort_order=excluded.sort_order,
  updated_at=now();

create table if not exists public.nexus_discovery_context_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  project_id uuid references public.nexus_projects(id) on delete cascade,
  context_type text not null default 'admin_context' check (context_type in ('admin_context','client_context','system_context')),
  content text not null check (char_length(btrim(content)) between 1 and 40000),
  is_current boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists nexus_discovery_context_company_idx on public.nexus_discovery_context_entries(company_id,project_id,created_at desc);
create unique index if not exists nexus_discovery_context_current_uq on public.nexus_discovery_context_entries(company_id,coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid),context_type) where is_current;
alter table public.nexus_discovery_context_entries enable row level security;
drop policy if exists "nexus admins manage discovery context" on public.nexus_discovery_context_entries;
create policy "nexus admins manage discovery context" on public.nexus_discovery_context_entries
for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());

create table if not exists public.nexus_discovery_gap_analyses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  project_id uuid references public.nexus_projects(id) on delete cascade,
  framework_version text not null default '2026-09-02',
  evidence_document_ids uuid[] not null default '{}',
  evidence_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists nexus_discovery_gap_company_idx on public.nexus_discovery_gap_analyses(company_id,project_id,created_at desc);
alter table public.nexus_discovery_gap_analyses enable row level security;
drop policy if exists "nexus admins view discovery gap analyses" on public.nexus_discovery_gap_analyses;
create policy "nexus admins view discovery gap analyses" on public.nexus_discovery_gap_analyses
for select to authenticated using (public.nexus_is_platform_admin());

alter table public.nexus_documents
  add column if not exists evidence_parser text,
  add column if not exists evidence_summary text,
  add column if not exists evidence_claims jsonb not null default '[]'::jsonb,
  add column if not exists evidence_classification jsonb not null default '{}'::jsonb,
  add column if not exists evidence_ingested_at timestamptz;

alter table public.nexus_tasks
  add column if not exists source_gap_analysis_id uuid references public.nexus_discovery_gap_analyses(id) on delete set null;
alter table public.nexus_document_requests
  add column if not exists source_gap_analysis_id uuid references public.nexus_discovery_gap_analyses(id) on delete set null;
create index if not exists nexus_tasks_gap_analysis_idx on public.nexus_tasks(source_gap_analysis_id) where source_gap_analysis_id is not null;
create index if not exists nexus_document_requests_gap_analysis_idx on public.nexus_document_requests(source_gap_analysis_id) where source_gap_analysis_id is not null;

create or replace function public.nexus_save_discovery_admin_context(
  p_company_id uuid,
  p_project_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id uuid; v_content text:=btrim(coalesce(p_content,''));
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  if v_content='' then raise exception 'Add context before saving'; end if;
  if char_length(v_content)>40000 then raise exception 'Admin context exceeds the 40,000 character limit'; end if;
  if not exists(select 1 from public.nexus_companies c where c.id=p_company_id) then raise exception 'Company not found'; end if;
  if p_project_id is not null and not exists(select 1 from public.nexus_projects p where p.id=p_project_id and p.company_id=p_company_id) then raise exception 'Project does not belong to this company'; end if;

  update public.nexus_discovery_context_entries
    set is_current=false
    where company_id=p_company_id and project_id is not distinct from p_project_id and context_type='admin_context' and is_current;
  insert into public.nexus_discovery_context_entries(company_id,project_id,context_type,content,is_current,created_by)
    values(p_company_id,p_project_id,'admin_context',v_content,true,auth.uid()) returning id into v_id;
  return v_id;
end
$function$;
revoke all on function public.nexus_save_discovery_admin_context(uuid,uuid,text) from public,anon;
grant execute on function public.nexus_save_discovery_admin_context(uuid,uuid,text) to authenticated,service_role;

-- Simple discovery information requests are coordination, not consequential release approvals.
-- Remove the legacy auto-created approval chain and allow the admin to send the request directly.
drop trigger if exists nexus_document_request_release_chain on public.nexus_document_requests;
update public.nexus_approval_chain_steps s
set status='cancelled',updated_at=now()
from public.nexus_approval_chains c
where c.id=s.chain_id and c.entity_type='document_request_release' and c.status in ('draft','pending','changes_requested') and s.status in ('queued','pending','changes_requested');
update public.nexus_approval_chains
set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now()
where entity_type='document_request_release' and status in ('draft','pending','changes_requested');

create or replace function public.nexus_release_document_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare r public.nexus_document_requests%rowtype;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into r from public.nexus_document_requests where id=p_request_id for update;
  if r.id is null then raise exception 'Document request not found'; end if;
  if r.status='draft' then update public.nexus_document_requests set status='requested',updated_at=now() where id=r.id; end if;
  return r.id;
end
$function$;

create or replace function public.nexus_send_discovery_information_request(
  p_company_id uuid,
  p_project_id uuid,
  p_gap_analysis_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  item jsonb;
  ord bigint;
  q text;
  kind text;
  desired text;
  schema jsonb:='[]'::jsonb;
  task_id uuid;
  doc_id uuid;
  doc_ids jsonb:='[]'::jsonb;
  key text;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select at least one information gap'; end if;
  if not exists(select 1 from public.nexus_companies c where c.id=p_company_id) then raise exception 'Company not found'; end if;
  if p_project_id is not null and not exists(select 1 from public.nexus_projects p where p.id=p_project_id and p.company_id=p_company_id) then raise exception 'Project does not belong to this company'; end if;
  if p_gap_analysis_id is not null and not exists(select 1 from public.nexus_discovery_gap_analyses g where g.id=p_gap_analysis_id and g.company_id=p_company_id) then raise exception 'Gap analysis does not belong to this company'; end if;

  for item,ord in select value,ordinality from jsonb_array_elements(p_items) with ordinality loop
    q:=btrim(coalesce(item->>'question',''));
    if q='' then continue; end if;
    key:='gap_'||ord::text;
    schema:=schema||jsonb_build_array(jsonb_build_object(
      'key',key,
      'label',q,
      'type','textarea',
      'required',coalesce((item->>'required')::boolean,true),
      'placeholder','Provide the current-state answer. If you are unsure, say what is unknown.'
    ));
  end loop;

  if jsonb_array_length(schema)=0 then raise exception 'No valid questions were provided'; end if;

  insert into public.nexus_tasks(
    company_id,project_id,title,description,instructions,assignee,status,priority,created_by,notify_client,task_type,phase,form_schema,source_gap_analysis_id
  ) values(
    p_company_id,p_project_id,'Discovery information request',
    'Nexus reviewed the evidence already provided and is requesting only the remaining information that could materially improve the diagnosis.',
    'Answer the questions below using current-state information. If a requested detail is unknown or unavailable, say so rather than estimating.',
    'client','waiting_on_client','normal',auth.uid(),true,'discovery_information_request','discovery',schema,p_gap_analysis_id
  ) returning id into task_id;

  for item in select value from jsonb_array_elements(p_items) loop
    kind:=lower(coalesce(item->>'request_kind','question'));
    desired:=btrim(coalesce(item->>'desired_evidence',''));
    if kind in ('document','both') and desired<>'' then
      insert into public.nexus_document_requests(
        company_id,project_id,title,purpose,examples,redaction_guidance,sensitivity,status,requested_by,owner_scope,source_gap_analysis_id
      ) values(
        p_company_id,p_project_id,
        coalesce(nullif(btrim(item->>'document_title'),''),'Supporting evidence'),
        coalesce(nullif(btrim(item->>'reason'),''),'This evidence would materially improve the current-state diagnosis.'),
        desired,
        coalesce(nullif(btrim(item->>'redaction_guidance'),''),'Remove passwords, API keys, payment-card data, unnecessary personal information, and unrelated sensitive fields.'),
        case when lower(coalesce(item->>'sensitivity','standard'))='confidential' then 'confidential' else 'standard' end,
        'requested',auth.uid(),'client',p_gap_analysis_id
      ) returning id into doc_id;
      doc_ids:=doc_ids||to_jsonb(doc_id);
    end if;
  end loop;

  return jsonb_build_object('task_id',task_id,'document_request_ids',doc_ids,'status','sent');
end
$function$;
revoke all on function public.nexus_send_discovery_information_request(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.nexus_send_discovery_information_request(uuid,uuid,uuid,jsonb) to authenticated,service_role;

-- Preserve the reusable action-item library as the execution vocabulary after diagnosis.
-- The model may recommend a valid template_code; approval keeps the client-specific title/description
-- while inheriting the template's instructions, form structure, task type, phase, and defaults.
create or replace function private.nexus_map_diagnosis_action_templates(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.nexus_diagnosis_runs%rowtype;
  item jsonb;
  t public.nexus_action_templates%rowtype;
  code text;
  mapped integer:=0;
  item_title text;
  who text;
begin
  select * into r from public.nexus_diagnosis_runs where id=p_run_id;
  if r.id is null or r.analysis_result is null then return 0; end if;

  for who in select unnest(array['nexus','client']) loop
    for item in select value from jsonb_array_elements(
      case when who='nexus' then coalesce(r.analysis_result->'nexus_actions','[]'::jsonb)
           else coalesce(r.analysis_result->'client_action_items','[]'::jsonb) end
    ) loop
      code:=nullif(btrim(coalesce(item->>'template_code','')),'');
      item_title:=coalesce(nullif(btrim(item->>'title'),''),case when who='nexus' then 'Nexus action' else 'Client action' end);
      if code is null then continue; end if;
      select * into t from public.nexus_action_templates where public.nexus_action_templates.code=code and active is true limit 1;
      if t.id is null or t.assignee<>who then continue; end if;

      update public.nexus_tasks
      set template_code=t.code,
          instructions=coalesce(nullif(btrim(coalesce(item->>'instructions','')),''),t.instructions,instructions),
          task_type=coalesce(nullif(t.task_type,''),task_type),
          phase=coalesce(nullif(t.phase,''),phase),
          priority=coalesce(nullif(item->>'priority',''),t.priority,priority),
          form_schema=case when form_schema is null or form_schema='[]'::jsonb then t.form_schema else form_schema end,
          updated_at=now()
      where source_diagnosis_run_id=p_run_id and assignee=who and title=item_title;
      if found then mapped:=mapped+1; end if;
    end loop;
  end loop;

  update public.nexus_diagnosis_runs
  set orchestration_summary=coalesce(orchestration_summary,'{}'::jsonb)||jsonb_build_object('template_mapped_actions',mapped),updated_at=now()
  where id=p_run_id;
  return mapped;
end
$function$;
revoke all on function private.nexus_map_diagnosis_action_templates(uuid) from public,anon,authenticated;

create or replace function private.nexus_apply_diagnosis_action_templates_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status='approved' and old.status is distinct from new.status then
    perform private.nexus_map_diagnosis_action_templates(new.id);
  end if;
  return new;
end
$function$;

drop trigger if exists nexus_apply_diagnosis_action_templates on public.nexus_diagnosis_runs;
create trigger nexus_apply_diagnosis_action_templates
after update of status on public.nexus_diagnosis_runs
for each row execute function private.nexus_apply_diagnosis_action_templates_trigger();

do $backfill$
declare r record;
begin
  for r in select id from public.nexus_diagnosis_runs where status='approved' and analysis_result is not null loop
    perform private.nexus_map_diagnosis_action_templates(r.id);
  end loop;
end
$backfill$;
