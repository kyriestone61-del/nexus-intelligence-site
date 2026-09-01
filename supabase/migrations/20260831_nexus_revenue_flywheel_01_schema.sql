-- Nexus multi-agent revenue flywheel: internal data model.
-- Agents can research/score/classify/draft; external outreach remains human-approved.

create table if not exists public.nexus_revenue_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  source_ref text,
  source_snapshot_lead_id uuid unique references public.nexus_opportunity_snapshot_leads(id) on delete set null,
  company_name text not null,
  website text,
  niche text,
  geography text,
  annual_revenue_min numeric,
  annual_revenue_max numeric,
  employee_count integer check (employee_count is null or employee_count >= 0),
  decision_maker_name text,
  decision_maker_title text,
  business_email text,
  business_phone text,
  contact_provenance jsonb not null default '{}'::jsonb,
  response_time_minutes integer check (response_time_minutes is null or response_time_minutes >= 0),
  has_automated_booking boolean,
  has_chat boolean,
  manual_touchpoints jsonb not null default '[]'::jsonb,
  social_cadence text,
  opportunity_score smallint check (opportunity_score is null or opportunity_score between 0 and 100),
  score_method text not null default 'aaa_gap_score_v1',
  score_confidence numeric not null default 0 check (score_confidence between 0 and 100),
  score_evidence jsonb not null default '{}'::jsonb,
  primary_bottlenecks jsonb not null default '[]'::jsonb,
  estimated_lost_monthly_revenue numeric,
  lost_revenue_basis jsonb not null default '{}'::jsonb,
  urgency_score smallint check (urgency_score is null or urgency_score between 0 and 100),
  lead_summary text,
  suggested_action text,
  human_approval_required boolean not null default true,
  jurisdiction text,
  do_not_contact boolean not null default false,
  suppression_reason text,
  stage text not null default 'new' check (stage in (
    'new','researching','scored','qualified','outreach_ready','outreach_approved',
    'contacted','replied','booked','diagnosis','onboarding','retainer','won','lost','nurture','suppressed'
  )),
  last_scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nexus_revenue_leads_source_ref_uniq on public.nexus_revenue_leads(source,source_ref) where source_ref is not null;
create index if not exists nexus_revenue_leads_score_stage_idx on public.nexus_revenue_leads(opportunity_score,stage,created_at desc);
create index if not exists nexus_revenue_leads_company_idx on public.nexus_revenue_leads(lower(company_name),created_at desc);

create table if not exists public.nexus_lead_research_evidence (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.nexus_revenue_leads(id) on delete cascade,
  evidence_type text not null check (evidence_type in (
    'response_time','booking','chat','review_bottleneck','manual_touchpoint','social_cadence',
    'employee_count','annual_revenue','decision_maker','business_contact','test_submission','workflow','other'
  )),
  source_name text,
  source_url text,
  observation text not null,
  numeric_value numeric,
  unit text,
  observed_at timestamptz,
  verified boolean not null default false,
  confidence numeric not null default 0 check (confidence between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nexus_lead_research_evidence_lead_idx on public.nexus_lead_research_evidence(lead_id,verified,evidence_type,observed_at desc);

create table if not exists public.nexus_revenue_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('generate_outreach_packet','refresh_outreach_packet')),
  lead_id uuid not null references public.nexus_revenue_leads(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','blocked','failed','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nexus_revenue_agent_jobs_active_uniq on public.nexus_revenue_agent_jobs(lead_id,job_type) where status in ('queued','running');
create index if not exists nexus_revenue_agent_jobs_queue_idx on public.nexus_revenue_agent_jobs(status,available_at,created_at);

create table if not exists public.nexus_outreach_packets (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.nexus_revenue_leads(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'pending_review' check (status in ('draft','pending_review','approved','rejected','superseded','blocked')),
  teardown_script text,
  email_1_subject text,
  email_1_body text,
  email_2_subject text,
  email_2_body text,
  snapshot_preview jsonb not null default '{}'::jsonb,
  evidence_refs uuid[] not null default '{}'::uuid[],
  claim_map jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0 check (confidence between 0 and 100),
  compliance_flags jsonb not null default '[]'::jsonb,
  generation_notes jsonb not null default '{}'::jsonb,
  qa_status text not null default 'pending' check (qa_status in ('pending','passed','failed','blocked')),
  human_review_required boolean not null default true,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lead_id,version)
);
create index if not exists nexus_outreach_packets_review_idx on public.nexus_outreach_packets(status,qa_status,created_at desc);

create table if not exists public.nexus_outreach_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.nexus_outreach_packets(id) on delete cascade,
  lead_id uuid not null references public.nexus_revenue_leads(id) on delete cascade,
  step_no smallint not null check (step_no in (1,2)),
  channel text not null default 'email' check (channel='email'),
  status text not null default 'pending_approval' check (status in ('waiting','pending_approval','approved_ready','sent','replied','skipped','cancelled')),
  subject text,
  body text,
  due_at timestamptz,
  approval_required boolean not null default true,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(packet_id,step_no)
);
create index if not exists nexus_outreach_sequence_due_idx on public.nexus_outreach_sequence_steps(status,due_at);

create table if not exists public.nexus_lead_exceptions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.nexus_revenue_leads(id) on delete cascade,
  exception_code text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','waived')),
  human_review_required boolean not null default true,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nexus_lead_exceptions_open_uniq on public.nexus_lead_exceptions(lead_id,exception_code) where status in ('open','acknowledged');

create table if not exists public.nexus_flywheel_requirement_checks (
  requirement_code text primary key,
  category text not null,
  requirement_text text not null,
  status text not null default 'planned' check (status in ('planned','implemented','verified','blocked','not_applicable')),
  evidence jsonb not null default '[]'::jsonb,
  reviewer_agent text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_flywheel_execution_log (
  id uuid primary key default gen_random_uuid(),
  phase text not null,
  reviewer_agent text not null,
  result text not null check (result in ('pass','pass_with_findings','hold','fail')),
  findings jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Explicit API privileges because new public tables are no longer assumed to auto-expose.
do $$
declare t text;
begin
  foreach t in array array[
    'nexus_revenue_leads','nexus_lead_research_evidence','nexus_revenue_agent_jobs',
    'nexus_outreach_packets','nexus_outreach_sequence_steps','nexus_lead_exceptions',
    'nexus_flywheel_requirement_checks','nexus_flywheel_execution_log'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

drop policy if exists "nexus admins manage revenue leads" on public.nexus_revenue_leads;
create policy "nexus admins manage revenue leads" on public.nexus_revenue_leads for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
drop policy if exists "nexus admins manage lead research" on public.nexus_lead_research_evidence;
create policy "nexus admins manage lead research" on public.nexus_lead_research_evidence for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
drop policy if exists "nexus admins manage revenue agent jobs" on public.nexus_revenue_agent_jobs;
create policy "nexus admins manage revenue agent jobs" on public.nexus_revenue_agent_jobs for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
drop policy if exists "nexus admins manage outreach packets" on public.nexus_outreach_packets;
create policy "nexus admins manage outreach packets" on public.nexus_outreach_packets for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
drop policy if exists "nexus admins manage outreach sequence" on public.nexus_outreach_sequence_steps;
create policy "nexus admins manage outreach sequence" on public.nexus_outreach_sequence_steps for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
drop policy if exists "nexus admins manage lead exceptions" on public.nexus_lead_exceptions;
create policy "nexus admins manage lead exceptions" on public.nexus_lead_exceptions for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
drop policy if exists "nexus admins manage flywheel requirements" on public.nexus_flywheel_requirement_checks;
create policy "nexus admins manage flywheel requirements" on public.nexus_flywheel_requirement_checks for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
drop policy if exists "nexus admins manage flywheel execution log" on public.nexus_flywheel_execution_log;
create policy "nexus admins manage flywheel execution log" on public.nexus_flywheel_execution_log for all to authenticated using (public.nexus_is_platform_admin()) with check (public.nexus_is_platform_admin());
