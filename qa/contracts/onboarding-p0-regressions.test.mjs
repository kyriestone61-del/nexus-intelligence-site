import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(path,'utf8');

test('Snapshot submission uses the trusted Cloudflare boundary and durable abuse controls',()=>{
  const source=read('functions/api/opportunity-snapshot.js');
  const migration=read('supabase/migrations/20260908020000_relystra_launch_security_controls.sql');
  const retirement=read('supabase/migrations/20260908023000_relystra_retire_unsafe_snapshot_rpc.sql');
  assert.match(source,/context\.env\?\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source,/rest\/v1\/rpc\/submit_relystra_opportunity_snapshot/);
  assert.match(source,/cf-connecting-ip/);
  assert.match(migration,/relystra_public_submission_events/);
  assert.match(migration,/global_recent>=120/);
  assert.match(retirement,/revoke all on function public\.submit_nexus_opportunity_snapshot\(jsonb\) from public,anon,authenticated/);
  assert.doesNotMatch(migration,/values\('generate_outreach_packet'/);
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
  assert.match(source,/not a real Relystra client or account/i);
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
