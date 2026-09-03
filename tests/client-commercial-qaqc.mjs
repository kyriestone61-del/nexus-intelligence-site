import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const ui=fs.readFileSync('portal-client-commercial.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260903153500_nexus_commercial_entitlements_and_solution_requests.sql','utf8');
const entitlement=fs.readFileSync('supabase/migrations/20260903154000_nexus_commercial_request_reopen_and_admin_entitlement.sql','utf8');
const routing=fs.readFileSync('supabase/migrations/20260903155800_nexus_solution_request_inbox_routing.sql','utf8');

assert.match(app,/portal-client-commercial\.js/,'client commercial controls must load in the client shell');
assert.match(ui,/nexus_client_commercial_context/,'client UI must use the server-authoritative entitlement context');
assert.match(ui,/nexus_request_solution_purchase/,'client UI must create a governed solution request rather than inventing a checkout result');
assert.match(ui,/Request scope & price/,'standalone recommendations must provide an explicit individual-purchase path');
assert.match(ui,/Add to implementation plan/,'Build-entitled clients must be able to activate an included recommendation');
assert.match(ui,/Available individually/,'client must see when a recommendation is outside the current engagement');
assert.match(ui,/Next service level:/,'client must see what the next Nexus service level adds');
assert.match(ui,/cards\.length!==releaseRows\.length/,'commercial controls must fail closed if report/release ordering cannot be reconciled');
assert.doesNotMatch(ui,/\$[0-9]/,'browser UI must not invent a checkout price');
assert.doesNotMatch(ui,/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY|STRIPE_SECRET/,'browser UI must not contain privileged credentials');

for(const code of ['find','build','run'])assert.match(migration,new RegExp(`\\('${code}'`),`commercial catalog must seed ${code}`);
assert.match(migration,/Find My AI Opportunities/,'catalog must follow the current Nexus 2.0 commercial model');
assert.match(migration,/Build My AI Systems/,'catalog must follow the current Nexus 2.0 commercial model');
assert.match(migration,/Run My AI Operations/,'catalog must follow the current Nexus 2.0 commercial model');
assert.match(migration,/create table if not exists public\.nexus_company_entitlements/,'company entitlements must be explicit server-side records');
assert.match(migration,/create table if not exists public\.nexus_solution_purchase_requests/,'individual solution requests must be durable records');
assert.match(migration,/public\.nexus_is_company_member\(company_id\)/,'commercial records must remain company-scoped under RLS');
assert.match(migration,/v_opp:=v_release\.client_report->'opportunities'->p_opportunity_index/,'purchase requests must be anchored to an actually released client recommendation');
assert.match(migration,/v_type:=case when v_has_build then 'included_activation' else 'standalone_scope' end/,'server must determine included-vs-standalone status from entitlements');
assert.match(migration,/Scope the work and provide the authoritative price before checkout/,'standalone purchase flow must require authoritative pricing before payment');
assert.doesNotMatch(migration,/stripe_price|price_cents|unit_amount|checkout_session/,'foundation must not create payment data before prices are authoritative');

assert.match(entitlement,/nexus_set_company_entitlement/,'admin must have a governed server-side control for company Find/Build/Run access');
assert.match(entitlement,/public\.nexus_is_platform_admin\(\)/,'entitlement mutation must be platform-admin only');
assert.match(entitlement,/commercial_entitlement_updated/,'entitlement changes must be auditable');
assert.match(entitlement,/status=case when public\.nexus_solution_purchase_requests\.status in \('declined','cancelled'\) then 'requested'/,'a client must be able to reopen a previously closed solution request');

assert.match(routing,/insert into public\.nexus_tasks/,'client solution requests must create a Nexus-owned action, not only a passive update');
assert.match(routing,/'commercial_scope'/,'solution request actions must have an explicit commercial-scoping task type');
assert.match(routing,/'nexus','open','high'/,'new commercial requests must enter the Nexus Action Inbox as high-priority Nexus-owned work');
assert.match(routing,/Do not create or present checkout until those terms are approved/,'standalone solution tasks must preserve the no-invented-price boundary');
assert.match(routing,/\/portal\?view=inbox&task=/,'commercial request notifications must deep-link to the actionable task');
assert.match(routing,/'nexus_task_id',v_task_id/,'solution request response must expose its server-created action record');

console.log('NEXUS CLIENT COMMERCIAL QAQC PASS');
