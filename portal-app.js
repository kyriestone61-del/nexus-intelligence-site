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
actionWorkflowStyles.href='/portal-action-workflow.css?v=20260830-1';
document.head.appendChild(actionWorkflowStyles);

await Promise.all([
  new Promise(resolve=>{layoutFix.onload=resolve;layoutFix.onerror=resolve}),
  new Promise(resolve=>{simplifyStyles.onload=resolve;simplifyStyles.onerror=resolve}),
  new Promise(resolve=>{adminIntakeStyles.onload=resolve;adminIntakeStyles.onerror=resolve}),
  new Promise(resolve=>{actionWorkflowStyles.onload=resolve;actionWorkflowStyles.onerror=resolve})
]);

await import('/portal-client.js?v=20260830-3');
await import('/portal-simplify.js?v=20260830-3');

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

await import('/portal-action-workflow.js?v=20260830-1');
