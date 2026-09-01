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
 ['Discovery & Diagnosis','Discovery & Diagnosis'],
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
  const main=document.querySelector('.main');if(!main||document.getElementById('nexusContextBar'))return;
  const bar=document.createElement('div');bar.id='nexusContextBar';bar.className='nexus-context-bar';bar.setAttribute('aria-label','Workspace context');
  main.prepend(bar);renderContextBar();
}
function renderContextBar(){
  const bar=document.getElementById('nexusContextBar');if(!bar)return;
  const next=nextButton();
  bar.innerHTML=`<div class="nexus-context-copy"><span>Client</span><b>${escapeHtml(companyName())}</b><i class="nexus-context-sep" aria-hidden="true"></i><span>View</span><b>${escapeHtml(currentViewLabel())}</b></div>${next?`<button id="nexusContextNext" class="btn secondary" type="button">${escapeHtml(next.label)}</button>`:''}`;
  document.getElementById('nexusContextNext')?.addEventListener('click',next.click);
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function simplifyAdminTools(){
  if(!state.admin||document.body.classList.contains('portal-client-mode'))return;
  const drawer=document.querySelector('.admin-tool-drawer');if(!drawer)return;
  const active=drawer.querySelector('button.active');if(active)drawer.open=true;
  const summary=drawer.querySelector('summary');if(summary)summary.textContent='More tools';
  const note=document.querySelector('.admin-journey-only-note');if(note)note.textContent='Use Client Journey for the normal workflow. Open a supporting tool only when the current step sends you there.';
}
function improveLabels(){
  replaceControlText();
  const role=document.getElementById('roleLabel');
  if(role&&state.admin&&!document.body.classList.contains('portal-client-mode'))role.textContent='Nexus admin';
  document.querySelectorAll('.empty').forEach(el=>{
    if(el.textContent.trim()==='No open actions.')el.textContent='Nothing needs action right now.';
    if(el.textContent.trim()==='No notifications yet.')el.textContent='No new updates.';
    if(el.textContent.trim()==='No files have been shared yet.')el.textContent='No files have been added yet.';
  });
}
function bindCompanyChanges(){
  document.getElementById('companySelect')?.addEventListener('change',()=>setTimeout(()=>{renderContextBar();improveLabels()},80));
}

ensureContextBar();
improveLabels();simplifyAdminTools();bindCompanyChanges();

let scheduled=false;
const observer=new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;ensureContextBar();renderContextBar();improveLabels();simplifyAdminTools()});
});
observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

window.NexusUXRefinement={refresh(){renderContextBar();improveLabels();simplifyAdminTools()}};
