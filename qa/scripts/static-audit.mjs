import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>{try{return fs.readFileSync(path.join(root,file),'utf8')}catch{return ''}};
const exists=file=>fs.existsSync(path.join(root,file));
const findings=[];
const add=(severity,id,title,evidence,recommendation)=>findings.push({severity,id,title,evidence,recommendation});

const portalClient=read('portal-client.js');
const portalOps=read('portal-ops.js');
const portalApp=read('portal-app.js');
const foundation=read('portal-foundation-hardening.js');
const diagnosis=read('portal-diagnosis-controller-v2.js');
const diagnosisExecution=read('portal-diagnosis-execution-ux.js');
const releaseQueue=read('portal-diagnosis-release-queue.js');
const journey=read('portal-admin-journey.js');
const auth=read('portal-auth.js');
const legacyE2E=read('.github/workflows/client-journey-e2e-qa.yml');
const playwrightConfig=read('qa/playwright/playwright.config.mjs');
const playwrightPackage=read('qa/playwright/package.json');
const foundationMigration=read('supabase/migrations/20260831_nexus_workspace_foundation_hardening.sql');
const memoryPrivacyMigration=read('supabase/migrations/20260831_nexus_company_memory_raw_privacy.sql');

const projectZeroFiles=[
  ['portal-client.js',portalClient],
  ['portal-admin-journey.js',journey],
  ['portal-diagnosis-controller-v2.js',diagnosis]
].filter(([,s])=>/projects\?\.\[0\]|projects\[0\]/.test(s));
const activeEngagementBoundary=/nexus_active_engagements/.test(foundation)&&/Object\.defineProperty\(state,'projects'/.test(foundation)&&/nexus_active_engagements/.test(foundationMigration);
if(projectZeroFiles.length&&!activeEngagementBoundary)add('P0','ACTIVE_ENGAGEMENT_IMPLICIT','Active engagement inferred from projects[0]',projectZeroFiles.map(([f])=>f).join(', '),'Use an explicit active engagement/project identifier. Refuse ambiguous multi-project state.');
else if(projectZeroFiles.length)add('P1','ACTIVE_ENGAGEMENT_COMPATIBILITY_SHIM','Legacy modules still read projects[0], but shared state now canonicalizes index 0 to the explicit active engagement',projectZeroFiles.map(([f])=>f).join(', '),'Remove the compatibility shim during the next portal-client/admin-journey cleanup; keep the database active-engagement identity as the source of truth.');

const rawMemoryQuery=/from\(['\"]nexus_company_memory['\"]\)\.select\(['\"]\*['\"]\)/.test(portalOps);
const safeMemoryBoundary=/nexus_get_company_memory_client/.test(foundation)&&/nexus_get_company_memory_client/.test(foundationMigration)&&/nexus admins view company memory/.test(memoryPrivacyMigration);
if(rawMemoryQuery&&!safeMemoryBoundary)add('P0','MEMORY_CLIENT_VISIBILITY','Company memory is loaded from the raw table in shared admin/client operations code','portal-ops.js queries nexus_company_memory directly','Use an admin-only raw table plus a client-safe server projection/RPC.');
else if(rawMemoryQuery)add('P1','MEMORY_LEGACY_QUERY_SHADOWED','Shared ops still contains a raw Company Memory query, but client access is moved to the safe RPC and the staged RLS migration makes the raw table admin-only','portal-ops.js + portal-foundation-hardening.js','Remove the legacy shared query when portal-ops is next decomposed by role.');

const onboardingDirectInserts=['nexus_companies','nexus_company_members','nexus_projects'].filter(t=>new RegExp(`from\\(['\"]${t}['\"]\\)\\.insert`).test(portalClient));
const atomicOnboardingBoundary=/nexus_onboard_company_atomic/.test(foundation)&&/nexus_onboard_company_atomic/.test(foundationMigration)&&/stopImmediatePropagation/.test(foundation);
if(onboardingDirectInserts.length>=2&&!atomicOnboardingBoundary)add('P0','ONBOARDING_NON_ATOMIC','Onboarding performs multiple client-side inserts',onboardingDirectInserts.join(', '),'Replace with one idempotent transactional RPC/server operation.');
else if(onboardingDirectInserts.length>=2)add('P1','ONBOARDING_LEGACY_HANDLER_SHADOWED','Legacy multi-write onboarding code remains in portal-client but is capture-blocked by the atomic RPC runtime','portal-client.js + portal-foundation-hardening.js','Delete the shadowed legacy handler during portal-client cleanup.');

const critical=['portal-admin-journey.js','portal-diagnosis-controller-v2.js','portal-diagnosis-v2.js','portal-diagnosis-release-queue.js'];
const optionalCritical=critical.filter(f=>portalApp.includes(`optionalImport(asset(\`${f}`)||portalApp.includes(`optionalImportWithoutRecurringIntervals(asset(\`${f}`));
if(optionalCritical.length)add('P0','CRITICAL_OPTIONAL_IMPORT','Critical delivery modules can be swallowed as optional failures',optionalCritical.join(', '),'Classify required modules and fail boot visibly when a required module cannot load.');

const hasBehavioralE2E=/playwright|puppeteer|webdriver|cypress/i.test(`${legacyE2E}\n${playwrightConfig}\n${playwrightPackage}`)&&exists('qa/playwright/tests/public-smoke.spec.mjs');
if(!hasBehavioralE2E)add('P0','E2E_NOT_BEHAVIORAL','No real browser E2E harness detected','No Playwright/Puppeteer/WebDriver/Cypress behavioral suite found','Add browser-level admin/client tests with dedicated QA identities and tenant.');

if(!/resetPasswordForEmail|updateUser\s*\(|forgot password|forgot-password|password recovery/i.test(`${portalClient}\n${auth}`))add('P1','PASSWORD_RECOVERY_MISSING','No password recovery flow found','portal-client.js / portal-auth.js','Add forgot-password request, secure recovery callback and set-new-password flow.');

if(/window\.setInterval\s*=/.test(portalApp))add('P1','BOOT_INTERVAL_PATCH','Portal boot temporarily overrides setInterval','portal-app.js','Remove underlying competing initializers in a dedicated runtime refactor; do not remove this compatibility control in the same release as security hardening.');
if(/window\.MutationObserver\s*=/.test(portalApp))add('P1','BOOT_OBSERVER_PATCH','Portal boot temporarily overrides MutationObserver','portal-app.js','Replace DOM race suppression with deterministic initialization ownership in a dedicated runtime refactor.');
if(/location\.reload\(\)/.test(`${diagnosis}\n${diagnosisExecution}`))add('P1','DIAGNOSIS_FULL_RELOAD','Diagnosis lifecycle still uses full-page reloads','portal-diagnosis-controller-v2.js / portal-diagnosis-execution-ux.js','Move to the tested company-scoped single-flight diagnosis refresh controller after this hardening release is stable.');

const mixed=[];
for(const [file,text] of [['portal-client.js',portalClient],['portal-admin-journey.js',journey],['portal-ops.js',portalOps]]){
  const vocab=['open','done','complete','completed','approved','ready_for_review','needs_revision','not_applicable'].filter(v=>text.includes(`'${v}'`)||text.includes(`\"${v}\"`));
  if(vocab.length>=4)mixed.push(`${file}: ${vocab.join(', ')}`);
}
if(mixed.length)add('P1','STATUS_VOCABULARY_COMPATIBILITY','Legacy status aliases remain at UI boundaries while constrained RPCs/canonical contracts own consequential transitions',mixed.join(' | '),'Continue normalizing aliases at boundaries and avoid adding new persisted synonyms.');

const directTaskUpdate=/from\(['\"]nexus_tasks['\"]\)\.update/.test(portalClient)||/from\(['\"]nexus_tasks['\"]\)\.update/.test(portalOps);
const taskMutationGuard=/\.task-status/.test(foundation)&&/stopImmediatePropagation/.test(foundation)&&/nexus_admin_set_task_status/.test(foundation);
if(directTaskUpdate&&!taskMutationGuard)add('P1','DIRECT_TASK_MUTATION','Browser code directly updates task rows','portal-client.js or portal-ops.js','Route consequential task transitions through constrained RPC/state-transition functions.');
else if(directTaskUpdate)add('P1','DIRECT_TASK_MUTATION_SHADOWED','Legacy task-status update remains in source but capture-phase runtime prevents it and routes supported admin transitions through RPC','portal-client.js + portal-foundation-hardening.js','Remove the obsolete direct update during portal-client cleanup.');

if(releaseQueue&&!/nexus_release_client_task/.test(releaseQueue))add('P0','CLIENT_RELEASE_GATE_MISSING','Diagnosis release queue lacks explicit client task release RPC','portal-diagnosis-release-queue.js','Keep diagnosis-generated client work internal until explicit human release.');

const severities={P0:0,P1:0,P2:0};
for(const f of findings)severities[f.severity]=(severities[f.severity]||0)+1;
console.log(`# Nexus Current-State Static QA Audit\n`);
console.log(`Findings: ${findings.length} · P0 ${severities.P0||0} · P1 ${severities.P1||0} · P2 ${severities.P2||0}\n`);
for(const f of findings){
  console.log(`## ${f.severity} · ${f.id} — ${f.title}`);
  console.log(`Evidence: ${f.evidence}`);
  console.log(`Required resolution: ${f.recommendation}\n`);
}
if(!findings.length)console.log('No configured current-state findings detected.');

if(process.argv.includes('--strict')&&findings.some(f=>f.severity==='P0'))process.exitCode=1;
