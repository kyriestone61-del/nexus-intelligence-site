const asset=path=>`/${String(path||'').replace(/^\//,'')}`;
const BUILD='20261016-nepsis-client-journey-v1';
window.__relystraDeliveryLifecycle=true;

window.__nexusPortalBooting=true;
window.__nexusOpsInit=true;
document.body.classList.add('nexus-runtime-booting');

const bootStyle=document.createElement('style');
bootStyle.id='nexusPortalBootStyle';
bootStyle.textContent=`
  body.nexus-runtime-booting #portalApp{visibility:hidden!important}
  #nexusPortalBootOverlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:#f7f3ea;color:#0b263a;font-family:"Avenir Next",Avenir,"Helvetica Neue",Arial,sans-serif}
  #nexusPortalBootOverlay .nexus-boot-card{width:min(500px,calc(100vw - 40px));padding:36px;border:1px solid #bfc5c3;border-top:4px solid #0d5b66;border-radius:4px;background:#fffdf8;box-shadow:0 24px 70px rgba(8,37,56,.12)}
  #nexusPortalBootOverlay .nexus-boot-brand{display:flex;align-items:center;gap:12px;margin-bottom:30px;color:#082538}
  #nexusPortalBootOverlay .nexus-boot-brand img{width:40px;height:40px;border-radius:4px}
  #nexusPortalBootOverlay .nexus-boot-brand span{display:grid;gap:2px;font-family:Baskerville,Georgia,"Times New Roman",serif;font-size:18px;letter-spacing:.25em}
  #nexusPortalBootOverlay .nexus-boot-brand small{font-family:"Avenir Next",Avenir,"Helvetica Neue",Arial,sans-serif;font-size:7px;font-weight:700;letter-spacing:.18em;color:#425462}
  #nexusPortalBootOverlay h2{margin:0 0 9px;color:#082538;font-family:Baskerville,Georgia,"Times New Roman",serif;font-size:32px;font-weight:400;line-height:1.05;letter-spacing:-.025em}
  #nexusPortalBootOverlay p{margin:0;color:#425462;line-height:1.55;font-size:13px}
  #nexusPortalBootOverlay .nexus-boot-line{height:3px;margin-top:25px;overflow:hidden;background:#e2efeb}
  #nexusPortalBootOverlay .nexus-boot-line:after{content:"";display:block;height:100%;width:42%;background:#197884;animation:nexusBootMove 1.1s ease-in-out infinite alternate}
  @keyframes nexusBootMove{from{transform:translateX(-5%)}to{transform:translateX(145%)}}
  @media(prefers-reduced-motion:reduce){#nexusPortalBootOverlay .nexus-boot-line:after{animation:none;width:68%}}
`;
document.head.appendChild(bootStyle);

const bootOverlay=document.createElement('div');
bootOverlay.id='nexusPortalBootOverlay';
bootOverlay.innerHTML='<div class="nexus-boot-card"><div class="nexus-boot-brand"><img src="/assets/nepsis-homepage-mark.svg" alt=""><span>NEPSIS<small>INTELLIGENCE</small></span></div><h2>Opening your Nepsis workspace…</h2><p>Confirming your account and opening the correct company workspace.</p><div class="nexus-boot-line"></div></div>';
document.body.appendChild(bootOverlay);

function loadStyle(file){return new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href=asset(`${file}?v=${BUILD}`);link.onload=resolve;link.onerror=()=>{console.error(`Nepsis stylesheet failed to load: ${file}`);resolve()};document.head.appendChild(link)})}
async function loadStyles(files){await Promise.all(files.map(loadStyle))}
function setBootMessage(title,message){const card=bootOverlay.querySelector('.nexus-boot-card');if(!card)return;const h=card.querySelector('h2'),p=card.querySelector('p');if(h)h.textContent=title;if(p)p.textContent=message}
function clearBootLock(){window.__nexusPortalBooting=false;document.body.classList.add('nexus-shell-ready');const app=document.getElementById('portalApp');if(app)app.style.visibility='';document.body.classList.remove('nexus-runtime-booting');bootOverlay.remove();bootStyle.remove()}
function showCoreLoadFailure(error){
  console.error('Nepsis portal enhancement failed to initialize.',error);
  clearBootLock();
  document.body.classList.add('nexus-runtime-degraded');
  if(document.getElementById('nexusPortalDegradedBanner'))return;
  const banner=document.createElement('div');
  banner.id='nexusPortalDegradedBanner';
  banner.setAttribute('role','status');
  banner.style.cssText='position:relative;z-index:10000;padding:10px 16px;background:#2a2138;color:#f4f0e8;border-bottom:1px solid rgba(255,255,255,.12);font:600 13px/1.4 system-ui,sans-serif;text-align:center';
  banner.textContent='Nepsis opened in recovery mode because one workspace enhancement did not finish loading. Core portal access remains available.';
  const app=document.getElementById('portalApp');
  (app||document.body).prepend(banner);
}
async function optionalImport(url){try{return await import(url)}catch(error){console.error(`Optional Nepsis portal module failed to load: ${url}`,error);return null}}
async function requiredImport(url,label=url){try{return await import(url)}catch(error){console.error(`Required Nepsis portal module failed to load: ${label}`,error);showCoreLoadFailure(error);throw error}}
async function importWithoutRecurringIntervals(url,blockedDelays=[]){const nativeSetInterval=window.setInterval;window.setInterval=(fn,delay,...args)=>blockedDelays.includes(Number(delay))?0:nativeSetInterval(fn,delay,...args);try{return await import(url)}finally{window.setInterval=nativeSetInterval}}
async function requiredImportWithoutRecurringIntervals(url,blockedDelays=[],label=url){try{return await importWithoutRecurringIntervals(url,blockedDelays)}catch(error){console.error(`Required Nepsis portal module failed to load: ${label}`,error);showCoreLoadFailure(error);throw error}}
async function waitFor(test,{timeout=5000,step=70}={}){const start=Date.now();while(Date.now()-start<timeout){try{if(test())return true}catch{}await new Promise(resolve=>setTimeout(resolve,step))}return false}

await loadStyles(['portal-runtime-hardening.css','portal-delivery.css']);
try{await importWithoutRecurringIntervals(asset(`portal-client.js?v=${BUILD}`),[180])}catch(error){showCoreLoadFailure(error);throw error}
await optionalImport(asset(`portal-client-plain-language.js?v=${BUILD}`));
const portal=window.NexusPortal;if(!portal){showCoreLoadFailure(new Error('Nepsis portal context is unavailable.'));throw new Error('Nepsis portal context is unavailable.')}
if(portal.state?.user&&portal.state.authorizationStatus!=='verified'){
  setBootMessage('Workspace access could not be confirmed','Retry to confirm your account permissions and load the correct workspace.');
  const retry=document.createElement('button');retry.type='button';retry.className='btn primary';retry.textContent='Retry workspace access';retry.onclick=()=>location.reload();bootOverlay.querySelector('.nexus-boot-card').append(retry);
  bootOverlay.querySelector('.nexus-boot-line')?.remove();
  throw new Error('Workspace authorization has not completed.');
}
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
  await loadStyles(['portal-client-shell-v2.css','portal-client-action-execution.css','portal-action-processing-engine.css']);
  await requiredImport(asset(`portal-client-core.js?v=${BUILD}`),'client state engine');
  await requiredImport(asset(`portal-client-upload-service.js?v=${BUILD}`),'client upload service');
  await requiredImport(asset(`portal-client-shell-v2.js?v=${BUILD}`),'reconciled client shell');
  await requiredImport(asset(`portal-action-processing-engine.js?v=${BUILD}`),'governed Action processing');
  await requiredImport(asset(`portal-client-action-execution.js?v=${BUILD}`),'client action execution and handoff');
  await requiredImport(asset(`portal-diagnosis-pdf-ui.js?v=${BUILD}`),'diagnosis PDF downloads');
  window.NexusClientPlainLanguage?.apply?.();
  if(platformAdmin)perspectiveModule?.mountPerspectiveSwitcher?.(portal);
  await loadStyles(['portal-nepsis-visual-system.css']);
  clearBootLock();
}else if(useAdminShell){
  const adminStyles=['portal-layout-fix.css','portal-simplify.css','portal-admin-intake.css','portal-discovery-capture.css','portal-diagnosis-v2.css','portal-action-workflow.css','portal-action-execution-v2.css','portal-action-processing-engine.css','portal-guided-ops.css','portal-admin-journey.css','portal-journey-qaqc.css','portal-revenue-engine.css','portal-approval-inbox.css','portal-workflow-cohesion.css','portal-client-guide.css','portal-ux-refinement.css','portal-mobile-hardening.css','portal-buildingblok-cohesion.css'];
  await loadStyles(adminStyles);
  await requiredImport(asset(`portal-foundation-hardening.js?v=${BUILD}`),'workspace foundation hardening');
  await requiredImport(asset(`portal-active-engagement-cohesion.js?v=${BUILD}`),'active engagement cohesion');
  await requiredImport(asset(`portal-approval-bridge.js?v=${BUILD}`),'approval routing bridge');
  if(portal.state?.companyId){
    const opsModule=await requiredImport(asset(`portal-ops.js?v=${BUILD}`),'operations workspace');
    if(!opsModule?.initOps){const error=new Error('Nepsis operations module did not expose initOps.');showCoreLoadFailure(error);throw error}
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
  await requiredImport(asset(`portal-action-processing-engine.js?v=${BUILD}`),'governed Action processing');
  await requiredImport(asset(`portal-diagnosis-controller-v2.js?v=${BUILD}`),'diagnosis controller');
  await requiredImport(asset(`portal-diagnosis-release-queue.js?v=${BUILD}`),'diagnosis client release queue');
  await requiredImport(asset(`portal-diagnosis-review-ux.js?v=${BUILD}`),'diagnosis review UX');
  await requiredImport(asset(`portal-diagnosis-report-editor.js?v=${BUILD}`),'audited founder diagnosis report editor');
  await requiredImport(asset(`portal-diagnosis-pdf-ui.js?v=${BUILD}`),'diagnosis PDF downloads');
  await requiredImport(asset(`portal-revenue-engine.js?v=${BUILD}`),'Revenue Engine');
  await requiredImport(asset(`portal-vnext-runtime-router.js?v=${BUILD}`),'existing PDF and notification routing');
  await requiredImport(asset(`portal-vnext-experience.js?v=${BUILD}`),'vNext diagnosis and client report experience');
  await requiredImport(asset(`portal-approval-inbox.js?v=${BUILD}`),'approval chains and Inbox');
  await requiredImport(asset(`portal-admin-journey.js?v=${BUILD}`),'Nepsis delivery workspace');
  if(!window.NexusAdminJourney?.navigate){const error=new Error('Nepsis delivery navigation did not initialize.');showCoreLoadFailure(error);throw error}
  perspectiveModule?.mountPerspectiveSwitcher?.(portal);
  await loadStyles(['portal-nepsis-visual-system.css']);
  clearBootLock();
}else{
  await requiredImport(asset(`portal-production-simplification.js?v=${BUILD}`),'production simplification');
  let roleShellReloading=false;
  portal.sb.auth.onAuthStateChange((_event,session)=>{
    if(!session?.user||roleShellReloading)return;
    roleShellReloading=true;
    location.reload();
  });
  clearBootLock();
}
