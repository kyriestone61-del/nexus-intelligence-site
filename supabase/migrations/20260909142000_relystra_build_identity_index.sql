-- Generated names are editable presentation, not the identity of a Build.
-- Preserve the legacy title rule for non-Build opportunities. Build uniqueness
-- remains enforced by nexus_build_opportunity_source (diagnosis/finding/template).
drop index if exists public.nexus_opportunities_diagnosis_title_unique;
create unique index nexus_opportunities_diagnosis_title_unique
 on public.nexus_opportunities(source_diagnosis_run_id,title)
 where source_diagnosis_run_id is not null and build_spec is null;
