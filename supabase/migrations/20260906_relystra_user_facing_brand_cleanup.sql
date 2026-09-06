-- RELYSTRA Phase Zero: one-time cleanup of legacy Nexus display copy.
-- Internal table/function/enum identifiers intentionally remain Nexus-prefixed.
-- Preserve lowercase `nexus` values because those are internal workflow semantics.
-- Notification/audit history is intentionally immutable and is not rewritten.

update public.nexus_action_templates
set
  title = replace(replace(title,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  description = replace(replace(description,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  instructions = replace(replace(instructions,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  required_evidence = case when required_evidence is null then null else replace(replace(required_evidence::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb end,
  completion_criteria = case when completion_criteria is null then null else replace(replace(completion_criteria::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb end,
  form_schema = case when form_schema is null then null else replace(replace(form_schema::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb end,
  updated_at = now()
where
  coalesce(title,'') like '%Nexus%' or coalesce(title,'') like '%NEXUS%'
  or coalesce(description,'') like '%Nexus%' or coalesce(description,'') like '%NEXUS%'
  or coalesce(instructions,'') like '%Nexus%' or coalesce(instructions,'') like '%NEXUS%'
  or coalesce(required_evidence::text,'') like '%Nexus%' or coalesce(required_evidence::text,'') like '%NEXUS%'
  or coalesce(completion_criteria::text,'') like '%Nexus%' or coalesce(completion_criteria::text,'') like '%NEXUS%'
  or coalesce(form_schema::text,'') like '%Nexus%' or coalesce(form_schema::text,'') like '%NEXUS%';

update public.nexus_tasks
set
  title = replace(replace(title,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  description = replace(replace(description,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  instructions = replace(replace(instructions,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  required_evidence = case when required_evidence is null then null else replace(replace(required_evidence::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb end,
  completion_criteria = case when completion_criteria is null then null else replace(replace(completion_criteria::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb end,
  form_schema = case when form_schema is null then null else replace(replace(form_schema::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb end,
  updated_at = now()
where archived_at is null and (
  coalesce(title,'') like '%Nexus%' or coalesce(title,'') like '%NEXUS%'
  or coalesce(description,'') like '%Nexus%' or coalesce(description,'') like '%NEXUS%'
  or coalesce(instructions,'') like '%Nexus%' or coalesce(instructions,'') like '%NEXUS%'
  or coalesce(required_evidence::text,'') like '%Nexus%' or coalesce(required_evidence::text,'') like '%NEXUS%'
  or coalesce(completion_criteria::text,'') like '%Nexus%' or coalesce(completion_criteria::text,'') like '%NEXUS%'
  or coalesce(form_schema::text,'') like '%Nexus%' or coalesce(form_schema::text,'') like '%NEXUS%'
);

update public.nexus_data_requirement_catalog
set
  why_needed = replace(replace(why_needed,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  how_to_find = replace(replace(how_to_find,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  if_missing = replace(replace(if_missing,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(why_needed,'') like '%Nexus%' or coalesce(why_needed,'') like '%NEXUS%'
   or coalesce(how_to_find,'') like '%Nexus%' or coalesce(how_to_find,'') like '%NEXUS%'
   or coalesce(if_missing,'') like '%Nexus%' or coalesce(if_missing,'') like '%NEXUS%';

update public.nexus_document_requests
set purpose = replace(replace(purpose,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(purpose,'') like '%Nexus%' or coalesce(purpose,'') like '%NEXUS%';

update public.nexus_diagnosis_report_releases
set client_report = replace(replace(client_report::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb
where coalesce(client_report::text,'') like '%Nexus%' or coalesce(client_report::text,'') like '%NEXUS%';

update public.nexus_diagnosis_report_questions
set question = replace(replace(question,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(question,'') like '%Nexus%' or coalesce(question,'') like '%NEXUS%';

update public.nexus_discovery_framework_requirements
set default_question = replace(replace(default_question,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(default_question,'') like '%Nexus%' or coalesce(default_question,'') like '%NEXUS%';

update public.nexus_commercial_offerings
set description = replace(replace(description,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(description,'') like '%Nexus%' or coalesce(description,'') like '%NEXUS%';

update public.nexus_resolution_catalog
set
  title = replace(replace(title,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  category = replace(replace(category,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(title,'') like '%Nexus%' or coalesce(title,'') like '%NEXUS%'
   or coalesce(category,'') like '%Nexus%' or coalesce(category,'') like '%NEXUS%';

update public.nexus_founder_decision_queue
set
  title = replace(replace(title,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  context = replace(replace(context,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(title,'') like '%Nexus%' or coalesce(title,'') like '%NEXUS%'
   or coalesce(context,'') like '%Nexus%' or coalesce(context,'') like '%NEXUS%';

update public.nexus_outreach_sequence_steps
set
  subject = replace(replace(subject,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  body = replace(replace(body,'Nexus','Relystra'),'NEXUS','RELYSTRA')
where coalesce(subject,'') like '%Nexus%' or coalesce(subject,'') like '%NEXUS%'
   or coalesce(body,'') like '%Nexus%' or coalesce(body,'') like '%NEXUS%';

-- Existing generated outreach packets may still be unsent and should not carry the retired brand.
update public.nexus_outreach_packets
set
  email_1_subject = replace(replace(email_1_subject,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  email_1_body = replace(replace(email_1_body,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  email_2_subject = replace(replace(email_2_subject,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  email_2_body = replace(replace(email_2_body,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  teardown_script = replace(replace(teardown_script,'Nexus','Relystra'),'NEXUS','RELYSTRA'),
  generation_notes = case when generation_notes is null then null else replace(replace(generation_notes::text,'Nexus','Relystra'),'NEXUS','RELYSTRA')::jsonb end,
  updated_at = now()
where coalesce(email_1_subject,'') like '%Nexus%' or coalesce(email_1_subject,'') like '%NEXUS%'
   or coalesce(email_1_body,'') like '%Nexus%' or coalesce(email_1_body,'') like '%NEXUS%'
   or coalesce(email_2_subject,'') like '%Nexus%' or coalesce(email_2_subject,'') like '%NEXUS%'
   or coalesce(email_2_body,'') like '%Nexus%' or coalesce(email_2_body,'') like '%NEXUS%'
   or coalesce(teardown_script,'') like '%Nexus%' or coalesce(teardown_script,'') like '%NEXUS%'
   or coalesce(generation_notes::text,'') like '%Nexus%' or coalesce(generation_notes::text,'') like '%NEXUS%';