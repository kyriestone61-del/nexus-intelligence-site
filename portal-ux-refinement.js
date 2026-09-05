const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {state}=portal;

document.body.classList.add('nexus-ux-refined');

const TEXT_REPLACEMENTS=new Map([
 ['Browser alerts','Alerts'],
 ['Files & Information','Files'],
 ['Action Items','Actions'],
 ['Projects & Milestones','Projects'],
 ['Client Snapshot','Overview'],
 ['Continue my work →','Continue work →'],
 ['Continue My Work','Continue work'],
 ['See what client owes →','View client actions →'],
 ['View Client Work','View client actions'],
 ['Send Client Checklist (optional)','Send optional checklist'],
 ['Open Client Checklist','Open client checklist'],
 ['Open Discovery Intake →','Open discovery →'],
 ['Continue Discovery Intake','Continue discovery'],
 ['Open Discovery & Diagnosis','Open diagnosis'],
 ['View Diagnosis Status','View diagnosis status'],
 ['Mark Engagement Complete','Complete engagement']
]);

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function replaceControlText(root=document){
  root.querySelectorAll?.('button,a.btn,summary').forEach(el=>{
    const text=el.textContent.trim();
    const replacement=TEXT_REPLACEMENTS.get(text);
    if(replacement&&replacement!==text)el.textContent=replacement;
  });
}
function currentViewLabel(){
  if(document.body.classList.contains('portal-client-mode'))return 'Client view';
  if(document.body.classList.contains('portal-admin-mode'))return 'Admin';
  return state.admin?'Admin':'Client';
}
function companyName(){return state.companies?.find(c=>c.id===state.companyId)?.name||'No client selected'}
function nextButton(){
  if(document.body.classList.contains('portal-client-mode'))return {label:'Go to Home',click:()=>document.querySelector('.client-primary-nav button[data-client-page="home"],.client-primary-nav button')?.click()};
  if(state.admin)return {label:'Go to next step',click:()=>document.querySelector('.journey-primary')?.click()};
  return null;
}
function ensureContextBar(){
  const main=document.querySelector('.main');if(!main)return null;
  let bar=document.getElementById('nexusContextBar');
  if(!bar){bar=document.createElement('div');bar.id='nexusContextBar';bar.className='nexus-context-bar';bar.setAttribute('aria-label','Workspace context');main.prepend(bar)}
  return bar;
}
function renderContextBar(){
  const bar=ensureContextBar();if(!bar)return;
  const next=nextButton(),signature=`${state.companyId||''}|${companyName()}|${currentViewLabel()}|${next?.label||''}`;
  if(bar.dataset.signature===signature)return;
  bar.dataset.signature=signature;
  bar.innerHTML=`<div class="nexus-context-copy"><span>Client</span><b>${escapeHtml(companyName())}</b><i class="nexus-context-sep" aria-hidden="true"></i><span>View</span><b>${escapeHtml(currentViewLabel())}</b></div>${next?`<button id="nexusContextNext" class="btn secondary" type="button">${escapeHtml(next.label)}</button>`:''}`;
  document.getElementById('nexusContextNext')?.addEventListener('click',next.click);
}
function simplifyAdminTools(){
  if(!state.admin||document.body.classList.contains('portal-client-mode'))return;
  const drawer=document.querySelector('.admin-tool-drawer');if(!drawer)return;
  const active=drawer.querySelector('button.active');if(active&&!drawer.open)drawer.open=true;
  const summary=drawer.querySelector('summary');if(summary&&summary.textContent.trim()!=='More tools')summary.textContent='More tools';
  const note=document.querySelector('.admin-journey-only-note');
  const noteText='Use Client Journey for the normal workflow. Open a supporting tool only when the current step sends you there.';
  if(note&&note.textContent.trim()!==noteText)note.textContent=noteText;
}
function improveLabels(){
  replaceControlText();
  const role=document.getElementById('roleLabel');
  if(role&&state.admin&&!document.body.classList.contains('portal-client-mode')&&role.textContent.trim()!=='Nexus admin')role.textContent='Nexus admin';
  document.querySelectorAll('.empty').forEach(el=>{
    const text=el.textContent.trim();
    if(text==='No open actions.')el.textContent='Nothing needs action right now.';
    else if(text==='No notifications yet.')el.textContent='No new updates.';
    else if(text==='No files have been shared yet.')el.textContent='No files have been added yet.';
  });
}
function refresh(){renderContextBar();improveLabels();simplifyAdminTools()}
function bindCompanyChanges(){
  const select=document.getElementById('companySelect');if(!select||select.dataset.uxRefinementBound)return;
  select.dataset.uxRefinementBound='1';select.addEventListener('change',()=>setTimeout(refresh,80));
}

refresh();bindCompanyChanges();
let scheduled=false;
const observer=new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;refresh();bindCompanyChanges()});
});
observer.observe(document.body,{subtree:true,childList:true});
window.NexusUXRefinement={refresh};

const ACTION_PROCESSING_BUILD='20260905-action-processing3';
if(state.admin&&!document.body.classList.contains('portal-client-mode')){
  if(!document.querySelector('link[data-nexus-action-processing]')){const link=document.createElement('link');link.rel='stylesheet';link.href=`/portal-action-processing-engine.css?v=${ACTION_PROCESSING_BUILD}`;link.dataset.nexusActionProcessing='1';document.head.appendChild(link)}
  import(`/portal-action-processing-engine.js?v=${ACTION_PROCESSING_BUILD}`).catch(error=>console.error('Nexus Action Item Processing Engine failed to load.',error));
}
