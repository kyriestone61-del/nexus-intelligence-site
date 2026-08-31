import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>{try{return fs.readFileSync(path.join(root,file),'utf8')}catch{return ''}};
const findings=[];
const add=(severity,id,title,evidence,recommendation)=>findings.push({severity,id,title,evidence,recommendation});

const portalClient=read('portal-client.js');
const portalOps=read('portal-ops.js');
const portalApp=read('portal-app.js');
const diagnosis=read('portal-diagnosis-controller.js');
const journey=read('portal-admin-journey.js');
const auth=read('portal-auth.js');
const e2e=read('.github/workflows/client-journey-e2e-qa.yml');

const projectZeroFiles=[['portal-client.js',portalClient],['portal-admin-journey.js',journey],['portal-diagnosis-controller.js',diagnosis]].filter(([,s])=>/projects\?\.\[0\]|projects\[0\]/.test(s));
if(projectZeroFiles.length)add('P0','ACTIVE_ENGAGEMENT_IMPLICIT','Active engagement inferred from projects[0]',projectZeroFiles.map(([f])=>f).join(', '),'Use an explicit active engagement/project identifier. Refuse ambiguous multi-project state.');

if(/nexus_company_memory/.test(portalOps)&&!/state\.admin[^\n]{0,200}nexus_company_memory/.test(portalOps))add('P0','MEMORY_CLIENT_VISIBILITY','Company memory is loaded in shared admin/client operations code','portal-ops.js loads nexus_company_memory for the selected company','Project a client-safe memory view or gate internal fields server-side.');

const onboardingDirectInserts=['nexus_companies','nexus_company_members','nexus_projects'].filter(t=>new RegExp(`from\\(['\"]${t}['\"]\\)\\.insert`).test(portalClient));
if(onboardingDirectInserts.length>=2)add('P0','ONBOARDING_NON_ATOMIC','Onboarding performs multiple client-side inserts',onboardingDirectInserts.join(', '),'Replace with one idempotent transactional RPC/server operation.');

const critical=['portal-admin-journey.js','portal-diagnosis-controller.js','portal-diagnosis-v2.js'];
const optionalCritical=critical.filter(f=>portalApp.includes(`optionalImport(asset(\`${f}`)||portalApp.includes(`optionalImportWithoutRecurringIntervals(asset(\`${f}`));
if(optionalCritical.length)add('P0','CRITICAL_OPTIONAL_IMPORT','Critical delivery modules can be swallowed as optional failures',optionalCritical.join(', '),'Classify required modules and fail boot visibly when a required module cannot load.');

if(e2e&&!/playwright|puppeteer|webdriver|cypress/i.test(e2e))add('P0','E2E_NOT_BEHAVIORAL','Client Journey E2E workflow is source-contract testing, not browser E2E','No browser automation framework referenced','Add browser-level admin/client tests with dedicated QA identities and tenant.');

if(!/resetPasswordForEmail|updateUser\s*\(|forgot password|forgot-password|password recovery/i.test(`${portalClient}\n${auth}`))add('P1','PASSWORD_RECOVERY_MISSING','No password recovery flow found','portal-client.js / portal-auth.js','Add forgot-password request, secure recovery callback and set-new-password flow.');

if(/window\.setInterval\s*=/.test(portalApp))add('P1','BOOT_INTERVAL_PATCH','Portal boot temporarily overrides setInterval','portal-app.js','Remove underlying competing initializers during reset; do not rely on timer suppression as permanent architecture.');
if(/window\.MutationObserver\s*=/.test(portalApp))add('P1','BOOT_OBSERVER_PATCH','Portal boot temporarily overrides MutationObserver','portal-app.js','Replace DOM race suppression with deterministic initialization ownership.');
if(/location\.reload\(\)/.test(diagnosis))add('P1','DIAGNOSIS_FULL_RELOAD','Diagnosis lifecycle uses full-page reloads','portal-diagnosis-controller.js','Refresh canonical state through one event/store path rather than reload-driven synchronization.');

const mixed=[];
for(const [file,text] of [['portal-client.js',portalClient],['portal-admin-journey.js',journey],['portal-ops.js',portalOps]]){
  const vocab=['open','done','complete','completed','approved','ready_for_review','not_applicable'].filter(v=>text.includes(`'${v}'`)||text.includes(`\"${v}\"`));
  if(vocab.length>=4)mixed.push(`${file}: ${vocab.join(', ')}`);
}
if(mixed.length)add('P0','STATUS_VOCABULARY_DRIFT','Multiple persisted/computed status vocabularies coexist',mixed.join(' | '),'Define canonical persisted states per entity and centralize aliases at boundaries only.');

const directTaskUpdate=/from\(['\"]nexus_tasks['\"]\)\.update/.test(portalClient)||/from\(['\"]nexus_tasks['\"]\)\.update/.test(portalOps);
if(directTaskUpdate)add('P1','DIRECT_TASK_MUTATION','Browser code directly updates task rows','portal-client.js or portal-ops.js','Route consequential task transitions through constrained RPC/state-transition functions.');

const severities={P0:0,P1:0,P2:0};
for(const f of findings)severities[f.severity]=(severities[f.severity]||0)+1;
console.log(`# Nexus Reset Static QA Audit\n`);
console.log(`Findings: ${findings.length} · P0 ${severities.P0||0} · P1 ${severities.P1||0} · P2 ${severities.P2||0}\n`);
for(const f of findings){
  console.log(`## ${f.severity} · ${f.id} — ${f.title}`);
  console.log(`Evidence: ${f.evidence}`);
  console.log(`Required resolution: ${f.recommendation}\n`);
}
if(!findings.length)console.log('No configured reset-contract findings detected.');

if(process.argv.includes('--strict')&&findings.some(f=>f.severity==='P0'))process.exitCode=1;
