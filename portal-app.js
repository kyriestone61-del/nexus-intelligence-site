const layoutFix=document.createElement('link');
layoutFix.rel='stylesheet';
layoutFix.href='/portal-layout-fix.css?v=20260830-3';
document.head.appendChild(layoutFix);

const simplifyStyles=document.createElement('link');
simplifyStyles.rel='stylesheet';
simplifyStyles.href='/portal-simplify.css?v=20260830-3';
document.head.appendChild(simplifyStyles);

const adminIntakeStyles=document.createElement('link');
adminIntakeStyles.rel='stylesheet';
adminIntakeStyles.href='/portal-admin-intake.css?v=20260830-3';
document.head.appendChild(adminIntakeStyles);

const diagnosisWorkflowStyles=document.createElement('link');
diagnosisWorkflowStyles.rel='stylesheet';
diagnosisWorkflowStyles.href='/portal-diagnosis-v2.css?v=20260830-1';
document.head.appendChild(diagnosisWorkflowStyles);

const actionWorkflowStyles=document.createElement('link');
actionWorkflowStyles.rel='stylesheet';
actionWorkflowStyles.href='/portal-action-workflow.css?v=20260830-2';
document.head.appendChild(actionWorkflowStyles);

const actionExecutionStyles=document.createElement('link');
actionExecutionStyles.rel='stylesheet';
actionExecutionStyles.href='/portal-action-execution-v2.css?v=20260830-1';
document.head.appendChild(actionExecutionStyles);

const guidedOpsStyles=document.createElement('link');
guidedOpsStyles.rel='stylesheet';
guidedOpsStyles.href='/portal-guided-ops.css?v=20260830-1';
document.head.appendChild(guidedOpsStyles);

const adminJourneyStyles=document.createElement('link');
adminJourneyStyles.rel='stylesheet';
adminJourneyStyles.href='/portal-admin-journey.css?v=20260830-2';
document.head.appendChild(adminJourneyStyles);

const journeyQaqcStyles=document.createElement('link');
journeyQaqcStyles.rel='stylesheet';
journeyQaqcStyles.href='/portal-journey-qaqc.css?v=20260830-1';
document.head.appendChild(journeyQaqcStyles);

await Promise.all([
  new Promise(resolve=>{layoutFix.onload=resolve;layoutFix.onerror=resolve}),
  new Promise(resolve=>{simplifyStyles.onload=resolve;simplifyStyles.onerror=resolve}),
  new Promise(resolve=>{adminIntakeStyles.onload=resolve;adminIntakeStyles.onerror=resolve}),
  new Promise(resolve=>{diagnosisWorkflowStyles.onload=resolve;diagnosisWorkflowStyles.onerror=resolve}),
  new Promise(resolve=>{actionWorkflowStyles.onload=resolve;actionWorkflowStyles.onerror=resolve}),
  new Promise(resolve=>{actionExecutionStyles.onload=resolve;actionExecutionStyles.onerror=resolve}),
  new Promise(resolve=>{guidedOpsStyles.onload=resolve;guidedOpsStyles.onerror=resolve}),
  new Promise(resolve=>{adminJourneyStyles.onload=resolve;adminJourneyStyles.onerror=resolve}),
  new Promise(resolve=>{journeyQaqcStyles.onload=resolve;journeyQaqcStyles.onerror=resolve})
]);

function showCoreLoadFailure(error){
  console.error('Nexus core portal failed to initialize.',error);
  const authView=document.getElementById('authView');
  const authMessage=document.getElementById('authMessage');
  if(authView)authView.style.display='block';
  if(authMessage){
    authMessage.textContent='Nexus could not finish loading the secure workspace. Refresh this page. If it persists, sign out and sign back in.';
    authMessage.style.color='#ffb1ba';
  }
}

async function optionalImport(url){
  try{return await import(url)}
  catch(error){console.error(`Optional Nexus portal module failed to load: ${url}`,error);return null}
}

async function importWithoutRecurringIntervals(url,blockedDelays=[]){
  const nativeSetInterval=window.setInterval;
  window.setInterval=(fn,delay,...args)=>blockedDelays.includes(Number(delay))?0:nativeSetInterval(fn,delay,...args);
  try{return await import(url)}finally{window.setInterval=nativeSetInterval}
}

async function optionalImportWithoutRecurringIntervals(url,blockedDelays=[]){
  try{return await importWithoutRecurringIntervals(url,blockedDelays)}
  catch(error){console.error(`Optional Nexus portal module failed to load: ${url}`,error);return null}
}

try{
  await import('/portal-client.js?v=20260830-4');
}catch(error){
  showCoreLoadFailure(error);
  throw error;
}

await optionalImportWithoutRecurringIntervals('/portal-simplify.js?v=20260830-4',[1200]);

// portal-admin-intake already has explicit auth/company reconciliation hooks.
// Its legacy DOM observer can react to its own badge changes indefinitely, so
// suppress MutationObserver creation only while that module initializes.
const NativeMutationObserver=window.MutationObserver;
window.MutationObserver=class NexusPortalNoopObserver{
  constructor(){ }
  observe(){ }
  disconnect(){ }
  takeRecords(){return []}
};
try{
  await import('/portal-admin-intake.js?v=20260830-3');
}catch(error){
  console.error('Optional Nexus portal module failed to load: /portal-admin-intake.js',error);
}finally{
  window.MutationObserver=NativeMutationObserver;
}

// Secured diagnosis enhancements are non-core: a failure here must not prevent
// the authenticated workspace, files, tasks, or navigation from loading.
await optionalImport('/portal-diagnosis-override.js?v=20260830-2');
await optionalImport('/portal-diagnosis-v2.js?v=20260830-1');

await optionalImportWithoutRecurringIntervals('/portal-action-workflow.js?v=20260830-3',[1200]);
await optionalImportWithoutRecurringIntervals('/portal-action-execution-v2.js?v=20260830-2',[900]);
await optionalImport('/portal-action-execution-v2-forms.js?v=20260830-2');
await optionalImport('/portal-guided-ops.js?v=20260830-1');
await optionalImport('/portal-admin-journey.js?v=20260830-3');
await optionalImport('/portal-admin-journey-router.js?v=20260830-1');
await optionalImport('/portal-journey-task-guard.js?v=20260830-1');
await optionalImport('/portal-launch-control.js?v=20260830-1');
