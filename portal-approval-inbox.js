const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,$,toast}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=v=>v?new Date(v).toLocaleString():'—';
let items=[],activeFilter='action',selectedChain=null,loading=false,renderQueued=false;

function inboxSection(){return $('section-notifications')}
function navButton(){return document.querySelector('.side-nav button[data-section="notifications"]')}
function activate(){
  document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b===navButton()));
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s===inboxSection()));
  window.scrollTo({top:0,behavior:'smooth'});loadInbox(true);
}
function ensureShell(){
  const section=inboxSection(),nav=navButton();if(!section||!nav)return false;
  nav.textContent='Inbox';nav.setAttribute('aria-label','Inbox');
  const eyebrow=section.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='Approval & action routing';
  const h1=section.querySelector('h1');if(h1)h1.textContent='Inbox';
  const copy=section.querySelector('p.small');if(copy)copy.textContent='One queue for approvals, submitted work, evidence requests, questions, exceptions, and updates that need attention.';
  const old=$('notificationList');if(old&&!$('nexusInboxRoot')){
    old.id='nexusInboxRoot';old.className='nexus-inbox-root';old.innerHTML='<div class="empty">Loading Inbox…</div>';
  }
  const root=$('nexusInboxRoot');if(!root)return false;
  if(!section.querySelector('.nexus-inbox-controls')){
    const controls=document.createElement('div');controls.className='nexus-inbox-controls';controls.innerHTML=`<div class="nexus-inbox-filters" role="tablist" aria-label="Inbox filters"><button class="active" data-inbox-filter="action" type="button">Needs action <span data-count="action">0</span></button><button data-inbox-filter="approval" type="button">Approvals <span data-count="approval">0</span></button><button data-inbox-filter="update" type="button">Updates <span data-count="update">0</span></button><button data-inbox-filter="all" type="button">All <span data-count="all">0</span></button></div>${state.admin?'<button class="btn primary" id="newApprovalChainBtn" type="button">+ New approval</button>':''}`;
    root.before(controls);
    controls.querySelectorAll('[data-inbox-filter]').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.inboxFilter;controls.querySelectorAll('[data-inbox-filter]').forEach(x=>x.classList.toggle('active',x===b));render()});
    controls.querySelector('#newApprovalChainBtn')?.addEventListener('click',openNewApproval);
  }
  $('readAllBtn')?.replaceChildren(document.createTextNode('Mark updates read'));
  if($('readAllBtn')&&!$('readAllBtn').dataset.inboxBound){$('readAllBtn').dataset.inboxBound='1';$('readAllBtn').addEventListener('click',()=>setTimeout(()=>loadInbox(true),250))}
  ensureDialogs();return true;
}

function actionable(x){return x.kind==='approval'?x.can_approve||x.status==='changes_requested':x.kind!=='update'}
function filtered(){
  if(activeFilter==='approval')return items.filter(x=>x.kind==='approval');
  if(activeFilter==='update')return items.filter(x=>x.kind==='update');
  if(activeFilter==='action')return items.filter(actionable);
  return items;
}
function kindLabel(k){return ({approval:'Approval',task:'Action item',document_request:'Evidence request',question:'Client question',founder_decision:'Founder decision',update:'Update'})[k]||k.replaceAll('_',' ')}
function priorityClass(x){if(x.priority==='high'||(x.due_at&&new Date(x.due_at)<new Date()))return 'high';return ''}
function card(x){
  const step=x.kind==='approval'&&x.step_order?`<span class="nexus-inbox-step">Step ${x.step_order} of ${x.step_count||'?'}</span>`:'';
  const due=x.due_at?`<span>${new Date(x.due_at)<new Date()?'Overdue · ':'Due '}${esc(dt(x.due_at))}</span>`:'';
  const company=x.company_name?`<span>${esc(x.company_name)}</span>`:'';
  const decision=x.kind==='approval'&&x.can_approve?`<div class="nexus-inbox-actions"><button class="btn primary" data-approval-open="${esc(x.approval_chain_id)}" type="button">Review & decide →</button></div>`:`<div class="nexus-inbox-actions"><button class="btn secondary" data-inbox-open="${esc(x.item_key)}" type="button">Open →</button></div>`;
  return `<article class="nexus-inbox-card ${priorityClass(x)} ${x.is_unread?'unread':''}" data-inbox-key="${esc(x.item_key)}"><div class="nexus-inbox-card-top"><div><span class="pill">${esc(kindLabel(x.kind))}</span>${step}</div><span class="pill">${esc(String(x.status||'open').replaceAll('_',' '))}</span></div><h3>${esc(x.title)}</h3>${x.message?`<p>${esc(x.message)}</p>`:''}<div class="nexus-inbox-meta">${company}${due}<span>${esc(dt(x.created_at))}</span></div>${decision}</article>`;
}
function render(){
  const root=$('nexusInboxRoot');if(!root)return;
  const list=filtered();root.innerHTML=list.map(card).join('')||'<div class="empty">Nothing in this view. Nexus will surface the next approval or action here when it needs attention.</div>';
  const counts={all:items.length,approval:items.filter(x=>x.kind==='approval').length,update:items.filter(x=>x.kind==='update').length,action:items.filter(actionable).length};
  document.querySelectorAll('[data-count]').forEach(x=>x.textContent=counts[x.dataset.count]??0);
  navButton()?.classList.toggle('has-inbox',counts.action>0);
  root.querySelectorAll('[data-approval-open]').forEach(b=>b.onclick=()=>openChain(b.dataset.approvalOpen));
  root.querySelectorAll('[data-inbox-open]').forEach(b=>b.onclick=()=>openItem(items.find(x=>x.item_key===b.dataset.inboxOpen)));
}
async function loadInbox(force=false){
  if(loading||!state.user)return;if(!ensureShell())return;loading=true;
  try{
    const params={p_company_id:state.admin?null:state.companyId};const {data,error}=await sb.rpc('nexus_get_inbox',params);if(error)throw error;items=data||[];render();
    const paramsUrl=new URLSearchParams(location.search);if(paramsUrl.get('view')==='inbox'&&paramsUrl.get('approval_chain')){const id=paramsUrl.get('approval_chain');paramsUrl.delete('approval_chain');history.replaceState(null,'',`${location.pathname}?${paramsUrl.toString()}`.replace(/\?$/,''));setTimeout(()=>openChain(id),60)}
  }catch(error){console.error('Nexus Inbox failed',error);const root=$('nexusInboxRoot');if(root)root.innerHTML=`<div class="note"><b>Inbox could not load.</b><br>${esc(error.message||'Refresh and try again.')}</div>`}
  finally{loading=false}
}

function openItem(x){
  if(!x)return;
  if(x.kind==='approval'&&x.approval_chain_id)return openChain(x.approval_chain_id);
  if(x.kind==='task'){document.querySelector('.side-nav button[data-section="tasks"]')?.click();setTimeout(()=>document.querySelector(`[data-task-id="${CSS.escape(x.related_id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),220);return}
  if(x.kind==='document_request'){document.querySelector('.side-nav button[data-section="documents"]')?.click();setTimeout(()=>$('explicitDocumentRequests')?.scrollIntoView({behavior:'smooth',block:'start'}),220);return}
  if(x.kind==='founder_decision'){document.querySelector('.side-nav button[data-section="revenue-engine"]')?.click();return}
  if(x.action_url){const u=new URL(x.action_url,location.origin);if(u.searchParams.get('view')==='inbox')return activate();location.href=u.pathname+u.search;}
}

function ensureDialogs(){
  if(!$('approvalDecisionModal')){const el=document.createElement('div');el.id='approvalDecisionModal';el.className='modal';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.innerHTML='<div class="modal-card nexus-approval-dialog"><div class="toolbar"><div><div class="kicker">Approval chain</div><h2 id="approvalDecisionTitle" style="margin:4px 0">Review approval</h2></div><button class="btn secondary" data-close-approval type="button">Close</button></div><div id="approvalDecisionBody"></div></div>';document.body.appendChild(el);el.querySelector('[data-close-approval]').onclick=()=>el.classList.remove('show');el.onclick=e=>{if(e.target===el)el.classList.remove('show')}}
  if(!$('newApprovalChainModal')&&state.admin){const el=document.createElement('div');el.id='newApprovalChainModal';el.className='modal';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.innerHTML=`<div class="modal-card nexus-approval-dialog"><div class="toolbar"><div><div class="kicker">Controlled decision</div><h2 style="margin:4px 0">New approval chain</h2></div><button class="btn secondary" data-close-new-approval type="button">Close</button></div><div class="field"><label for="approvalChainTitle">Approval title</label><input id="approvalChainTitle" maxlength="300" placeholder="e.g. Approve pilot scope"></div><div class="field"><label for="approvalChainDescription">What is being approved?</label><textarea id="approvalChainDescription" placeholder="State the decision, consequence, and what the approvers should verify."></textarea></div><div class="field"><label for="approvalChainPreset">Approval sequence</label><select id="approvalChainPreset"><option value="nexus">Nexus owner review</option><option value="client">Client owner decision</option><option value="nexus_client">Nexus review → Client owner</option><option value="client_nexus">Client owner → Nexus final review</option></select></div><div class="field"><label for="approvalChainDue">Due date/time <span class="small">(optional)</span></label><input id="approvalChainDue" type="datetime-local"></div><div class="actions"><button id="createApprovalChainBtn" class="btn primary" type="button">Create & submit →</button></div></div>`;document.body.appendChild(el);el.querySelector('[data-close-new-approval]').onclick=()=>el.classList.remove('show');el.onclick=e=>{if(e.target===el)el.classList.remove('show')};$('createApprovalChainBtn').onclick=createApproval}
}
function openNewApproval(){ensureDialogs();$('approvalChainTitle').value='';$('approvalChainDescription').value='';$('approvalChainPreset').value='nexus_client';$('approvalChainDue').value='';$('newApprovalChainModal').classList.add('show');$('approvalChainTitle').focus()}
function stepsForPreset(p){
  const nexus={step_name:'Nexus review',approver_scope:'platform_admin',instructions:'Verify scope, evidence, risk, and downstream consequence.'};
  const client={step_name:'Client owner decision',approver_scope:'company_role',approver_role:'owner',instructions:'Confirm the client accepts the decision and its stated consequences.'};
  if(p==='nexus')return[nexus];if(p==='client')return[client];if(p==='client_nexus')return[client,{...nexus,step_name:'Nexus final review'}];return[nexus,client];
}
async function createApproval(){
  const title=$('approvalChainTitle').value.trim(),description=$('approvalChainDescription').value.trim(),preset=$('approvalChainPreset').value,due=$('approvalChainDue').value;
  if(!title)return toast?.('Add an approval title.');if(preset.includes('client')&&!state.companyId)return toast?.('Select a client company first.');
  const button=$('createApprovalChainBtn');button.disabled=true;button.textContent='Creating…';
  try{const {data,error}=await sb.rpc('nexus_create_approval_chain',{p_company_id:state.companyId||null,p_project_id:window.NexusFoundationHardening?.activeProject?.()?.id||state.projects?.[0]?.id||null,p_title:title,p_description:description||null,p_approval_type:'ad_hoc_decision',p_entity_type:null,p_entity_id:null,p_visibility:preset.includes('client')?'company':'internal',p_steps:stepsForPreset(preset),p_due_at:due?new Date(due).toISOString():null,p_metadata:{source:'inbox'},p_start:true});if(error)throw error;$('newApprovalChainModal').classList.remove('show');toast?.('Approval chain submitted.');await loadInbox(true);setTimeout(()=>openChain(data),60)}catch(error){toast?.(error.message||'Approval chain could not be created.')}finally{button.disabled=false;button.textContent='Create & submit →'}
}

async function openChain(id){
  selectedChain=id;ensureDialogs();const modal=$('approvalDecisionModal'),body=$('approvalDecisionBody');modal.classList.add('show');body.innerHTML='<div class="empty">Loading approval history…</div>';
  try{
    const [cr,sr,er]=await Promise.all([sb.from('nexus_approval_chains').select('*').eq('id',id).single(),sb.from('nexus_approval_chain_steps').select('*').eq('chain_id',id).order('step_order'),sb.from('nexus_approval_events').select('*').eq('chain_id',id).order('created_at')]);
    if(cr.error)throw cr.error;if(sr.error)throw sr.error;if(er.error)throw er.error;const c=cr.data,steps=sr.data||[],events=er.data||[],inbox=items.find(x=>x.approval_chain_id===id),pending=steps.find(x=>x.status==='pending'),can=!!inbox?.can_approve&&pending?.id===inbox.approval_step_id;
    $('approvalDecisionTitle').textContent=c.title;
    body.innerHTML=`<div class="nexus-approval-summary"><span class="pill">${esc(c.approval_type.replaceAll('_',' '))}</span><span class="pill">${esc(c.status.replaceAll('_',' '))}</span>${c.description?`<p>${esc(c.description)}</p>`:''}</div><div class="nexus-approval-route">${steps.map(s=>`<div class="approval-route-step ${esc(s.status)}"><div class="approval-route-number">${s.step_order}</div><div><b>${esc(s.step_name)}</b><span>${esc(s.status.replaceAll('_',' '))}${s.approver_role?` · ${esc(s.approver_role)}`:''}${s.due_at?` · ${esc(dt(s.due_at))}`:''}</span>${s.decision_note?`<p>${esc(s.decision_note)}</p>`:''}</div></div>`).join('')}</div>${can?`<div class="nexus-approval-decision"><label for="approvalDecisionNote">Decision note <span class="small">(required for changes/rejection)</span></label><textarea id="approvalDecisionNote" placeholder="Record the basis for the decision or the exact changes required."></textarea><div class="actions"><button class="btn primary" data-chain-decision="approved" data-step="${pending.id}" type="button">Approve</button><button class="btn secondary" data-chain-decision="changes_requested" data-step="${pending.id}" type="button">Request changes</button><button class="btn secondary danger" data-chain-decision="rejected" data-step="${pending.id}" type="button">Reject</button></div></div>`:''}${c.status==='changes_requested'&&(state.admin||c.requested_by===state.user.id)?`<div class="nexus-approval-decision"><label for="approvalResubmitNote">Resubmission note</label><textarea id="approvalResubmitNote" placeholder="Summarize what changed before resubmitting."></textarea><button class="btn primary" id="resubmitApprovalChain" type="button">Resubmit to current reviewer →</button></div>`:''}<details class="nexus-approval-history"><summary>Decision history · ${events.length} event${events.length===1?'':'s'}</summary>${events.map(e=>`<div><b>${esc(e.event_type.replaceAll('_',' '))}</b><span>${esc(dt(e.created_at))}</span>${e.note?`<p>${esc(e.note)}</p>`:''}</div>`).join('')||'<div class="small">No history yet.</div>'}</details>`;
    body.querySelectorAll('[data-chain-decision]').forEach(b=>b.onclick=()=>decide(b.dataset.step,b.dataset.chainDecision));body.querySelector('#resubmitApprovalChain')?.addEventListener('click',resubmit);
  }catch(error){body.innerHTML=`<div class="note"><b>Approval could not load.</b><br>${esc(error.message||'Refresh and try again.')}</div>`}
}
async function decide(step,decision){
  const note=$('approvalDecisionNote')?.value.trim()||'';if(['changes_requested','rejected'].includes(decision)&&!note)return toast?.('Add a decision note so the next person knows exactly what needs to change.');
  const buttons=$('approvalDecisionBody')?.querySelectorAll('[data-chain-decision]')||[];buttons.forEach(b=>b.disabled=true);
  try{const {error}=await sb.rpc('nexus_decide_approval_step',{p_step_id:step,p_decision:decision,p_note:note||null});if(error)throw error;toast?.(decision==='approved'?'Approval recorded. The chain advanced automatically.':decision==='changes_requested'?'Changes requested. The requester has been notified.':'Approval rejected.');await loadInbox(true);await openChain(selectedChain);window.dispatchEvent(new CustomEvent('nexus:approval-changed'))}catch(error){toast?.(error.message||'Decision could not be recorded.')}finally{buttons.forEach(b=>b.disabled=false)}
}
async function resubmit(){const note=$('approvalResubmitNote')?.value.trim()||'';try{const {error}=await sb.rpc('nexus_resubmit_approval_chain',{p_chain_id:selectedChain,p_note:note||null});if(error)throw error;toast?.('Approval resubmitted.');await loadInbox(true);await openChain(selectedChain);window.dispatchEvent(new CustomEvent('nexus:approval-changed'))}catch(error){toast?.(error.message||'Approval could not be resubmitted.')}}

function schedule(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;ensureShell();loadInbox()})}
document.addEventListener('click',e=>{if(e.target.closest?.('.side-nav button[data-section="notifications"]'))setTimeout(()=>loadInbox(true),80)},true);
$('companySelect')?.addEventListener('change',()=>setTimeout(()=>loadInbox(true),250));
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(()=>loadInbox(true),160));
window.addEventListener('nexus:approval-changed',()=>setTimeout(()=>loadInbox(true),120));
const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
setTimeout(()=>{ensureShell();loadInbox(true);const p=new URLSearchParams(location.search);if(p.get('view')==='inbox'){activate();if(p.get('approval_chain'))setTimeout(()=>openChain(p.get('approval_chain')),320)}},180);

window.NexusApprovalInbox={activate,loadInbox,openChain};
