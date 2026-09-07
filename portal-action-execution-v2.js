import {prebuildActionCard,bindPrebuildActions,openPrebuildActionCreator} from './portal-prebuild-actions.js';
const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');

const {sb,state,$,toast,workspace,log}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const completedStatus=s=>['completed','approved','done'].includes(String(s||'').toLowerCase());
const reviewStatus=s=>String(s||'').toLowerCase()==='ready_for_review';
const clientOwned=t=>t.assignee==='client'&&!completedStatus(t.status);
const nexusOwned=t=>t.assignee==='nexus'&&!completedStatus(t.status)&&!reviewStatus(t.status);
const fmtDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'No due date';
const phaseLabel=v=>({discovery:'Discovery',diagnosis:'Diagnosis',delivery:'Delivery',solution_design:'Solution Design',implementation:'Implementation',training:'Training',optimization:'Optimization',general:'General'}[v]||String(v||'General').replaceAll('_',' '));
const typeLabel=v=>({upload:'Upload',structured_form:'Questions',approval:'Approval',review:'Review',meeting:'Meeting',access:'Access',decision:'Decision',nexus_internal:'Relystra internal',preparation_checklist:'Checklist',workflow_evidence:'Evidence request',standard:'Task'}[v]||String(v||'Task').replaceAll('_',' '));
const statusLabel=v=>({open:'Not started',not_started:'Not started',waiting_on_client:'Waiting on client',in_progress:'In progress',blocked:'Blocked',ready_for_review:'Ready for review',needs_revision:'Changes requested',approved:'Completed',completed:'Completed',done:'Completed'}[String(v||'').toLowerCase()]||String(v||'Not started').replaceAll('_',' '));

let activeView='my_work';
let templates=[];
let packages=[];
let packageItems=[];
let comments=[];
let lastCompany=null;
let renderStamp='';

function dependency(task){return (state.tasks||[]).find(t=>t.id===task.dependency_task_id)||null}
function dependencyBlocked(task){const d=dependency(task);return !!d&&!completedStatus(d.status)}
function activeProjectId(){return window.NexusFoundationHardening?.activeProject?.()?.id||state.activeEngagement?.project_id||state.activeProjectId||null}
function isSimpleTask(task){return task?.workflow_metadata?.one_workflow===true||task?.workflow_metadata?.simple_flow===true}
function simpleFlowTasks(){
  const projectId=activeProjectId();
  let rows=(state.tasks||[]).filter(isSimpleTask);
  if(projectId&&rows.some(t=>String(t.project_id)===String(projectId)))rows=rows.filter(t=>String(t.project_id)===String(projectId));
  return rows.sort((a,b)=>(Number(a.sort_order||100)-Number(b.sort_order||100))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
}
function prebuildMode(){return window.__relystraDeliveryLifecycle===true||(state.tasks||[]).some(t=>t.work_kind==='prebuild_action')}
function actionTasks(){return (state.tasks||[]).filter(t=>prebuildMode()?t.work_kind==='prebuild_action':t.work_kind!=='build_task')}
function activeActions(){return actionTasks().filter(t=>t.work_kind!=='prebuild_action'||t.action_review_state==='approved')}
function simpleFlowMode(){return !prebuildMode()&&simpleFlowTasks().length>0}
function simpleDeliveryMode(){return simpleFlowTasks().some(t=>t.workflow_metadata?.one_workflow===true||t.workflow_metadata?.delivery_step)}
function simpleStepIndex(task){return Math.max(0,simpleFlowTasks().findIndex(t=>t.id===task.id))}
function taskCounts(){const tasks=activeActions();return {my:tasks.filter(nexusOwned).length,client:tasks.filter(clientOwned).length,review:tasks.filter(t=>reviewStatus(t.status)).length,completed:tasks.filter(t=>completedStatus(t.status)).length}}
function clientCounts(){const tasks=activeActions();return {attention:tasks.filter(t=>clientOwned(t)&&!reviewStatus(t.status)).length,submitted:tasks.filter(t=>reviewStatus(t.status)).length,completed:tasks.filter(t=>completedStatus(t.status)).length}}

function ensureSimpleStyles(){
  if(document.getElementById('relystraSimpleWorkflowStyles'))return;
  const style=document.createElement('style');style.id='relystraSimpleWorkflowStyles';style.textContent=`
    #section-tasks.simple-workflow-mode .note{display:none!important}
    #section-tasks.simple-workflow-mode #assignTemplateBtn,#section-tasks.simple-workflow-mode #newTaskBtn{display:none!important}
    #section-tasks.simple-workflow-mode #actionExecutionFilters{display:none!important}
    #section-tasks.simple-workflow-mode .action-execution-top{display:block}
    .simple-flow-progress{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:18px 20px;border:1px solid rgba(217,255,114,.22);border-radius:14px;background:rgba(217,255,114,.035)}
    .simple-flow-progress b{display:block;font-size:18px}.simple-flow-progress span{display:block;margin-top:4px;color:var(--muted,#aaa4ba);font-size:12px}.simple-flow-progress strong{font-size:28px;white-space:nowrap}
    .simple-workflow-card{position:relative;padding-left:76px!important}
    .simple-workflow-number{position:absolute;left:20px;top:22px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(217,255,114,.28);background:rgba(217,255,114,.07);font-weight:900;color:#d9ff72}
    .simple-workflow-card.completed .simple-workflow-number{color:#9bdcb4;border-color:rgba(155,220,180,.28);background:rgba(155,220,180,.06)}
    .simple-workflow-kicker{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:5px;color:var(--muted,#aaa4ba);font-size:11px;font-weight:750}
    .simple-workflow-kicker .status-chip{font-size:10px}
    .simple-workflow-card .action-v2-head{align-items:flex-start}.simple-workflow-card .action-v2-title h3{font-size:21px;margin-top:2px}.simple-workflow-card .action-v2-title>p{max-width:760px}
    .simple-workflow-card .dependency-note{margin-top:12px}.simple-workflow-card .action-v2-actions{margin-top:14px}
    .simple-workflow-card .action-engine-admin-definition,.simple-workflow-card .action-engine-admin-actions{display:none!important}
    @media(max-width:680px){.simple-flow-progress{display:block}.simple-flow-progress strong{display:block;margin-top:12px}.simple-workflow-card{padding-left:18px!important;padding-top:74px!important}.simple-workflow-number{top:18px;left:18px}}
  `;document.head.appendChild(style);
}

function ensureShell(){
  const section=$('section-tasks'),list=$('taskList');if(!section||!list)return;
  ensureSimpleStyles();const simple=simpleFlowMode();section.classList.toggle('simple-workflow-mode',simple);
  const toolbar=section.querySelector('.toolbar');
  if(toolbar){
    const h=toolbar.querySelector('h1');
    const p=toolbar.querySelector('p.small');
    if(simple){if(h)h.textContent=simpleDeliveryMode()?'Delivery Workflow':'Diagnosis Setup';if(p)p.textContent=simpleDeliveryMode()?'One plan from the diagnosis. Finish these steps in order.':'Complete these two steps in order, then Relystra can run the diagnosis.'}
    else{if(h)h.textContent=state.admin?'Action Items':'Your Action Items';if(p)p.textContent=state.admin?'Gather and accept the evidence needed to scope Builds. Review suggested Actions before assigning work.':'See exactly what Relystra needs from you, submit it for review, and track what has been approved.'}
  }
  let top=$('actionExecutionTop');if(!top){top=document.createElement('div');top.id='actionExecutionTop';top.className='action-execution-top';const note=section.querySelector('.note');(note||list).before(top)}
  let filters=$('actionExecutionFilters');if(!filters){filters=document.createElement('div');filters.id='actionExecutionFilters';filters.className='action-view-tabs';list.before(filters)}
  filters.hidden=simple;
  if(state.admin){
    let btn=$('assignTemplateBtn');if(btn){btn.textContent='+ Assign work';btn.className='btn primary';btn.onclick=openAssignModal}else{btn=document.createElement('button');btn.id='assignTemplateBtn';btn.className='btn primary';btn.textContent='+ Assign work';btn.onclick=openAssignModal;toolbar?.appendChild(btn)}
    btn.hidden=simple;
  }
  const newBtn=$('newTaskBtn');if(newBtn){newBtn.classList.toggle('secondary-action-button',state.admin);newBtn.hidden=simple||prebuildMode()}
  if(prebuildMode()&&state.admin){const btn=$('assignTemplateBtn');if(btn){btn.hidden=false;btn.textContent='+ Add pre-build Action';btn.onclick=()=>openPrebuildActionCreator(portal,()=>renderAll(true))}}
}

function renderTop(){
  const root=$('actionExecutionTop');if(!root)return;
  if(simpleFlowMode()){
    const tasks=simpleFlowTasks(),done=tasks.filter(t=>completedStatus(t.status)).length,current=tasks.find(t=>!completedStatus(t.status));
    root.innerHTML=`<div class="simple-flow-progress"><div><b>${esc(simpleDeliveryMode()?'One diagnosis-led workflow':'Two-step diagnosis setup')}</b><span>${current?`Current step: ${esc(current.title)}`:'All steps are complete.'}</span></div><strong>${done}/${tasks.length}</strong></div>`;
    return;
  }
  if(state.admin){const c=taskCounts();root.innerHTML=`<button data-jump="ready_review"><b>${c.review}</b><span>Ready for review</span></button><button data-jump="client_work"><b>${c.client}</b><span>Waiting on clients</span></button><button data-jump="my_work"><b>${c.my}</b><span>Relystra work</span></button><button data-jump="completed"><b>${c.completed}</b><span>Completed</span></button>`}
  else{const c=clientCounts();root.innerHTML=`<div><b>${c.attention}</b><span>Needs your attention</span></div><div><b>${c.submitted}</b><span>With Relystra</span></div><div><b>${c.completed}</b><span>Completed</span></div>`}
  root.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{activeView=b.dataset.jump;renderAll(true)});
}

function renderTabs(){
  const root=$('actionExecutionFilters');if(!root)return;
  if(simpleFlowMode()){root.hidden=true;root.innerHTML='';activeView='workflow';return}
  root.hidden=false;
  const defs=state.admin?[...(prebuildMode()?[['suggested','Suggested Actions']]:[]),['my_work','My Work'],['client_work','Client Work'],['ready_review','Ready for Review'],['completed','Completed'],...(prebuildMode()?[['history','Historical work']]:[])]:[['client_work','Needs Your Attention'],['ready_review','Submitted'],['completed','Completed']];
  if(!defs.some(x=>x[0]===activeView))activeView=state.admin?'my_work':'client_work';
  root.innerHTML=defs.map(([key,label])=>`<button type="button" data-view="${key}" class="${activeView===key?'active':''}">${label}</button>`).join('');
  root.querySelectorAll('button').forEach(b=>b.onclick=()=>{activeView=b.dataset.view;renderAll(true)});
}
function filteredTasks(){
  if(activeView==='history')return (state.tasks||[]).filter(t=>t.work_kind==='legacy');
  if(simpleFlowMode())return simpleFlowTasks();
  if(activeView==='suggested')return actionTasks().filter(t=>t.action_review_state!=='approved');
  const tasks=activeActions();let out;
  if(activeView==='my_work')out=tasks.filter(nexusOwned);else if(activeView==='client_work')out=tasks.filter(clientOwned);else if(activeView==='ready_review')out=tasks.filter(t=>reviewStatus(t.status));else out=tasks.filter(t=>completedStatus(t.status));
  return out.sort((a,b)=>(Number(a.sort_order||100)-Number(b.sort_order||100))||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')));
}

function commentsFor(task){return comments.filter(c=>c.task_id===task.id)}
function commentMarkup(task){const rows=commentsFor(task);return `<div class="task-comments"><div class="task-comments-title">Conversation <span>${rows.length}</span></div>${rows.length?`<div class="task-comment-list">${rows.map(c=>`<div class="task-comment"><b>${c.author_id===state.user?.id?'You':state.admin?'Client':'Relystra'}</b><span>${esc(c.body)}</span><small>${new Date(c.created_at).toLocaleString()}</small></div>`).join('')}</div>`:'<p class="task-comment-empty">No comments yet.</p>'}<div class="task-comment-compose"><textarea data-comment-input="${task.id}" placeholder="Add a short question or update. Never share passwords or secrets here."></textarea><button class="btn secondary add-task-comment" data-id="${task.id}" type="button">Comment</button></div></div>`}
function taskResponseMarkup(task){const data=task.response_data||{};const note=data.client_note||'';if(state.admin){if(!note)return '';return `<div class="client-submission-note"><b>Client note</b><p>${esc(note)}</p></div>`}return `<label class="simple-response"><span>${task.task_type==='approval'?'Approval note (optional)':task.task_type==='decision'?'Decision / context':task.task_type==='structured_form'?'Your response':'Note for Relystra (optional)'}</span><textarea data-client-note="${task.id}" placeholder="${task.task_type==='structured_form'?'Add the requested information here.':'Add context that will help Relystra review this item.'}">${esc(note)}</textarea></label>`}
function primaryClientLabel(task){if(task.task_type==='upload'||task.task_type==='workflow_evidence')return 'Open secure upload';if(task.task_type==='meeting')return task.status==='in_progress'?'Submit for review':'Start';if(task.task_type==='approval')return 'Submit approval for review';if(task.task_type==='decision')return 'Submit decision';return 'Submit for review'}
function actionButtons(task,blocked){
  const review=reviewStatus(task.status),clientAction=!state.admin&&task.assignee==='client',canSubmit=clientAction&&!blocked;
  return `${clientAction?`${task.task_type==='upload'||task.task_type==='workflow_evidence'?'<button class="btn secondary task-open-docs" type="button">Open secure upload</button>':''}<button class="btn primary client-submit-task" type="button" ${canSubmit?'':'disabled'}>${esc(primaryClientLabel(task))} →</button>`:''}${state.admin&&review?'<button class="btn primary admin-approve-task" type="button">Approve step</button><button class="btn secondary admin-revise-task" type="button">Request change</button>':''}${state.admin&&nexusOwned(task)&&!blocked?'<button class="btn secondary admin-start-task" type="button">Start</button><button class="btn primary admin-complete-task" type="button">Mark complete</button>':''}`;
}
function simpleTaskCard(task){
  const tasks=simpleFlowTasks(),idx=simpleStepIndex(task),blocked=dependencyBlocked(task),done=completedStatus(task.status),review=reviewStatus(task.status),owner=task.assignee==='client'?'Client':'Relystra';
  return `<article class="operational-action-card action-v2-card simple-workflow-card ${review?'review-ready':''} ${done?'completed':''} ${blocked?'dependency-blocked':''}" data-task-id="${task.id}">
    <span class="simple-workflow-number">${done?'✓':idx+1}</span>
    <div class="action-v2-head"><div class="action-v2-title"><div class="simple-workflow-kicker"><span>Step ${idx+1} of ${tasks.length}</span><span>·</span><span>${owner}</span><span>·</span><span class="status-chip status-${esc(task.status)}">${esc(statusLabel(task.status))}</span></div><h3>${esc(task.title)}</h3><p>${esc(task.description||'')}</p></div><button class="task-detail-toggle" type="button" aria-expanded="false">Details</button></div>
    ${blocked?'<div class="dependency-note blocked"><b>Not ready yet</b><span>Finish the previous step first.</span></div>':''}
    ${task.review_note?`<div class="revision-note"><b>${task.status==='needs_revision'?'Change requested':'Review note'}</b><p>${esc(task.review_note)}</p></div>`:''}
    ${taskResponseMarkup(task)}
    <div class="action-v2-actions">${actionButtons(task,blocked)}</div>
    <div class="action-v2-detail"><div class="detail-block"><b>How to complete this step</b><p>${esc(task.instructions||task.description||'Complete the step described above.')}</p></div>${commentMarkup(task)}</div>
  </article>`;
}
function taskCard(task){
  if(task.work_kind==='prebuild_action')return prebuildActionCard(task,state.docs||[]);
  if(isSimpleTask(task))return simpleTaskCard(task);
  const dep=dependency(task),blocked=dependencyBlocked(task),review=reviewStatus(task.status),overdue=task.due_date&&!completedStatus(task.status)&&new Date(task.due_date+'T23:59:59')<new Date();
  return `<article class="operational-action-card action-v2-card ${review?'review-ready':''} ${completedStatus(task.status)?'completed':''} ${blocked?'dependency-blocked':''}" data-task-id="${task.id}">
    <div class="action-v2-head"><div class="action-v2-title"><div class="action-v2-tags"><span>${esc(phaseLabel(task.phase))}</span><span>${esc(typeLabel(task.task_type))}</span><span class="status-chip status-${esc(task.status)}">${esc(statusLabel(task.status))}</span>${overdue?'<span class="overdue-chip">Overdue</span>':''}</div><h3>${esc(task.title)}</h3><p>${esc(task.description||'')}</p></div><button class="task-detail-toggle" type="button" aria-expanded="false">Details</button></div>
    <div class="action-v2-meta"><span><b>Owner</b>${task.assignee==='client'?'Client':'Relystra'}</span><span><b>Due</b>${esc(fmtDate(task.due_date))}</span><span><b>Priority</b>${esc(task.priority||'normal')}</span></div>
    ${dep?`<div class="dependency-note ${blocked?'blocked':''}"><b>${blocked?'Waiting on prerequisite':'Prerequisite complete'}</b><span>${esc(dep.title)}</span></div>`:''}
    ${task.review_note?`<div class="revision-note"><b>${task.status==='needs_revision'?'Relystra requested a revision':'Review note'}</b><p>${esc(task.review_note)}</p></div>`:''}
    ${taskResponseMarkup(task)}
    <div class="action-v2-actions">${actionButtons(task,blocked)}</div>
    <div class="action-v2-detail"><div class="detail-block"><b>What to do</b><p>${esc(task.instructions||task.description||'Complete the action described above.')}</p></div>${commentMarkup(task)}</div>
  </article>`;
}
function renderTasks(){
  const root=$('taskList');if(!root)return;const tasks=filteredTasks();
  root.innerHTML=tasks.length?tasks.map(task=>activeView==='history'?`<article class="action-v2-card"><h3>${esc(task.title)}</h3><p>${esc(statusLabel(task.status))}</p><p>${esc(task.instructions||task.description||'')}</p><small>Historical work retained from the earlier engagement.</small></article>`:taskCard(task)).join(''):`<div class="action-empty-state"><b>${activeView==='completed'?'Nothing completed yet':'You are clear here.'}</b><span>${state.admin?'No workflow step needs attention in this view.':'There are no action items in this view.'}</span></div>`;
  bindCards(root);bindPrebuildActions(root,portal,()=>renderAll(true));window.dispatchEvent(new CustomEvent('nexus:action-cards-rendered',{detail:{companyId:state.companyId,simpleWorkflow:simpleFlowMode()}}));
}

async function saveClientNote(task,card){const note=card.querySelector(`[data-client-note="${task.id}"]`)?.value.trim()||'';return {...(task.response_data||{}),client_note:note}}
async function submitTask(task,card){if(dependencyBlocked(task))return toast('Finish the previous step first.');if(task.task_type==='upload'||task.task_type==='workflow_evidence'){openDocuments();return}const data=await saveClientNote(task,card);const {error}=await sb.rpc('nexus_submit_task_for_review',{p_task_id:task.id,p_response_data:data});if(error)return toast(error.message||'This step could not be submitted.');toast('Submitted to Relystra for review.');await workspace();await refreshComments();renderAll(true)}
async function approveTask(task){const {error}=await sb.rpc('nexus_approve_task',{p_task_id:task.id,p_note:null});if(error)return toast(error.message||'Step could not be approved.');toast('Step approved.');await workspace();renderAll(true)}
async function reviseTask(task){const note=prompt(`What should change for “${task.title}”?`);if(!note?.trim())return;const {error}=await sb.rpc('nexus_request_task_revision',{p_task_id:task.id,p_note:note.trim()});if(error)return toast(error.message||'Change request could not be sent.');toast('Change requested.');await workspace();renderAll(true)}
async function updateAdminTask(task,status){const patch={status,assignee:'nexus',updated_at:new Date().toISOString()};if(status==='completed')patch.completed_at=new Date().toISOString();const {error}=await sb.from('nexus_tasks').update(patch).eq('id',task.id);if(error)return toast(error.message||'Step could not be updated.');try{await log(status==='completed'?'task_completed':'task_started','task',task.id,`${status==='completed'?'Relystra completed':'Relystra started'}: ${task.title}`)}catch{}await workspace();renderAll(true)}
async function addComment(task,card){const input=card.querySelector(`[data-comment-input="${task.id}"]`),body=input?.value.trim();if(!body)return toast('Write a comment first.');const {error}=await sb.from('nexus_task_comments').insert({company_id:task.company_id,task_id:task.id,author_id:state.user.id,body});if(error)return toast(error.message||'Comment could not be added.');input.value='';await refreshComments();renderAll(true)}
function openDocuments(){const btn=document.querySelector('.side-nav button[data-section="documents"]');if(btn)btn.click();else document.getElementById('section-documents')?.scrollIntoView({behavior:'smooth'})}
function bindCards(root){
  root.querySelectorAll('.task-detail-toggle').forEach(b=>b.onclick=()=>{const card=b.closest('.action-v2-card'),open=card.classList.toggle('detail-open');b.setAttribute('aria-expanded',String(open));b.textContent=open?'Hide details':'Details'});
  root.querySelectorAll('.task-open-docs').forEach(b=>b.onclick=openDocuments);
  root.querySelectorAll('.client-submit-task').forEach(b=>{const card=b.closest('.action-v2-card'),task=(state.tasks||[]).find(t=>t.id===card.dataset.taskId);b.onclick=()=>submitTask(task,card)});
  root.querySelectorAll('.admin-approve-task').forEach(b=>{const card=b.closest('.action-v2-card'),task=state.tasks.find(t=>t.id===card.dataset.taskId);b.onclick=()=>approveTask(task)});
  root.querySelectorAll('.admin-revise-task').forEach(b=>{const card=b.closest('.action-v2-card'),task=state.tasks.find(t=>t.id===card.dataset.taskId);b.onclick=()=>reviseTask(task)});
  root.querySelectorAll('.admin-start-task').forEach(b=>{const task=state.tasks.find(t=>t.id===b.closest('.action-v2-card').dataset.taskId);b.onclick=()=>updateAdminTask(task,'in_progress')});
  root.querySelectorAll('.admin-complete-task').forEach(b=>{const task=state.tasks.find(t=>t.id===b.closest('.action-v2-card').dataset.taskId);b.onclick=()=>updateAdminTask(task,'completed')});
  root.querySelectorAll('.add-task-comment').forEach(b=>{const card=b.closest('.action-v2-card'),task=state.tasks.find(t=>t.id===card.dataset.taskId);b.onclick=()=>addComment(task,card)});
}

async function loadLibrary(){if(!state.admin){templates=[];packages=[];packageItems=[];return}const [t,p,i]=await Promise.all([sb.from('nexus_action_templates').select('*').eq('active',true).order('sort_order'),sb.from('nexus_action_packages').select('*').eq('active',true).order('sort_order'),sb.from('nexus_action_package_items').select('*').order('sort_order')]);templates=(t.data||[]).filter(t=>t.workflow_metadata?.work_kind!=='prebuild_action');packages=p.data||[];packageItems=i.data||[]}
async function refreshComments(){if(!state.companyId){comments=[];return}const companyId=state.companyId;const {data,error}=await sb.from('nexus_task_comments').select('*').eq('company_id',companyId).order('created_at',{ascending:true});if(state.companyId!==companyId)return;if(error){console.error(error);comments=[];return}comments=data||[]}

function ensureAssignModal(){if($('actionExecutionModal'))return;const modal=document.createElement('div');modal.id='actionExecutionModal';modal.className='modal';modal.innerHTML=`<div class="modal-card action-execution-modal-card"><div class="toolbar"><div><div class="kicker">Relystra delivery methodology</div><h2 style="margin:4px 0">Assign work</h2><p class="small">Apply a full workflow package or select only the actions this client needs.</p></div><button class="btn secondary action-execution-close" type="button">Close</button></div><div class="assign-mode-tabs"><button class="active" data-mode="packages" type="button">Workflow packages</button><button data-mode="templates" type="button">Individual actions</button></div><div id="actionPackagePane"></div><div id="actionTemplatePane" hidden></div></div>`;document.body.appendChild(modal);modal.querySelector('.action-execution-close').onclick=()=>modal.classList.remove('show');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('show')};modal.querySelectorAll('.assign-mode-tabs button').forEach(b=>b.onclick=()=>{modal.querySelectorAll('.assign-mode-tabs button').forEach(x=>x.classList.toggle('active',x===b));$('actionPackagePane').hidden=b.dataset.mode!=='packages';$('actionTemplatePane').hidden=b.dataset.mode!=='templates'})}
function packageCard(pkg){const count=packageItems.filter(i=>i.package_id===pkg.id).length;return `<article class="package-choice"><div><span>${esc(phaseLabel(pkg.phase))}</span><h3>${esc(pkg.title)}</h3><p>${esc(pkg.description||'')}</p><small>${count} structured action${count===1?'':'s'}</small></div><button class="btn primary assign-package" data-code="${esc(pkg.code)}" type="button">Apply package</button></article>`}
function renderAssignModal(){ensureAssignModal();$('actionPackagePane').innerHTML=`<div class="package-grid">${packages.map(packageCard).join('')}</div>`;const groups={};templates.forEach(t=>(groups[t.phase]??=[]).push(t));$('actionTemplatePane').innerHTML=`<div class="template-selector">${Object.entries(groups).map(([phase,rows])=>`<section><h3>${esc(phaseLabel(phase))}</h3>${rows.map(t=>`<label><input type="checkbox" value="${esc(t.code)}"><span><b>${esc(t.title)}</b><small>${esc(typeLabel(t.task_type))} · ${t.assignee==='client'?'Client':'Relystra'}</small></span></label>`).join('')}</section>`).join('')}</div><div class="template-assign-footer"><label>Due date override <input id="bulkTemplateDue" type="date"></label><button id="assignCheckedTemplates" class="btn primary" type="button">Assign selected actions</button></div>`;$('actionPackagePane').querySelectorAll('.assign-package').forEach(b=>b.onclick=()=>assignPackage(b.dataset.code,b));$('assignCheckedTemplates').onclick=assignCheckedTemplates}
function openAssignModal(){if(!state.admin||simpleFlowMode())return;renderAssignModal();$('actionExecutionModal').classList.add('show')}
async function assignPackage(code,btn){btn.disabled=true;btn.textContent='Applying…';const {data,error}=await sb.rpc('nexus_assign_action_package',{p_company_id:state.companyId,p_project_id:state.projects?.[0]?.id||null,p_package_code:code,p_start_date:new Date().toISOString().slice(0,10)});if(error){btn.disabled=false;btn.textContent='Apply package';return toast(error.message||'Package could not be applied.')}toast(`${data||0} action items added.`);$('actionExecutionModal').classList.remove('show');await workspace();renderAll(true)}
async function assignCheckedTemplates(){const codes=[...$('actionTemplatePane').querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);if(!codes.length)return toast('Select at least one action.');const btn=$('assignCheckedTemplates');btn.disabled=true;btn.textContent='Assigning…';const due=$('bulkTemplateDue').value||null;let count=0;for(const code of codes){const {error}=await sb.rpc('nexus_assign_action_template',{p_company_id:state.companyId,p_project_id:state.projects?.[0]?.id||null,p_template_code:code,p_due_date:due,p_priority:null});if(error){btn.disabled=false;btn.textContent='Assign selected actions';return toast(error.message||`Could not assign ${code}.`)}count++}toast(`${count} action item${count===1?'':'s'} assigned.`);$('actionExecutionModal').classList.remove('show');await workspace();renderAll(true)}

function renderAll(force=false){
  if(!state.user||!state.companyId)return;ensureShell();
  const stamp=JSON.stringify({company:state.companyId,admin:state.admin,view:activeView,activeProject:activeProjectId(),tasks:(state.tasks||[]).map(t=>[t.id,t.status,t.assignee,t.updated_at,t.review_note,t.dependency_task_id,t.project_id,t.workflow_metadata?.one_workflow,t.workflow_metadata?.simple_flow]),comments:comments.map(c=>[c.id,c.created_at])});
  if(!force&&stamp===renderStamp&&$('taskList')?.querySelector('.action-v2-card,.action-empty-state'))return;
  renderStamp=stamp;renderTop();renderTabs();renderTasks();const btn=$('assignTemplateBtn');if(btn&&state.admin&&!simpleFlowMode())btn.onclick=prebuildMode()?()=>openPrebuildActionCreator(portal,()=>renderAll(true)):openAssignModal;
}
async function reconcile(force=false){if(!state.user||!state.companyId)return;if(force||state.companyId!==lastCompany){lastCompany=state.companyId;renderStamp='';await Promise.all([loadLibrary(),refreshComments()])}renderAll(force)}
window.addEventListener('nexus:workspace-ready',()=>{if(prebuildMode()&&state.tasks.some(t=>t.action_review_state==='suggested'))activeView='suggested';reconcile(true).catch(console.error)});sb.auth.onAuthStateChange(()=>setTimeout(()=>reconcile(true),300));
await reconcile(true);