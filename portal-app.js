const asset=path=>`/${String(path||'').replace(/^\//,'')}`;
const BUILD='20260901-full-reconcile4';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const withTimeout=(promise,ms,label='operation')=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timed out after ${ms}ms`)),ms))]);

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
function showRuntimeWarning(message){const toast=document.getElementById('toast');if(!toast)return;toast.textContent=message;toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),7000)}
function showCoreLoadFailure(error){
  console.error('Nexus core portal failed to initialize.',error);
  window.__nexusPortalBooting=false;
  document.body.classList.remove('nexus-runtime-booting');
  if(document.body.classList.contains('nexus-shell-ready')){showRuntimeWarning('Nexus loaded, but one enhancement could not finish. The core workspace remains available.');return}
  const app=document.getElementById('portalApp');if(app)app.style.visibility='hidden';
  if(!document.head.contains(bootStyle))document.head.appendChild(bootStyle);
  if(!document.body.contains(bootOverlay))document.body.appendChild(bootOverlay);
  setBootMessage('Nexus could not finish loading.','Refresh this page. If the problem continues, sign out and sign back in.');
  const line=bootOverlay.querySelector('.nexus-boot-line');if(line)line.style.display='none';
}
async function importWithoutRecurringIntervals(url,blockedDelays=[]){const nativeSetInterval=window.setInterval;window.setInterval=(fn,delayValue,...args)=>blockedDelays.includes(Number(delayValue))?0:nativeSetInterval(fn,delayValue,...args);try{return await import(url)}finally{window.setInterval=nativeSetInterval}}
async function softImport(url,label=url,{timeout=6500,blockedDelays=[]}={}){try{return await withTimeout(importWithoutRecurringIntervals(url,blockedDelays),timeout,label)}catch(error){console.error(`Nexus enhancement failed: ${label}`,error);showRuntimeWarning(`${label} could not finish loading. Core workspace is still available.`);return null}}
async function waitFor(test,{timeout=5000,step=70}={}){const start=Date.now();while(Date.now()-start<timeout){try{if(test())return true}catch{}await delay(step)}return false}

await loadStyles(['portal-runtime-hardening.css']);

// Start the legacy/core portal runtime, but do not let its full workspace hydration
// become a hard gate for rendering the authenticated shell. NexusPortal is exposed
// before the legacy runtime performs its long-running identity/workspace hydration.
const coreImportPromise=importWithoutRecurringIntervals(asset(`portal-client.js?v=${BUILD}`),[180]);
let coreSettled=false;
coreImportPromise.then(()=>{coreSettled=true}).catch(error=>{coreSettled=true;console.error('Nexus core runtime import failed.',error)});
await waitFor(()=>!!window.NexusPortal,{timeout:4500,step:40});
const portal=window.NexusPortal;
if(!portal){showCoreLoadFailure(new Error('Nexus portal context is unavailable.'));throw new Error('Nexus portal context is unavailable.')}

// Bootstrap directly from the persisted Supabase session instead of waiting for
// all company/workspace queries. This is the critical anti-deadlock boundary.
let session=null;
try{const result=await withTimeout(portal.sb.auth.getSession(),2500,'session restore');if(result.error)throw result.error;session=result.data?.session||null}catch(error){console.warn('Nexus session restore was delayed.',error?.message||error)}
if(session?.user&&!portal.state.user)portal.stateController.patch({user:session.user},'boot:session');
const isSignedIn=!!session?.user;
let platformAdmin=false;
if(isSignedIn){
  try{const result=await withTimeout(portal.sb.rpc('nexus_is_platform_admin'),2500,'role resolution');if(result.error)throw result.error;platformAdmin=result.data===true;portal.stateController.patch({admin:platformAdmin},'boot:authorization')}
  catch(error){console.warn('Nexus role resolution was delayed; using current state.',error?.message||error);platformAdmin=!!portal.state.admin}

  // Prime only the minimum company context needed for navigation. Full workspace
  // data continues hydrating in portal-client.js and role-specific modules.
  if(!portal.state.companyId){
    try{
      let rows=[];
      if(platformAdmin){const result=await withTimeout(portal.sb.from('nexus_companies').select('*').order('created_at',{ascending:false}),2500,'admin company list');if(result.error)throw result.error;rows=result.data||[]}
      else{
        const memberResult=await withTimeout(portal.sb.from('nexus_company_members').select('company_id').eq('user_id',session.user.id).eq('active',true),2500,'company membership');if(memberResult.error)throw memberResult.error;
        const ids=(memberResult.data||[]).map(row=>row.company_id);
        if(ids.length){const companyResult=await withTimeout(portal.sb.from('nexus_companies').select('*').in('id',ids),2500,'client company list');if(companyResult.error)throw companyResult.error;rows=companyResult.data||[]}
      }
      if(rows.length)portal.stateController.patch({companies:rows,companyId:rows[0].id},'boot:company-context');
    }catch(error){console.warn('Nexus company context will hydrate in the background.',error?.message||error)}
  }
}

const bootUserId=session?.user?.id||null;
let perspectiveModule=null;
let authTransitionReloading=false;

function restoreBootOverlay(title,message){window.__nexusPortalBooting=true;document.body.classList.add('nexus-runtime-booting');if(!document.head.contains(bootStyle))document.head.appendChild(bootStyle);if(!document.body.contains(bootOverlay))document.body.appendChild(bootOverlay);setBootMessage(title,message)}
async function confirmStoredSession(expectedUserId){for(let attempt=0;attempt<12;attempt++){try{const result=await portal.sb.auth.getSession();if(result.error)throw result.error;if((result.data?.session?.user?.id||null)===expectedUserId)return true}catch(error){console.warn('Nexus session confirmation attempt failed.',error?.message||error)}await delay(100)}return false}
function installAuthTransitionReboot(){const auth=portal.sb?.auth;if(!auth?.onAuthStateChange)return;auth.onAuthStateChange((event,nextSession)=>{if(event!=='SIGNED_IN'&&event!=='SIGNED_OUT')return;const nextUserId=nextSession?.user?.id||null;if(authTransitionReloading||nextUserId===bootUserId)return;authTransitionReloading=true;if(nextUserId)restoreBootOverlay('Opening your Nexus workspace…','Sign-in confirmed. Securing your session before the workspace opens.');else restoreBootOverlay('Signing you out…','Closing the current workspace securely.');setTimeout(async()=>{if(nextUserId){const confirmed=await confirmStoredSession(nextUserId);if(!confirmed){authTransitionReloading=false;showCoreLoadFailure(new Error('Authenticated session was not retained after sign-in.'));return}}window.location.reload()},250)})}
installAuthTransitionReboot();

await softImport(asset(`portal-accessibility.js?v=${BUILD}`),'portal accessibility',{timeout:3500});
await softImport(asset(`portal-nexus-store.js?v=${BUILD}`),'unified NexusStore',{timeout:3500});

if(isSignedIn&&platformAdmin){
  await loadStyles(['perspective-switcher.css']);
  perspectiveModule=await softImport(asset(`portal-perspective-switcher.js?v=${BUILD}`),'perspective switcher',{timeout:3000});
  if(perspectiveModule?.preparePerspective){try{await withTimeout(Promise.resolve(perspectiveModule.preparePerspective(portal)),2000,'perspective preparation')}catch(error){console.warn('Nexus perspective preparation was delayed.',error?.message||error)}}
}

const useClientShell=isSignedIn&&(!platformAdmin||portal.state?.viewMode==='client');
const useAdminShell=isSignedIn&&platformAdmin&&!useClientShell;

// CRITICAL: once auth/role are known, reveal the core portal immediately. From
// this point forward, enhancements are progressive and may never blank the app.
clearBootLock();

async function hydrateClientShell(){
  await loadStyles(['portal-client-control-room.css']);
  await softImport(asset(`portal-client-core.js?v=${BUILD}`),'client state engine');
  await softImport(asset(`portal-client-upload-service.js?v=${BUILD}`),'client upload service');
  await softImport(asset(`portal-client-control-room.js?v=${BUILD}`),'frictionless client control room',{timeout:9000});
  await softImport(asset(`portal-health-check.js?v=${BUILD}`),'Nexus health check');
  if(platformAdmin)perspectiveModule?.mountPerspectiveSwitcher?.(portal);
}

async function hydrateAdminShell(){
  const adminStyles=['portal-layout-fix.css','portal-simplify.css','portal-admin-intake.css','portal-discovery-capture.css','portal-diagnosis-v2.css','portal-action-workflow.css','portal-action-execution-v2.css','portal-guided-ops.css','portal-admin-journey.css','portal-journey-qaqc.css','portal-revenue-engine.css','portal-approval-inbox.css','portal-workflow-cohesion.css','portal-client-guide.css','portal-ux-refinement.css','portal-mobile-hardening.css','portal-buildingblok-cohesion.css','portal-admin-command-center.css'];
  await loadStyles(adminStyles);
  await softImport(asset(`portal-foundation-hardening.js?v=${BUILD}`),'workspace foundation hardening');
  await softImport(asset(`portal-active-engagement-cohesion.js?v=${BUILD}`),'active engagement cohesion');
  await softImport(asset(`portal-approval-bridge.js?v=${BUILD}`),'approval routing bridge');
  if(portal.state?.companyId){
    const opsModule=await softImport(asset(`portal-ops.js?v=${BUILD}`),'operations workspace');
    if(opsModule?.initOps){window.__nexusOpsInit=false;const opsClient=window.NexusFoundationHardening?.opsClient||portal.sb;try{await withTimeout(Promise.resolve(opsModule.initOps({sb:opsClient,state:portal.state,$:portal.$,toast:portal.toast,workspace:portal.workspace,log:portal.log})),7000,'operations workspace initialization')}catch(error){console.error('Nexus operations workspace initialization failed.',error);showRuntimeWarning('Operations workspace is still loading. Other admin tools remain available.')}}
  }
  const NativeMutationObserver=window.MutationObserver;
  window.MutationObserver=class NexusPortalNoopObserver{constructor(){}observe(){}disconnect(){}takeRecords(){return []}};
  try{await softImport(asset(`portal-admin-intake.js?v=${BUILD}`),'admin intake')}finally{window.MutationObserver=NativeMutationObserver}
  const modules=[
    ['portal-diagnosis-execution-ux.js','diagnosis execution UX'],
    ['portal-diagnosis-v2.js','diagnosis review runtime'],
    ['portal-diagnosis-approval-ux.js','diagnosis approval UX'],
    ['portal-diagnosis-manual-fallback.js','diagnosis manual fallback'],
    ['portal-diagnosis-recovery.js','diagnosis recovery'],
    ['portal-action-workflow.js','action workflow',[1200]],
    ['portal-action-execution-v2.js','action execution'],
    ['portal-action-execution-v2-forms.js','action execution forms'],
    ['portal-guided-ops.js','guided operations'],
    ['portal-admin-journey.js','admin Client Journey'],
    ['portal-admin-journey-router.js','Client Journey router'],
    ['portal-diagnosis-controller-v2.js','diagnosis controller'],
    ['portal-diagnosis-release-queue.js','diagnosis client release queue'],
    ['portal-diagnosis-review-ux.js','diagnosis review UX'],
    ['portal-journey-task-guard.js','journey task guard'],
    ['portal-revenue-engine.js','Revenue Engine'],
    ['portal-vnext-runtime-router.js','vNext delivery runtime router'],
    ['portal-vnext-experience.js','vNext diagnosis and client report experience'],
    ['portal-approval-inbox.js','approval chains and Inbox'],
    ['portal-workflow-cohesion.js','workflow cohesion'],
    ['portal-buildingblok-cohesion.js','Companies, Inbox and mobile operating model'],
    ['portal-ux-refinement.js','front-end UX refinement'],
    ['portal-admin-command-center.js','admin master view and ROI engine'],
    ['portal-health-check.js','Nexus health check']
  ];
  for(const [file,label,blockedDelays=[]] of modules)await softImport(asset(`${file}?v=${BUILD}`),label,{blockedDelays});
  try{await window.NexusDiagnosisController?.refreshJourneyLabels?.({force:true});window.NexusDiagnosisController?.normalizeIntake?.()}catch(error){console.warn('Final diagnosis label normalization skipped.',error?.message||error)}
  perspectiveModule?.mountPerspectiveSwitcher?.(portal);
}

if(useClientShell)void hydrateClientShell().catch(error=>{console.error('Nexus client enhancement hydration failed.',error);showRuntimeWarning('Client workspace loaded with reduced enhancements. Refresh to retry.')});
else if(useAdminShell)void hydrateAdminShell().catch(error=>{console.error('Nexus admin enhancement hydration failed.',error);showRuntimeWarning('Admin workspace loaded with reduced enhancements. Refresh to retry.')});

// Keep observing the legacy/core hydration in the background for diagnostics only.
void coreImportPromise.catch(error=>{console.error('Background Nexus core hydration failed.',error);showRuntimeWarning('Some workspace data could not refresh. Core navigation remains available.')});
