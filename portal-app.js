const asset=path=>`/${String(path||'').replace(/^\//,'')}`;
const BUILD='20260831-runtime-reset1';

// Keep authenticated workspace chrome hidden until the final role-specific
// navigation and controllers have initialized. This prevents users from seeing
// the base sidebar, operations sidebar, and Client Journey sidebar flash in sequence.
const bootStyle=document.createElement('style');
bootStyle.id='nexusPortalBootStyle';
bootStyle.textContent='body.nexus-runtime-booting #portalApp{visibility:hidden!important}';
document.head.appendChild(bootStyle);
document.body.classList.add('nexus-runtime-booting');

const styleAssets=[
  'portal-layout-fix.css',
  'portal-simplify.css',
  'portal-admin-intake.css',
  'portal-diagnosis-v2.css',
  'portal-action-workflow.css',
  'portal-action-execution-v2.css',
  'portal-guided-ops.css',
  'portal-admin-journey.css',
  'portal-journey-qaqc.css'
];
const styleLoads=styleAssets.map(file=>new Promise(resolve=>{
  const link=document.createElement('link');link.rel='stylesheet';link.href=asset(`${file}?v=${BUILD}`);link.onload=resolve;link.onerror=resolve;document.head.appendChild(link);
}));
await Promise.all(styleLoads);

function showCoreLoadFailure(error){
  console.error('Nexus core portal failed to initialize.',error);
  document.body.classList.remove('nexus-runtime-booting');
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
async function waitFor(test,{timeout=3500,step=70}={}){
  const start=Date.now();
  while(Date.now()-start<timeout){try{if(test())return true}catch{}await new Promise(resolve=>setTimeout(resolve,step))}
  return false;
}
function revealPortal(){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    document.body.classList.remove('nexus-runtime-booting');
    bootStyle.remove();
  }));
}

try{
  // Core owns authentication, workspace data, and the base portal records.
  await import(asset(`portal-client.js?v=${BUILD}`));
}catch(error){showCoreLoadFailure(error);throw error}

const portal=window.NexusPortal;
const isAdmin=!!portal?.state?.admin;

// Client-friendly relabeling remains useful for client accounts. Admin accounts
// skip this module so it cannot mutate the navigation after Client Journey owns it.
if(!isAdmin)await optionalImportWithoutRecurringIntervals(asset(`portal-simplify.js?v=${BUILD}`),[1200]);

if(isAdmin){
  // Admin intake has its own explicit reconcile hooks. Suppress only its legacy
  // whole-document MutationObserver during initialization.
  const NativeMutationObserver=window.MutationObserver;
  window.MutationObserver=class NexusPortalNoopObserver{
    constructor(){}
    observe(){}
    disconnect(){}
    takeRecords(){return []}
  };
  try{await import(asset(`portal-admin-intake.js?v=${BUILD}`))}
  catch(error){console.error('Optional Nexus portal module failed to load: portal-admin-intake.js',error)}
  finally{window.MutationObserver=NativeMutationObserver}

  // One secured diagnosis renderer + one manual fallback + one controller.
  // The old diagnosis override, label patch, and Journey reliability patch are
  // intentionally not loaded; they previously competed for the same DOM state.
  await optionalImport(asset(`portal-diagnosis-v2.js?v=${BUILD}`));
  await optionalImport(asset(`portal-diagnosis-manual-fallback.js?v=${BUILD}`));
}

// Shared action/work records load for both account types.
await optionalImportWithoutRecurringIntervals(asset(`portal-action-workflow.js?v=${BUILD}`),[1200]);
await optionalImportWithoutRecurringIntervals(asset(`portal-action-execution-v2.js?v=${BUILD}`),[900]);
await optionalImport(asset(`portal-action-execution-v2-forms.js?v=${BUILD}`));
await optionalImport(asset(`portal-guided-ops.js?v=${BUILD}`));

if(isAdmin){
  await optionalImport(asset(`portal-admin-journey.js?v=${BUILD}`));
  await optionalImport(asset(`portal-admin-journey-router.js?v=${BUILD}`));
  await optionalImport(asset(`portal-diagnosis-controller.js?v=${BUILD}`));

  // Keep the compact diagnosis presentation, but the controller now owns
  // Journey routing and stops the old review module from competing for it.
  await optionalImport(asset(`portal-diagnosis-review-ux.js?v=${BUILD}`));
  await optionalImport(asset(`portal-journey-task-guard.js?v=${BUILD}`));

  await waitFor(()=>document.querySelector('.journey-primary')&&document.querySelector('#adminJourneyRoot .journey-step'));
  await portal?.NexusDiagnosisController?.refreshJourneyLabels?.();
  portal?.NexusDiagnosisController?.normalizeIntake?.();
  await new Promise(resolve=>setTimeout(resolve,120));
}

// Launch Control remains in the dedicated Admin Console instead of injecting a
// late sidebar item into the client-delivery workspace.
revealPortal();
