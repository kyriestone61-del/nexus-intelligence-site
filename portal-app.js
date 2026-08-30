const layoutFix=document.createElement('link');
layoutFix.rel='stylesheet';
layoutFix.href='/portal-layout-fix.css?v=20260830-2';
document.head.appendChild(layoutFix);

const simplifyStyles=document.createElement('link');
simplifyStyles.rel='stylesheet';
simplifyStyles.href='/portal-simplify.css?v=20260830-2';
document.head.appendChild(simplifyStyles);

const adminIntakeStyles=document.createElement('link');
adminIntakeStyles.rel='stylesheet';
adminIntakeStyles.href='/portal-admin-intake.css?v=20260830-2';
document.head.appendChild(adminIntakeStyles);

await Promise.all([
  new Promise(resolve=>{layoutFix.onload=resolve;layoutFix.onerror=resolve}),
  new Promise(resolve=>{simplifyStyles.onload=resolve;simplifyStyles.onerror=resolve}),
  new Promise(resolve=>{adminIntakeStyles.onload=resolve;adminIntakeStyles.onerror=resolve})
]);

await import('/portal-client.js?v=20260830-2');
await import('/portal-simplify.js?v=20260830-2');

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
  await import('/portal-admin-intake.js?v=20260830-2');
}finally{
  window.MutationObserver=NativeMutationObserver;
}
