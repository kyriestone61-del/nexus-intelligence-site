const layoutFix=document.createElement('link');
layoutFix.rel='stylesheet';
layoutFix.href='/portal-layout-fix.css?v=20260830-1';
document.head.appendChild(layoutFix);

const simplifyStyles=document.createElement('link');
simplifyStyles.rel='stylesheet';
simplifyStyles.href='/portal-simplify.css?v=20260830-1';
document.head.appendChild(simplifyStyles);

const adminIntakeStyles=document.createElement('link');
adminIntakeStyles.rel='stylesheet';
adminIntakeStyles.href='/portal-admin-intake.css?v=20260830-1';
document.head.appendChild(adminIntakeStyles);

await Promise.all([
  new Promise(resolve=>{layoutFix.onload=resolve;layoutFix.onerror=resolve}),
  new Promise(resolve=>{simplifyStyles.onload=resolve;simplifyStyles.onerror=resolve}),
  new Promise(resolve=>{adminIntakeStyles.onload=resolve;adminIntakeStyles.onerror=resolve})
]);
await import('/portal-client.js');
await import('/portal-simplify.js');
await import('/portal-admin-intake.js?v=20260830-1');
