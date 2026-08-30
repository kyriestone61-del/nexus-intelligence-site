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
adminJourneyStyles.href='/portal-admin-journey.css?v=20260830-1';
document.head.appendChild(adminJourneyStyles);

await Promise.all([
  new Promise(resolve=>{layoutFix.onload=resolve;layoutFix.onerror=resolve}),
  new Promise(resolve=>{simplifyStyles.onload=resolve;simplifyStyles.onerror=resolve}),
  new Promise(resolve=>{adminIntakeStyles.onload=resolve;adminIntakeStyles.onerror=resolve}),
  new Promise(resolve=>{actionWorkflowStyles.onload=resolve;actionWorkflowStyles.onerror=resolve}),
  new Promise(resolve=>{actionExecutionStyles.onload=resolve;actionExecutionStyles.onerror=resolve}),
  new Promise(resolve=>{guidedOpsStyles.onload=resolve;guidedOpsStyles.onerror=resolve}),
  new Promise(resolve=>{adminJourneyStyles.onload=resolve;adminJourneyStyles.onerror=resolve})
]);

async function importWithoutRecurringIntervals(url,blockedDelays=[]){
  const nativeSetInterval=window.setInterval;
  window.setInterval=(fn,delay,...args)=>blockedDelays.includes(Number(delay))?0:nativeSetInterval(fn,delay,...args);
  try{return await import(url)}finally{window.setInterval=nativeSetInterval}
}

await import('/portal-client.js?v=20260830-3');
await importWithoutRecurringIntervals('/portal-simplify.js?v=20260830-4',[1200]);

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
}finally{
  window.MutationObserver=NativeMutationObserver;
}

await importWithoutRecurringIntervals('/portal-action-workflow.js?v=20260830-3',[1200]);
await importWithoutRecurringIntervals('/portal-action-execution-v2.js?v=20260830-2',[900]);
await import('/portal-action-execution-v2-forms.js?v=20260830-1');
await import('/portal-guided-ops.js?v=20260830-1');
await import('/portal-admin-journey.js?v=20260830-1');
