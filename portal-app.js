const asset=path=>`/${String(path||'').replace(/^\//,'')}`;
const BUILD='20260901-control-room-reconcile5';

window.__nexusPortalBooting=true;
window.__nexusOpsInit=true;
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
bootOverlay.innerHTML='<div class="nexus-boot-card"><div class="nexus-boot-mark">N</div><h2>Loading Nexus workspace…</h2><p>Confirming your account and opening the correct workspace.</p><div class="nexus-boot-line"></div></div>';
document.body.appendChild(bootOverlay);

function loadStyle(file){return new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href=asset(`${file}?v=${BUILD}`);link.onload=resolve;link.onerror=()=>{console.error(`Nexus stylesheet failed to load: ${file}`);resolve()};document.head.appendChild(link)})}
async function loadStyles(files){await Promise.all(files.map(loadStyle))}
function setBootMessage(title,message){const card=bootOverlay.querySelector('.nexus-boot-card');if(!card)return;const h=card.querySelector('h2'),p=card.querySelector('p');if(h)h.textContent=title;if(p)p.textContent=message}
function clearBootLock(){window.__nexusPortalBooting=false;document.body.classList.add('nexus-shell-ready');const app=document.getElementById('portalApp');if(app)app.style.visibility='';document.body.classList.remove('nexus-runtime-booting');bootOverlay.remove();bootStyle.remove()}
function showCoreLoadFailure(error){
  console.error('Nexus portal enhancement failed to initialize.',error);
  clearBootLock();
  document.body.classList.add('nexus-runtime-degraded');
  if(document.getElementById('nexusPortalDegradedBanner'))return;
  const banner=document.createElement('div');
  banner.id='nexusPortalDegradedBanner';
  banner.setAttribute('role','status');
  banner.style.cssText='position:relative;z-index:10000;padding:10px 16px;background:#2a2138;color:#f4f0e8;border-bottom:1px solid rgba(255,255,255,.12);font:600 13px/1.4 system-ui,sans-serif;text-align:center';
  banner.textContent='Nexus opened in recovery mode because one workspace enhancement did not finish loading. Core portal access remains available.';
  const app=document.getElementById('portalApp');
  (app||document.body).prepend(banner);
}
async function optionalImport(url){try{return await import(url)}catch(error){console.error(`Optional Nexus portal module failed to load: ${url}`,error);return null}}
async function requiredImport(url,label=url){try{return await import(url)}catch(error){console.error(`Required Nexus portal module failed to load: ${label}`,error);showCoreLoadFailure(error);throw error}}
async function importWithoutRecurringIntervals(url,blockedDelays=[]){const nativeSetInterval=window.setInterval;window.setInterval=(fn,delay,...args)=>blockedDelays.includes(Number(delay))?0:nativeSetInterval(fn,delay,...args);try{return await import(url)}finally{window.setInterval=nativeSetInterval}}
async function requiredImportWithoutRecurringIntervals(url,blockedDelays=[],label=url){try{return await importWithoutRecurringIntervals(url,blockedDelays)}catch(error){console.error(`Required Nexus portal module failed to load: ${label}`,error);showCoreLoadFailure(error);throw error}}
async function waitFor(test,{timeout=5000,step=70}={}){const start=Date.now();while(Date.now()-start<timeout){try{if(test())return true}catch{}await new Promise(resolve=>setTimeout(resolve,step))}return false}

await loadStyles(['portal-runtime-hardening.css']);
try{await importWithoutRecurringIntervals(asset(`portal-client.js?v=${BUILD}`),[180])}catch(error){showCoreLoadFailure(error);throw error}
const portal=window.NexusPortal;if(!portal){showCoreLoadFailure(new Error('Nexus portal context is unavailable.'));throw new Error('Nexus portal context is unavailable.')}
const platformAdmin=!!portal.state?.admin;
const isSignedIn=!!portal.state?.user;
let perspectiveModule=null;

await requiredImport(asset(`portal-accessibility.js?v=${BUILD}`),'portal accessibility');

if(isSignedIn&&platformAdmin){
  await loadStyles(['perspective-switcher.css']);
  perspectiveModule=await requiredImport(asset(`portal-perspective-switcher.js?v=${BUILD}`),'perspective switcher');
  await perspectiveModule.preparePerspective?.(portal);
}

const useClientShell=isSignedIn&&(!platformAdmin||portal.state?.viewMode==='client');
const useAdminShell=isSignedIn&&platformAdmin&&!useClientShell;

if(useClientShell){
  await loadStyles(['portal-client-shell-v2.css']);
  await requiredImport(asset(`portal-client-core.js?v=${BUILD}`),'client state engine');
  await requiredImport(asset(`portal-client-upload-service.js?v=${BUILD}`),'client upload service');
  await requiredImport(asset(`portal-client-shell-v2.js?v=${BUILD}`),'reconciled client shell');
  if(platformAdmin)perspectiveModule?.mountPerspectiveSwitcher?.(portal);
  clearBootLock();
}else if(useAdminShell){
  const adminStyles=['portal-layout-fix.css','portal-simplify.css','portal-admin-intake.css','portal-discovery-capture.css','portal-diagnosis-v2.css','portal-action-workflow.css','portal-action-execution-v2.css','portal-guided-ops.css','portal-admin-journey.css','portal-journey-qaqc.css','portal-revenue-engine.css','portal-approval-inbox.css','portal-workflow-cohesion.css','portal-client-guide.css','portal-ux-refinement.css','portal-mobile-hardening.css','portal-buildingblok-cohesion.css'];
  await loadStyles(adminStyles);
  await requiredImport(asset(`portal-foundation-hardening.js?v=${BUILD}`),'workspace foundation hardening');
  await requiredImport(asset(`portal-active-engagement-cohesion.js?v=${BUILD}`),'active engagement cohesion');
  await requiredImport(asset(`portal-approval-bridge.js?v=${BUILD}`),'approval routing bridge');
  if(portal.state?.companyId){
    const opsModule=await requiredImport(asset(`portal-ops.js?v=${BUILD}`),'operations workspace');
    if(!opsModule?.initOps){const error=new Error('Nexus operations module did not expose initOps.');showCoreLoadFailure(error);throw error}
    window.__nexusOpsInit=false;
    const opsClient=window.NexusFoundationHardening?.opsClient||portal.sb;
    await opsModule.initOps({sb:opsClient,state:portal.state,$:portal.$,toast:portal.toast,workspace:portal.workspace,log:portal.log});
    await waitFor(()=>document.getElementById('opsTodayRoot'),{timeout:2200,step:60});
  }
  const NativeMutationObserver=window.MutationObserver;
  window.MutationObserver=class NexusPortalNoopObserver{constructor(){}observe(){}disconnect(){}takeRecords(){return []}};
  try{await requiredImport(asset(`portal-admin-intake.js?v=${BUILD}`),'admin intake')}finally{window.MutationObserver=NativeMutationObserver}
  await requiredImport(asset(`portal-diagnosis-execution-ux.js?v=${BUILD}`),'diagnosis execution UX');
  await requiredImport(asset(`portal-diagnosis-v2.js?v=${BUILD}`),'diagnosis review runtime');
  await requiredImport(asset(`portal-diagnosis-approval-ux.js?v=${BUILD}`),'diagnosis approval UX');
  await optionalImport(asset(`portal-diagnosis-manual-fallback.js?v=${BUILD}`));
  await optionalImport(asset(`portal-diagnosis-recovery.js?v=${BUILD}`));
  await requiredImportWithoutRecurringIntervals(asset(`portal-action-workflow.js?v=${BUILD}`),[1200],'action workflow');
  await requiredImport(asset(`portal-action-execution-v2.js?v=${BUILD}`),'action execution');
  await optionalImport(asset(`portal-action-execution-v2-forms.js?v=${BUILD}`));
  await optionalImport(asset(`portal-guided-ops.js?v=${BUILD}`));
  await requiredImport(asset(`portal-admin-journey.js?v=${BUILD}`),'admin Client Journey');
  await requiredImport(asset(`portal-admin-journey-router.js?v=${BUILD}`),'Client Journey router');
  await requiredImport(asset(`portal-diagnosis-controller-v2.js?v=${BUILD}`),'diagnosis controller');
  await requiredImport(asset(`portal-diagnosis-release-queue.js?v=${BUILD}`),'diagnosis client release queue');
  await requiredImport(asset(`portal-diagnosis-review-ux.js?v=${BUILD}`),'diagnosis review UX');
  await requiredImport(asset(`portal-journey-task-guard.js?v=${BUILD}`),'journey task guard');
  await requiredImport(asset(`portal-revenue-engine.js?v=${BUILD}`),'Revenue Engine');
  const finalAdminReady=await waitFor(()=>{const nav=document.querySelector('.side-nav');const labels=[...nav?.querySelectorAll('button')||[]].map(x=>x.textContent.trim());return document.querySelector('.journey-primary')&&document.querySelector('#adminJourneyRoot .journey-step')&&labels.includes('Client Journey')&&labels.includes('Discovery & Diagnosis')&&labels.includes('Revenue Engine')},{timeout:5200,step:70});
  if(!finalAdminReady){showCoreLoadFailure(new Error('Final Nexus admin navigation did not initialize.'));throw new Error('Final Nexus admin navigation did not initialize.')}
  await window.NexusDiagnosisController?.refreshJourneyLabels?.({force:true});window.NexusDiagnosisController?.normalizeIntake?.();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  await requiredImport(asset(`portal-vnext-runtime-router.js?v=${BUILD}`),'vNext delivery runtime router');
  await requiredImport(asset(`portal-vnext-experience.js?v=${BUILD}`),'vNext diagnosis and client report experience');
  await requiredImport(asset(`portal-approval-inbox.js?v=${BUILD}`),'approval chains and Inbox');
  await requiredImport(asset(`portal-workflow-cohesion.js?v=${BUILD}`),'workflow cohesion');
  await requiredImport(asset(`portal-buildingblok-cohesion.js?v=${BUILD}`),'Companies, Inbox and mobile operating model');
  await requiredImport(asset(`portal-ux-refinement.js?v=${BUILD}`),'front-end UX refinement');
  perspectiveModule?.mountPerspectiveSwitcher?.(portal);
  clearBootLock();
}else{
  clearBootLock();
}
