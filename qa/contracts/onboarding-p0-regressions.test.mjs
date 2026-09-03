import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(path,'utf8');

test('Snapshot submission no longer depends on a missing Cloudflare service-role secret',()=>{
  const source=read('functions/api/opportunity-snapshot.js');
  assert.match(source,/SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source,/rest\/v1\/rpc\/submit_nexus_opportunity_snapshot/);
  assert.doesNotMatch(source,/context\.env\?\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source,/Snapshot submission is temporarily unavailable/);
});

test('Snapshot RPC keeps privileged insert logic outside the exposed public schema',()=>{
  const migration=read('supabase/migrations/20260902_nexus_public_snapshot_gateway.sql');
  assert.match(migration,/nexus_public_internal\.submit_opportunity_snapshot/);
  assert.match(migration,/security definer/i);
  assert.match(migration,/public\.submit_nexus_opportunity_snapshot/);
  assert.match(migration,/security invoker/i);
  assert.match(migration,/grant execute on function public\.submit_nexus_opportunity_snapshot\(jsonb\) to anon/);
});

test('Homepage workspace is explicitly labeled as fictional sample data',()=>{
  const source=read('phase-five.js');
  assert.match(source,/SAMPLE CLIENT WORKSPACE/);
  assert.match(source,/FICTIONAL EXAMPLE/);
  assert.match(source,/Example Company — Sample Dashboard/);
  assert.match(source,/not a real Nexus client or account/i);
});

test('Auth tabs hide inactive forms and portal rows cannot be crushed by full-width selects',()=>{
  const css=read('portal-runtime-hardening.css');
  assert.match(css,/\.portal-body \.auth-pane\{display:none!important\}/);
  assert.match(css,/\.portal-body \.auth-pane\.active\{display:block!important\}/);
  assert.match(css,/\.portal-body \.row>select/);
  assert.match(css,/width:170px!important/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/width:100%!important/);
});
