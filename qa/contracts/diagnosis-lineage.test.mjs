import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../../supabase/functions/nexus-diagnosis-execute/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../../supabase/migrations/20260908013000_relystra_canonical_diagnosis_lineage.sql',import.meta.url),'utf8');

test('diagnosis execution trusts recorded evidence IDs across later project handoffs',()=>{
  assert.match(worker,/ids\?\.length\|\|!projectId\|\|!d\.project_id\|\|d\.project_id===projectId/);
  assert.match(worker,/const projectId=packet\.project\?\.id\|\|run\.project_id\|\|null/);
});

test('paid packages persist and protect exactly one approved diagnosis lineage',()=>{
  assert.match(migration,/context_diagnosis_run_id uuid references public\.nexus_diagnosis_runs\(id\) on delete restrict/);
  assert.match(migration,/All Builds in one package must come from the same approved diagnosis/);
  assert.match(migration,/new\.context_diagnosis_run_id is distinct from old\.context_diagnosis_run_id/);
  assert.match(migration,/'supporting_document_ids',coalesce\(to_jsonb\(d\.supporting_document_ids\),'\[\]'::jsonb\)/);
});
