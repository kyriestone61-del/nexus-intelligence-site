const asset=path=>`/${String(path||'').replace(/^\//,'')}`;
const BUILD='20260831-shell-reset2';

// The portal must never expose an intermediate workspace. portal-client and
// portal-ops both build useful base UI, but admins should only see the final
// Client Journey navigation after identity, company context, operations data,
// intake, diagnosis, and Journey routing are ready.
window.__nexusPortalBooting=true;
document.body.classList.add('nexus-runtime-booting');

const bootStyle=document.createElement('style');
bootStyle.id='nexusPortalBootStyle';
bootStyle.textContent=`
  body.nexus-runtime-booting #portalApp{visibility:hidden!important}
  #nexusPortalBootOverlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#09080f;color:#f4f0e8;font-family:inherit}
  #nexusPortalBootOverlay .nexus-boot-card{width:min(460px,calc(100vw - 40px));padding:28px;border:1px solid rgba(229,224,255,.14);border-radius:18px;background:#15131f;box-shadow:0 24px 70px rgba(0,0,0,.36)}
  #nexusPortalBootOverlay .nexus-boot-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:9px;background:#9c7cff;color:#0c0815;font-weight:950;margin-bottom:18px}
  #nexusPortalBootOverlay h2{margin:0 0 7px;font-size:24px}
  #nexusPortalBootOverlay p{margin:0;color:#aaa4ba;line-height:1.5;font-size:13px}
  #nexusPortalBootOverlay .nexus-boot-line{height:4px;margin-top:20px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.06)}
  #nexusPortalBootOverlay .nexus-boot-line:after{content:"";display:block;height:100%;width:42%;border-radius:inherit;background:#d9ff72;animation:nexusBootMove 1.1s ease-in-out infinite alternate}
  @keyframes nexusBootMove{from{transform:translateX(-5%)}to{transform:translateX(145%)}}
`;
document.head.appendChild(bootStyle);

const bootOverlay=document.createElement('div');
bootOverlay.id='nexusPortalBootOverlay';
bootOverlay.innerHTML='<div class="nexus-boot-card"><div class="nexus-boot-mark">N</div><h2>Loading Nexus workspace…</h2><p>Confirming your account, client workspace, and final navigation.</p><div class="nexus-boot-line"></div></div>';
document.body.appendChild(bootOverlay);

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
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=asset(`${file}?v=${BUILD}`);
  link.onload=resolve;
  link.onerror=resolve;
  document.head.appendChild(link);
}));
await Promise.all(styleLoads);

function setBootMessage(title,message){
  const card=bootOverlay.querySelector('.nexus-boot-card');
  if(!card)return;
  const h=card.querySelector('h2'),p=card.querySelector('p');
  if(h)h.textContent=title;
  if(p)p.textContent=message;
}
function clearBootLock(){
  window.__nexusPortalBooting=false;
  document.body.classList.add('nexus-shell-ready');
  const app=document.getElementById('portalApp');
  if(app)app.style.visibility='';
  document.body.classList.remove('nexus-runtime-booting');
  bootOverlay.remove();
  bootStyle.remove();
}
function showCoreLoadFailure(error){
  console.error('Nexus core portal failed to initialize.',error);
  window.__nexusPortalBooting=false;
  const app=document.getElementById('portalApp');
  if(app)app.style.visibility='hidden';
  document.body.classList.remove('nexus-runtime-booting');
  setBootMessage('Nexus could not finish loading.', 'Refresh this page. If the problem continues, sign out and sign back in.');
  const line=bootOverlay.querySelector('.nexus-boot-line');
  if(line)line.style.display='none';
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
async function waitFor(test,{timeout=5000,step=70}={}){
  const start=Date.now();
  while(Date.now()-start<timeout){
    try{if(test())return true}catch{}
    await new Promise(resolve=>setTimeout(resolve,step));
  }
  return false;
}

try{
  // portal-client imports portal-ops. Suppress only the legacy 180ms ops setup
  // timer during this import. That timer can observe state.user before the admin
  // role query finishes and build the client navigation shown in the reported
  // flicker. Operations are initialized deliberately after identity resolves.
  await importWithoutRecurringIntervals(asset(`portal-client.js?v=${BUILD}`),[180]);
}catch(error){showCoreLoadFailure(error);throw error}

const portal=window.NexusPortal;
if(!portal){showCoreLoadFailure(new Error('Nexus portal context is unavailable.'));throw new Error('Nexus portal context is unavailable.')}
const isSignedIn=!!portal.state?.user;
const isAdmin=!!portal.state?.admin;

// Reinitialize the operations module only after portal-client has completed the
// identity + company bootstrap. This makes role resolution deterministic.
if(isSignedIn&&portal.state?.companyId){
  const opsModule=await optionalImport(asset(`portal-ops.js?v=${BUILD}`));
  if(opsModule?.initOps){
    window.__nexusOpsInit=false;
    await opsModule.initOps({
      sb:portal.sb,
      state:portal.state,
      $:portal.$,
      toast:portal.toast,
      workspace:portal.workspace,
      log:portal.log
    });
    // portal-ops intentionally performs its setup on a short timer. Wait for
    // that hidden base layer to complete before any final navigation is built.
    await waitFor(()=>document.getElementById('opsTodayRoot'),{timeout:2200,step:60});
  }
}

// Client-friendly relabeling is only used for client accounts. Admin accounts
// never run it, so it cannot overwrite the Client Journey navigation.
if(isSignedIn&&!isAdmin){
  await optionalImportWithoutRecurringIntervals(asset(`portal-simplify.js?v=${BUILD}`),[1200]);
}

if(isSignedIn&&isAdmin){
  // Admin intake has explicit reconciliation hooks. Suppress only its retired
  // whole-document MutationObserver while it initializes.
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

  await optionalImport(asset(`portal-diagnosis-v2.js?v=${BUILD}`));
  await optionalImport(asset(`portal-diagnosis-manual-fallback.js?v=${BUILD}`));
  await optionalImport(asset(`portal-diagnosis-recovery.js?v=${BUILD}`));
}

// Shared action/work records load for both account types.
if(isSignedIn){
  await optionalImportWithoutRecurringIntervals(asset(`portal-action-workflow.js?v=${BUILD}`),[1200]);
  await optionalImportWithoutRecurringIntervals(asset(`portal-action-execution-v2.js?v=${BUILD}`),[900]);
  await optionalImport(asset(`portal-action-execution-v2-forms.js?v=${BUILD}`));
  await optionalImport(asset(`portal-guided-ops.js?v=${BUILD}`));
}

if(isSignedIn&&isAdmin){
  await optionalImport(asset(`portal-admin-journey.js?v=${BUILD}`));
  await optionalImport(asset(`portal-admin-journey-router.js?v=${BUILD}`));
  await optionalImport(asset(`portal-diagnosis-controller.js?v=${BUILD}`));
  await optionalImport(asset(`portal-diagnosis-review-ux.js?v=${BUILD}`));
  await optionalImport(asset(`portal-journey-task-guard.js?v=${BUILD}`));

  const finalAdminReady=await waitFor(()=>{
    const nav=document.querySelector('.side-nav');
    const labels=[...nav?.querySelectorAll('button')||[]].map(x=>x.textContent.trim());
    return document.querySelector('.journey-primary')&&
      document.querySelector('#adminJourneyRoot .journey-step')&&
      labels.includes('Client Journey')&&
      labels.includes('Discovery & Diagnosis');
  },{timeout:5200,step:70});

  if(!finalAdminReady){
    showCoreLoadFailure(new Error('Final Nexus admin navigation did not initialize.'));
    throw new Error('Final Nexus admin navigation did not initialize.');
  }

  await window.NexusDiagnosisController?.refreshJourneyLabels?.();
  window.NexusDiagnosisController?.normalizeIntake?.();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}

// For signed-out visitors, portal-client has already selected the auth view.
// For client users, operations setup is the final workspace. For admins, the
// checks above guarantee the Client Journey navigation exists before reveal.
clearBootLock();
