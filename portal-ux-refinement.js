const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');
const {state}=portal;

document.body.classList.add('nexus-ux-refined');

// Keep backend concepts in the backend. This layer translates product controls and
// explanatory UI into short business language without changing workflow semantics.
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
 ['Open Discovery Intake →','Open diagnosis →'],
 ['Continue Discovery Intake','Continue diagnosis'],
 ['Open Discovery & Diagnosis','Open diagnosis'],
 ['Discovery & Diagnosis','Diagnosis'],
 ['View Diagnosis Status','View diagnosis status'],
 ['Mark Engagement Complete','Complete engagement'],
 ['Capture Discovery Context','Save call notes'],
 ['Analyze Missing Information','Check what’s missing'],
 ['Analyze Missing Information Again','Check again'],
 ['Queue Diagnosis','Run diagnosis'],
 ['Select this resolution','Select'],
 ['Remove selection','Undo'],
 ['Defer','Decide later'],
 ['Do not proceed','Skip'],
 ['Open Client Journey →','Continue →'],
 ['Review Recommended Actions →','Review options →'],
 ['Review suggested solutions →','Review options →'],
 ['Required evidence','What to provide'],
 ['Evidence attached','Files attached'],
 ['Audit trail','History'],
 ['Waiting on prerequisite','Waiting on earlier step'],
 ['Prerequisite complete','Earlier step complete']
]);

const PLAIN_PHRASES=[
 ['Use Client Journey for the normal workflow. Open a supporting tool only when the current step sends you there.','Use Home for the normal workflow. Open Records & Tools only when you need more detail.'],
 ['Review the resolutions Relystra recommends from the approved diagnosis. Approve, reject, or defer each one. Only the final confirmed plan becomes work.','Review the solutions Relystra recommends. Choose what should move forward. Only what you confirm becomes work.'],
 ['Relystra translated the approved diagnosis into proposed resolutions. Decide which ones belong in the plan, then approve Confirm Plan.','Relystra turned the diagnosis into recommended solutions. Choose what should move forward, then confirm the plan.'],
 ['Choose Solutions & Confirm Plan','Choose Solutions'],
 ['Choose the solutions to execute','Choose what to move forward with'],
 ['Where are the other tools?','Need more detail?'],
 ['Relystra keeps files, workflows, approvals, systems, and audit history behind this journey. Open Records & Tools only when you need to inspect them.','Files, decisions, systems, and history stay under Records & Tools. Use them only when you need more detail.'],
 ['Human send approval is on','You approve every send'],
 ['Relystra prepares outreach. Nothing external is sent from this console without approval.','Relystra prepares outreach. Nothing is sent until you approve it.'],
 ['material information gaps','missing information'],
 ['material discovery gaps','missing information'],
 ['evidence-backed diagnosis','diagnosis'],
 ['bounded diagnosis','diagnosis'],
 ['recommended intervention','recommended first step'],
 ['optimization / closeout','final review'],
 ['optimization/closeout','final review'],
 ['unblocked action','next action'],
 ['baseline measurement','starting measurement'],
 ['decision record','decision'],
 ['documented resolution','resolved issue'],
 ['authorized evidence','transcript and files'],
 ['root record for downstream work','diagnosis that drives the next steps'],
 ['structured findings','findings'],
 ['gap analysis','check'],
 ['downstream action items','client actions'],
 ['governed action chains','planned work'],
 ['governed action plan','next-step plan'],
 ['commercial gate','scope and payment check'],
 ['resolution proposals','recommended solutions'],
 ['proposed resolutions','recommended solutions'],
 ['dependency-blocked actions','future steps waiting on an earlier action'],
 ['representative—not exhaustive—evidence','a few normal examples'],
 ['representative evidence','a few good examples'],
 ['prerequisite','earlier step'],
 ['Audit trail','History'],
 ['AI recommendations are proposals until you choose them.','Review the recommended solutions.'],
 ['Confirmed for commercial close','Plan confirmed'],
 ['Commercial gate active — no implementation is released yet.','Work starts only after scope and payment are confirmed.'],
 ['You remain the final approval gate.','You make the final decision.'],
 ['Saving diagnosis approval and preparing the recommended action plan…','Saving approval and preparing the next-step options…'],
 ['Diagnosis approved. Recommended actions are ready for your selection. No downstream action items have been released yet.','Diagnosis approved. Your recommended options are ready. Nothing has been assigned to the client yet.'],
 ['Use representative—not exhaustive—evidence.','Share a few normal examples.'],
 ['Redact unrelated sensitive data.','Remove private details we don’t need.'],
 ['No dependency-blocked actions.','No future steps are waiting.']
];

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function replaceControlText(root=document){
  root.querySelectorAll?.('button,a.btn,summary').forEach(el=>{
    const original=el.textContent.trim();
    let replacement=TEXT_REPLACEMENTS.get(original)||original;
    for(const [from,to] of PLAIN_PHRASES)replacement=replacement.split(from).join(to);
    if(replacement!==original)el.textContent=replacement;
  });
}
function replaceVisiblePhrases(root=document.body){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];let node;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(!parent||parent.closest('script,style,textarea,option,pre,code'))continue;
    nodes.push(node);
  }
  for(const textNode of nodes){
    let value=textNode.nodeValue||'';
    const original=value;
    for(const [from,to] of PLAIN_PHRASES)value=value.split(from).join(to);
    if(value!==original)textNode.nodeValue=value;
  }
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
  const noteText='Use Home for the normal workflow. Open Records & Tools only when you need more detail.';
  if(note&&note.textContent.trim()!==noteText)note.textContent=noteText;
}
function improveLabels(){
  replaceControlText();replaceVisiblePhrases();
  const role=document.getElementById('roleLabel');
  if(role&&state.admin&&!document.body.classList.contains('portal-client-mode')&&role.textContent.trim()!=='Relystra admin')role.textContent='Relystra admin';
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

const ACTION_PROCESSING_BUILD='20260905-action-processing-rebrand1';
if(state.admin&&!document.body.classList.contains('portal-client-mode')){
  if(!document.querySelector('link[data-nexus-action-processing]')){const link=document.createElement('link');link.rel='stylesheet';link.href=`/portal-action-processing-engine.css?v=${ACTION_PROCESSING_BUILD}`;link.dataset.nexusActionProcessing='1';document.head.appendChild(link)}
  import(`/portal-action-processing-engine.js?v=${ACTION_PROCESSING_BUILD}`).catch(error=>console.error('Relystra Action Item Processing Engine failed to load.',error));
}
