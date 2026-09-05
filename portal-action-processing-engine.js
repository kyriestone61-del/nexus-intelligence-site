const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for Action Item Processing Engine.');

const {sb,state,toast,runtime}=portal;
const boundary=runtime?.boundary;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const norm=value=>String(value||'').trim().toLowerCase().replaceAll(' ','_');
const terminal=new Set(['approved','completed','done','not_applicable']);
const review=new Set(['ready_for_review','in_review','pending_review','submitted','reviewing']);
const clientActionable=new Set(['waiting_on_client','not_started','open','in_progress','needs_revision']);
const addressedRequirements=new Set(['ready','uploaded','build_with_nexus','not_available','not_applicable']);
const FILE_TYPES=new Set(['upload','workflow_evidence']);
let comments=[];
let events=[];
let historyCompanyId=null;
let historyRequest=null;
let clientFilter='needs_you';
let adminDecorateTimer=null;

function taskById(id){return (state.tasks||[]).find(task=>String(task.id)===String(id))||null}
function docsForTask(taskId){return (state.docs||[]).filter(doc=>String(doc.task_id||'')===String(taskId))}
function dependency(task){return task?.dependency_task_id?taskById(task.dependency_task_id):null}
function dependencyBlocked(task){const dep=dependency(task);return !!dep&&!terminal.has(norm(dep.status))}
function ownerLabel(task){if(task.owner_user_id&&task.owner_user_id===state.user?.id)return 'You';return norm(task.owner_scope||task.assignee)==='client'?'Client':'Nexus'}
function statusLabel(status){return ({draft:'Draft',open:'Not started',not_started:'Not started',waiting_on_client:'Waiting on client',in_progress:'In progress',blocked:'Blocked',ready_for_review:'Ready for Nexus review',needs_revision:'Changes requested',approved:'Approved',completed:'Completed',done:'Completed',not_applicable:'Not applicable'}[norm(status)]||String(status||'Not started').replaceAll('_',' '))}
function fmtDate(value){if(!value)return 'No due date';try{return new Date(`${value}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}catch{return value}}
function listItems(value,fallback){
  const rows=Array.isArray(value)?value:[];
  if(!rows.length)return `<li>${esc(fallback)}</li>`;
  return rows.map(item=>{const label=typeof item==='string'?item:item?.label||item?.title||item?.description||JSON.stringify(item);return `<li>${esc(label)}</li>`}).join('');
}
function responseData(task,root){
  const data={...(task.response_data||{})};
  root?.querySelectorAll('[data-action-field]').forEach(control=>{
    const key=control.dataset.actionField;if(!key)return;
    data[key]=control.type==='checkbox'?control.checked:String(control.value??'').trim();
  });
  const note=root?.querySelector('[data-action-note]')?.value.trim();
  if(note)data.client_note=note;
  return data;
}
function formMarkup(task,readOnly=false){
  const schema=Array.isArray(task.form_schema)?task.form_schema:[];
  if(!schema.length)return '';
  const data=task.response_data||{};
  return `<div class="action-engine-form"><h4>Action response</h4>${schema.map(field=>{
    const key=esc(field.key||field.name||field.label||'field');const label=esc(field.label||field.key||'Response');const required=field.required?' <span class="required">Required</span>':'';const common=`data-action-field="${key}" ${field.required?'data-required="true"':''} ${readOnly?'disabled':''}`;
    if(field.type==='textarea')return `<label><span>${label}${required}</span><textarea ${common}>${esc(data[field.key]??'')}</textarea></label>`;
    if(field.type==='select'&&Array.isArray(field.options))return `<label><span>${label}${required}</span><select ${common}>${field.options.map(option=>`<option value="${esc(option)}" ${String(data[field.key]??'')===String(option)?'selected':''}>${esc(option)}</option>`).join('')}</select></label>`;
    return `<label><span>${label}${required}</span><input type="${field.type==='date'?'date':'text'}" ${common} value="${esc(data[field.key]??'')}"></label>`;
  }).join('')}</div>`;
}

async function loadHistory(force=false){
  if(!state.companyId){comments=[];events=[];historyCompanyId=null;return}
  if(!force&&historyCompanyId===state.companyId)return;
  if(historyRequest)return historyRequest;
  historyRequest=(async()=>{
    const [commentResult,eventResult]=await Promise.all([
      sb.from('nexus_task_comments').select('*').eq('company_id',state.companyId).order('created_at',{ascending:true}),
      sb.from('nexus_task_events').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false})
    ]);
    if(commentResult.error)throw commentResult.error;
    if(eventResult.error)throw eventResult.error;
    comments=commentResult.data||[];events=eventResult.data||[];historyCompanyId=state.companyId;
  })();
  try{await historyRequest}finally{historyRequest=null}
}
function historyMarkup(task){
  const rows=events.filter(event=>String(event.task_id)===String(task.id)).slice(0,20);
  const notes=comments.filter(comment=>String(comment.task_id)===String(task.id));
  return `<div class="action-engine-history" data-history-panel hidden><div class="action-engine-history-grid"><div><h4>Audit trail</h4>${rows.length?rows.map(event=>`<div class="action-engine-event"><b>${esc(String(event.event_type||'update').replaceAll('_',' '))}</b><span>${new Date(event.created_at).toLocaleString()}</span>${event.from_status||event.to_status?`<small>${esc(statusLabel(event.from_status))} → ${esc(statusLabel(event.to_status))}</small>`:''}</div>`).join(''):'<p>No workflow events yet.</p>'}</div><div><h4>Conversation</h4>${notes.length?notes.map(comment=>`<div class="action-engine-comment"><b>${comment.author_id===state.user?.id?'You':'Workspace member'}</b><p>${esc(comment.body)}</p><small>${new Date(comment.created_at).toLocaleString()}</small></div>`).join(''):'<p>No comments yet.</p>'}</div></div></div>`;
}

function validateClientSubmission(task,card){
  if(dependencyBlocked(task))return `Complete “${dependency(task)?.title||'the prerequisite'}” first.`;
  const required=[...card.querySelectorAll('[data-action-field][data-required="true"]')].filter(control=>!String(control.value??'').trim());
  if(required.length)return 'Complete all required response fields before submitting.';
  if(norm(task.task_type)==='preparation_checklist'){
    const remaining=(state.dataRequirements||[]).filter(row=>!addressedRequirements.has(norm(row.status)));
    if(remaining.length)return `Address ${remaining.length} remaining preparation ${remaining.length===1?'item':'items'} first.`;
  }
  if(norm(task.task_type)==='upload'&&!docsForTask(task.id).length)return 'Upload at least one file to this action before submitting.';
  return null;
}
async function startTask(task){
  const result=await sb.rpc('nexus_start_task',{p_task_id:task.id});if(result.error)throw result.error;
  toast?.('Action started.');await portal.workspace?.();await loadHistory(true);renderClientActions();scheduleAdminDecoration();
}
async function submitTask(task,card){
  const problem=validateClientSubmission(task,card);if(problem){toast?.(problem);return}
  const result=await sb.rpc('nexus_submit_task_for_review',{p_task_id:task.id,p_response_data:responseData(task,card)});if(result.error)throw result.error;
  toast?.('Submitted to Nexus for review.');await portal.workspace?.();await loadHistory(true);renderClientActions();
}
async function requestHelp(task,card){
  const box=card.querySelector('[data-help-box]');
  if(box&&!box.hidden){const input=box.querySelector('textarea'),message=input?.value.trim()||'';const result=await sb.rpc('nexus_request_task_help',{p_task_id:task.id,p_message:message||null});if(result.error)throw result.error;toast?.('Help request sent to Nexus.');await portal.workspace?.();await loadHistory(true);renderClientActions();return}
  if(box){box.hidden=false;box.querySelector('textarea')?.focus()}
}
async function addComment(task,card){
  const box=card.querySelector('[data-comment-box]');
  if(box&&!box.hidden){const input=box.querySelector('textarea'),body=input?.value.trim();if(!body){toast?.('Write a comment first.');return}const result=await sb.from('nexus_task_comments').insert({company_id:task.company_id,task_id:task.id,author_id:state.user.id,body});if(result.error)throw result.error;toast?.('Comment added.');await loadHistory(true);renderClientActions();scheduleAdminDecoration();return}
  if(box){box.hidden=false;box.querySelector('textarea')?.focus()}
}
function uploadForTask(task){
  portal.prepareUpload?.({taskId:task.id,title:task.title});
  const filesButton=document.querySelector('#nexusClientPrimaryNav [data-client-view="files"]');
  filesButton?.click();
  setTimeout(()=>document.getElementById('nexusClientUploadHost')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
}

function clientTaskGroup(task){
  if(task.archived_at)return 'archived';
  if(terminal.has(norm(task.status)))return 'completed';
  if(review.has(norm(task.status))||norm(task.assignee)==='nexus')return 'with_nexus';
  if(dependencyBlocked(task))return 'upcoming';
  return 'needs_you';
}
function clientTaskCard(task){
  const group=clientTaskGroup(task),actionable=group==='needs_you'&&norm(task.assignee)==='client'&&clientActionable.has(norm(task.status));
  const dep=dependency(task),files=docsForTask(task.id),readOnly=!actionable;
  return `<article class="action-engine-card ${group}" data-action-engine-task="${esc(task.id)}">
    <div class="action-engine-head"><div><div class="action-engine-tags"><span>${esc(ownerLabel(task))}</span><span>${esc(task.priority||'normal')} priority</span><span>${esc(statusLabel(task.status))}</span></div><h3>${esc(task.title)}</h3><p>${esc(task.description||task.instructions||'Complete the action described below.')}</p></div><button class="action-engine-detail-toggle" type="button">Details</button></div>
    <div class="action-engine-meta"><span><b>Owner</b>${esc(ownerLabel(task))}</span><span><b>Due</b>${esc(fmtDate(task.due_date))}</span><span><b>Evidence attached</b>${files.length}</span></div>
    ${dep?`<div class="action-engine-dependency ${dependencyBlocked(task)?'blocked':''}"><b>${dependencyBlocked(task)?'Waiting on prerequisite':'Prerequisite complete'}</b><span>${esc(dep.title)}</span></div>`:''}
    ${task.review_note?`<div class="action-engine-revision"><b>${norm(task.status)==='needs_revision'?'Changes requested by Nexus':'Review note'}</b><p>${esc(task.review_note)}</p></div>`:''}
    <div class="action-engine-details" hidden>
      <div class="action-engine-definition"><div><h4>Required evidence</h4><ul>${listItems(task.required_evidence,'Provide the response or evidence described in this action.')}</ul></div><div><h4>Done when</h4><ul>${listItems(task.completion_criteria,'The requested work is complete and the next owner can proceed.')}</ul></div></div>
      ${formMarkup(task,readOnly)}
      ${actionable?`<label class="action-engine-note"><span>Note for Nexus <small>(optional)</small></span><textarea data-action-note placeholder="Add context that will help Nexus review this action.">${esc(task.response_data?.client_note||'')}</textarea></label>`:''}
      ${historyMarkup(task)}
    </div>
    <div class="action-engine-inline-box" data-comment-box hidden><textarea placeholder="Add a question or update. Never share passwords, MFA codes, or API secrets."></textarea><button class="btn secondary" type="button" data-send-comment>Send comment</button></div>
    <div class="action-engine-inline-box" data-help-box hidden><textarea placeholder="Tell Nexus what is blocking you or what you need help with."></textarea><button class="btn secondary" type="button" data-send-help>Send help request</button></div>
    <div class="action-engine-actions">
      ${actionable&&norm(task.status)!=='in_progress'?'<button class="btn secondary" type="button" data-action-start>Start</button>':''}
      ${actionable?'<button class="btn secondary" type="button" data-action-upload>Upload</button>':''}
      <button class="btn secondary" type="button" data-action-comment>Comment</button>
      ${actionable?'<button class="btn secondary" type="button" data-action-help>Request help</button><button class="btn primary" type="button" data-action-submit>Submit to Nexus →</button>':''}
      <button class="btn secondary" type="button" data-action-history>History</button>
    </div>
  </article>`;
}

function ensureClientActionSurface(){
  if(state.admin||!state.user)return null;
  const nav=document.getElementById('nexusClientPrimaryNav'),main=document.querySelector('.main');if(!nav||!main)return null;
  let button=document.getElementById('nexusClientActionsButton');
  if(!button){button=document.createElement('button');button.id='nexusClientActionsButton';button.type='button';button.dataset.clientView='actions';button.className='nexus-client-action-engine-nav';button.innerHTML='<span aria-hidden="true"></span><b>Actions</b>';nav.appendChild(button);button.addEventListener('click',()=>openClientActions())}
  nav.querySelectorAll('[data-client-view]').forEach(item=>{if(item===button||item.dataset.actionEngineBound)return;item.dataset.actionEngineBound='1';item.addEventListener('click',()=>button.classList.remove('active'))});
  let section=document.getElementById('nexus-client-actions');
  if(!section){section=document.createElement('section');section.id='nexus-client-actions';section.className='section nexus-client-shell-section nexus-action-engine-section';main.appendChild(section)}
  section.dataset.clientView='actions';section.classList.add('nexus-action-engine-section');
  return section;
}
function openClientActions(){
  const section=ensureClientActionSurface();if(!section)return;
  if(window.NexusClientShell?.activateView){window.NexusClientShell.activateView('actions');return}
  document.querySelectorAll('.nexus-client-shell-section').forEach(node=>node.classList.toggle('active',node===section));
  document.querySelectorAll('#nexusClientPrimaryNav [data-client-view]').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-current','false')});
  const button=document.getElementById('nexusClientActionsButton');button?.classList.add('active');button?.setAttribute('aria-current','page');
  renderClientActions();window.scrollTo({top:0,behavior:'auto'});
}
function renderClientActions(){
  const root=ensureClientActionSurface();if(!root)return;
  const tasks=(state.tasks||[]).filter(task=>!task.archived_at);
  const counts={needs_you:0,with_nexus:0,upcoming:0,completed:0};tasks.forEach(task=>{const group=clientTaskGroup(task);if(counts[group]!==undefined)counts[group]+=1});
  const labels={needs_you:'Needs You',with_nexus:'With Nexus',upcoming:'Upcoming',completed:'Completed'};
  if(!Object.hasOwn(counts,clientFilter))clientFilter='needs_you';
  const visible=tasks.filter(task=>clientTaskGroup(task)===clientFilter).sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))||Number(a.sort_order||100)-Number(b.sort_order||100));
  const disclosure=new Map([...root.querySelectorAll('[data-action-engine-task]')].map(card=>[card.dataset.actionEngineTask,['.action-engine-details','[data-history-panel]','[data-comment-box]','[data-help-box]'].filter(selector=>card.querySelector(selector)?.hidden===false)]));
  const markup=`<header class="nexus-client-page-head compact action-engine-page-head"><div><div class="eyebrow">Action Items</div><h1>Every action. One clear next move.</h1><p>Start work, attach evidence, ask for help, comment, and hand completed work back to Nexus from one place.</p></div></header>
    <div class="action-engine-tabs">${Object.entries(labels).map(([key,label])=>`<button type="button" data-action-filter="${key}" class="${clientFilter===key?'active':''}"><b>${counts[key]}</b><span>${label}</span></button>`).join('')}</div>
    <div class="action-engine-list">${visible.length?visible.map(clientTaskCard).join(''):`<div class="action-engine-empty"><b>Nothing in ${esc(labels[clientFilter])}.</b><span>Your workflow is clear in this view.</span></div>`}</div>`;
  if(root.__actionMarkup===markup)return;
  root.__actionMarkup=markup;root.innerHTML=markup;
  root.querySelectorAll('[data-action-engine-task]').forEach(card=>{
    for(const selector of disclosure.get(card.dataset.actionEngineTask)||[]){const panel=card.querySelector(selector);if(panel)panel.hidden=false}
    const details=card.querySelector('.action-engine-details');
    if(details&&!details.hidden){const toggle=card.querySelector('.action-engine-detail-toggle');if(toggle)toggle.textContent='Hide details'}
  });
  bindClientSurface(root);
}
function bindClientSurface(root){
  root.querySelectorAll('[data-action-filter]').forEach(button=>button.onclick=()=>{clientFilter=button.dataset.actionFilter;renderClientActions()});
  root.querySelectorAll('[data-action-engine-task]').forEach(card=>{
    const task=taskById(card.dataset.actionEngineTask);if(!task)return;
    card.querySelector('[data-action-start]')?.addEventListener('click',()=>boundary?.run?boundary.run('start action',()=>startTask(task)):startTask(task));
    card.querySelector('[data-action-upload]')?.addEventListener('click',()=>uploadForTask(task));
    card.querySelector('[data-action-submit]')?.addEventListener('click',()=>boundary?.run?boundary.run('submit action',()=>submitTask(task,card)):submitTask(task,card));
    card.querySelector('[data-action-comment]')?.addEventListener('click',()=>addComment(task,card));
    card.querySelector('[data-send-comment]')?.addEventListener('click',()=>boundary?.run?boundary.run('comment on action',()=>addComment(task,card)):addComment(task,card));
    card.querySelector('[data-action-help]')?.addEventListener('click',()=>requestHelp(task,card));
    card.querySelector('[data-send-help]')?.addEventListener('click',()=>boundary?.run?boundary.run('request action help',()=>requestHelp(task,card)):requestHelp(task,card));
    card.querySelector('.action-engine-detail-toggle')?.addEventListener('click',event=>{const details=card.querySelector('.action-engine-details'),open=details.hidden;details.hidden=!open;event.currentTarget.textContent=open?'Hide details':'Details'});
    card.querySelector('[data-action-history]')?.addEventListener('click',()=>{const details=card.querySelector('.action-engine-details'),history=card.querySelector('[data-history-panel]');if(details)details.hidden=false;if(history)history.hidden=!history.hidden});
  });
}

function ensureAdminModal(){
  if(document.getElementById('actionEngineAdminModal'))return;
  const modal=document.createElement('div');modal.id='actionEngineAdminModal';modal.className='modal';modal.innerHTML=`<div class="modal-card action-engine-admin-modal"><div class="toolbar"><div><div class="kicker">Action workflow</div><h2>Edit action definition</h2></div><button class="btn secondary" type="button" data-action-modal-close>Close</button></div><form id="actionEngineAdminForm"><input type="hidden" id="actionEngineTaskId"><div class="form-grid"><div class="field"><label>Owner</label><select id="actionEngineOwner"><option value="client">Client</option><option value="nexus">Nexus</option></select></div><div class="field"><label>Priority</label><select id="actionEnginePriority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></div><div class="field"><label>Due date</label><input id="actionEngineDue" type="date"></div></div><div class="field"><label>Required evidence <span class="small">One item per line</span></label><textarea id="actionEngineEvidence"></textarea></div><div class="field"><label>Completion criteria <span class="small">One item per line</span></label><textarea id="actionEngineCriteria"></textarea></div><div class="actions"><button class="btn primary" type="submit">Save workflow definition</button></div></form></div>`;document.body.appendChild(modal);
  modal.querySelector('[data-action-modal-close]').onclick=()=>modal.classList.remove('show');modal.onclick=event=>{if(event.target===modal)modal.classList.remove('show')};
  modal.querySelector('form').onsubmit=event=>{event.preventDefault();const id=document.getElementById('actionEngineTaskId').value,task=taskById(id);if(!task)return;const lines=id=>String(document.getElementById(id).value||'').split('\n').map(value=>value.trim()).filter(Boolean);const owner=document.getElementById('actionEngineOwner').value;const patch={assignee:owner,owner_scope:owner,priority:document.getElementById('actionEnginePriority').value,due_date:document.getElementById('actionEngineDue').value||null,required_evidence:lines('actionEngineEvidence').map(label=>({label,required:true,kind:'evidence'})),completion_criteria:lines('actionEngineCriteria'),notify_client:owner==='client',updated_at:new Date().toISOString()};const work=async()=>{const result=await sb.from('nexus_tasks').update(patch).eq('id',task.id);if(result.error)throw result.error;modal.classList.remove('show');toast?.('Action workflow updated.');await portal.workspace?.();await loadHistory(true);scheduleAdminDecoration()};boundary?.run?boundary.run('edit action workflow',work):work()};
}
function openAdminEdit(task){
  ensureAdminModal();document.getElementById('actionEngineTaskId').value=task.id;document.getElementById('actionEngineOwner').value=norm(task.owner_scope||task.assignee)==='client'?'client':'nexus';document.getElementById('actionEnginePriority').value=task.priority||'normal';document.getElementById('actionEngineDue').value=task.due_date||'';
  document.getElementById('actionEngineEvidence').value=(Array.isArray(task.required_evidence)?task.required_evidence:[]).map(item=>typeof item==='string'?item:item?.label||item?.title||'').filter(Boolean).join('\n');
  document.getElementById('actionEngineCriteria').value=(Array.isArray(task.completion_criteria)?task.completion_criteria:[]).map(item=>typeof item==='string'?item:item?.label||item?.title||'').filter(Boolean).join('\n');document.getElementById('actionEngineAdminModal').classList.add('show');
}
async function adminAction(task,action,note=null,projectName=null){
  const result=await sb.rpc('nexus_admin_task_action',{p_task_id:task.id,p_action:action,p_note:note,p_project_name:projectName});if(result.error)throw result.error;
  const messages={archive:'Action archived.',convert_to_project:'Action converted to a project.',complete:'Action completed.',start:'Action started.',assign_client:'Action assigned to client.',assign_nexus:'Action assigned to Nexus.'};toast?.(messages[action]||'Action updated.');await portal.workspace?.();await loadHistory(true);scheduleAdminDecoration();
}
function decorateAdminCards(){
  if(!state.admin||!state.user)return;
  document.querySelectorAll('.action-v2-card[data-task-id],.operational-action-card[data-task-id]').forEach(card=>{
    const id=card.dataset.taskId,task=taskById(id);if(!task||card.dataset.actionEngineDecorated===String(task.updated_at||'1'))return;
    card.dataset.actionEngineDecorated=String(task.updated_at||'1');
    card.querySelector('.action-engine-admin-definition')?.remove();card.querySelector('.action-engine-admin-actions')?.remove();
    const definition=document.createElement('div');definition.className='action-engine-admin-definition';definition.innerHTML=`<div><h4>Required evidence</h4><ul>${listItems(task.required_evidence,'Completion note or supporting evidence')}</ul></div><div><h4>Done when</h4><ul>${listItems(task.completion_criteria,'Requested work is complete and ready for the next owner')}</ul></div>`;
    const actions=card.querySelector('.action-v2-actions')||card.querySelector('.action-footer')||card.lastElementChild;actions?.before(definition);
    const extra=document.createElement('div');extra.className='action-engine-admin-actions';extra.innerHTML=`<button class="btn secondary" type="button" data-engine-edit>Edit workflow</button>${task.converted_to_project_id?`<span class="action-engine-project-chip">Project created</span>`:'<button class="btn secondary" type="button" data-engine-project>Convert to project</button>'}<button class="btn secondary" type="button" data-engine-history>Audit trail</button>${task.archived_at?'<span class="action-engine-project-chip">Archived</span>':'<button class="btn secondary danger-soft" type="button" data-engine-archive>Archive</button>'}<div class="action-engine-admin-history" hidden>${historyMarkup(task)}</div>`;actions?.after(extra);
    extra.querySelector('[data-engine-edit]')?.addEventListener('click',()=>openAdminEdit(task));
    extra.querySelector('[data-engine-project]')?.addEventListener('click',()=>{const name=task.title;const work=()=>adminAction(task,'convert_to_project',null,name);boundary?.run?boundary.run('convert action to project',work):work()});
    extra.querySelector('[data-engine-archive]')?.addEventListener('click',()=>{const work=()=>adminAction(task,'archive','Archived from the Action Item Processing Engine');boundary?.run?boundary.run('archive action',work):work()});
    extra.querySelector('[data-engine-history]')?.addEventListener('click',event=>{const host=extra.querySelector('.action-engine-admin-history'),panel=host?.querySelector('[data-history-panel]');if(host)host.hidden=!host.hidden;if(panel)panel.hidden=false;event.currentTarget.textContent=host&&!host.hidden?'Hide audit trail':'Audit trail'});
  });
}
function scheduleAdminDecoration(){if(!state.admin)return;clearTimeout(adminDecorateTimer);adminDecorateTimer=setTimeout(()=>{loadHistory().then(decorateAdminCards).catch(error=>console.error('Nexus action audit history failed to load.',error))},140)}

function enhanceBaseTaskModal(){
  if(!state.admin)return;const form=document.getElementById('taskForm');if(!form||form.dataset.actionEngineEnhanced)return;form.dataset.actionEngineEnhanced='1';
  const actions=form.querySelector('.actions');const fields=document.createElement('div');fields.className='action-engine-create-fields';fields.innerHTML=`<div class="field"><label>Required evidence <span class="small">One item per line</span></label><textarea id="taskRequiredEvidence" placeholder="Example: Current scheduling export\nExample: Three representative customer follow-ups"></textarea></div><div class="field"><label>Completion criteria <span class="small">One item per line</span></label><textarea id="taskCompletionCriteria" placeholder="Example: Evidence is attached\nExample: Nexus can review without additional clarification"></textarea></div>`;actions?.before(fields);
  form.addEventListener('submit',()=>{
    const parse=id=>String(document.getElementById(id)?.value||'').split('\n').map(value=>value.trim()).filter(Boolean);
    form.dataset.actionEngineEvidence=JSON.stringify(parse('taskRequiredEvidence'));form.dataset.actionEngineCriteria=JSON.stringify(parse('taskCompletionCriteria'));
  },true);
}

async function patchFreshlyCreatedTask(){
  if(!state.admin)return;
  const form=document.getElementById('taskForm');if(!form?.dataset.actionEngineEvidence)return;
  let evidence=[],criteria=[];try{evidence=JSON.parse(form.dataset.actionEngineEvidence||'[]');criteria=JSON.parse(form.dataset.actionEngineCriteria||'[]')}catch{}
  delete form.dataset.actionEngineEvidence;delete form.dataset.actionEngineCriteria;
  if(!evidence.length&&!criteria.length)return;
  const title=document.getElementById('taskTitle')?.value.trim();if(!title)return;
  const candidate=(state.tasks||[]).filter(task=>task.title===title).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];if(!candidate)return;
  const patch={};if(evidence.length)patch.required_evidence=evidence.map(label=>({label,required:true,kind:'evidence'}));if(criteria.length)patch.completion_criteria=criteria;if(!Object.keys(patch).length)return;await sb.from('nexus_tasks').update(patch).eq('id',candidate.id);await portal.workspace?.();
}

window.addEventListener('nexus:workspace-ready',async event=>{
  if(event.detail?.companyId!==state.companyId)return;
  try{await loadHistory(true)}catch(error){console.error('Nexus action history could not refresh.',error)}
  if(state.admin){enhanceBaseTaskModal();scheduleAdminDecoration();setTimeout(patchFreshlyCreatedTask,220)}else{ensureClientActionSurface();renderClientActions()}
});

if(state.user){loadHistory().catch(error=>console.error('Nexus action history could not load.',error)).finally(()=>{if(state.admin){enhanceBaseTaskModal();scheduleAdminDecoration()}else{ensureClientActionSurface();renderClientActions()}})}

const service=Object.freeze({openClientActions,renderClientActions,startTask,submitTask,requestHelp,addComment,adminAction,openAdminEdit,loadHistory});
portal.services=portal.services||{};portal.services.actionProcessing=service;
window.NexusActionProcessingEngine=service;
