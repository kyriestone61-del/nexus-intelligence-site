const layoutFix=document.createElement('link');
layoutFix.rel='stylesheet';
layoutFix.href='/portal-layout-fix.css?v=20260830-1';
document.head.appendChild(layoutFix);
await new Promise(resolve=>{layoutFix.onload=resolve;layoutFix.onerror=resolve});
await import('/portal-client.js');
