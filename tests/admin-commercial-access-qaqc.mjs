import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const ui=fs.readFileSync('portal-admin-commercial-access.js','utf8');
const entitlement=fs.readFileSync('supabase/migrations/20260903154000_nexus_commercial_request_reopen_and_admin_entitlement.sql','utf8');

assert.match(app,/portal-admin-commercial-access\.js/,'founder service-access controls must load in the administrator shell');
assert.match(ui,/nexus_client_commercial_context/,'founder view must read the same server-authoritative service-access context as the client');
assert.match(ui,/nexus_set_company_entitlement/,'founder changes must use the governed entitlement RPC');
assert.match(ui,/What this client qualifies for/,'founder must see the client qualification state before release');
assert.match(ui,/Grant access/,'founder must be able to grant Find Build or Run access');
assert.match(ui,/Remove access/,'founder must be able to remove service access without deleting history');
assert.match(ui,/does not charge the client or invent pricing/,'service access must remain separate from billing');
assert.match(entitlement,/public\.nexus_is_platform_admin\(\)/,'entitlement mutation must remain administrator-only');
assert.match(entitlement,/commercial_entitlement_updated/,'entitlement changes must be auditable');
assert.doesNotMatch(ui,/\$[0-9]/,'founder controls must not invent a price');

console.log('NEXUS ADMIN COMMERCIAL ACCESS QAQC PASS');
