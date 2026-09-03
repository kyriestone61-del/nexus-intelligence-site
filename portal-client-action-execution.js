const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for client action execution.');

const {sb,state,toast,runtime}=portal;
const {boundary}=runtime;
const ADDRESSED_REQUIREMENT_STATUSES=new Set(['ready','uploaded','build_with_nexus','not_available','not_applicable']);
const FILE_TASK_TYPES=new Set(['preparation_checklist','workflow_evidence','upload']);
const REVIEW_STATUSES=new Set(['ready_for_review','in_review','pending_review','submitted','reviewing']);
const TERMINAL_STATUSES=new Set(['complete','completed','done','resolved','approved','released','implemented','closed','cancelled','canceled','archived']);
let primaryTaskId=null;
let activeFileTaskId=null;
let submissionInFlight=false;

const $=id=>document.getElementById(id);
const normalize=value=>String(value||'').trim().toLowerCase().replaceAll(' ','_');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const taskById=id=>state.tasks?.find(task=>String(task.id)===String(id))||null;
const requirementById=id=>state.dataRequirements?.find(row=>String(row.id)===String(id))||null;
const isClientOwned=task=>task&&String(task.assignee||'').toLowerCase()==='client'&&!REVIEW_STATUSES.has(normalize(task.status))&&!TERMINAL_STATUSES.has(normalize(task.status));
const isFileTask=task=>task&&FILE_TASK_TYPES.has(normalize(task.task_type));
const isRequirementAddressed=row=>ADDRESSED_REQUIREMENT_STATUSES.has(normalize(row?.status));
const isReadOnlyPreview=()=>state.previewReadOnly===true;
const previewMessage='Client View is read-only from the administrator account. The signed-in client can use these controls.';
function requireWritable(){if(isReadOnlyPreview())throw new Error(previewMessage)}

function taskFormData(form){
  const data={};
  for(const control of form.querySelectorAll('[data-task-field]')){
    const key=control.dataset.taskField;
    if(!key)continue;
    data[key]=control.type==='checkbox'?control.checked:String(control.value??'').trim();
  }
  return data;
}

async function submitTaskForReview(taskId,responseData={}){
  requireWritable();
  if(submissionInFlight)return;
  const task=taskById(taskId);
  if(!isClientOwned(task))throw new Error('This action is no longer waiting on the client.');
  submissionInFlight=true;
  try{
    const result=await sb.rpc('nexus_submit_task_for_review',{p_task_id:task.id,p_response_data:responseData});
    if(result.error)throw result.error;
    toast?.('Submitted to Nexus. This step is now in Nexus review.');
    await portal.workspace?.();
  }finally{submissionInFlight=false}
}

async function saveTaskProgress(form){
  requireWritable();
  const task=taskById(form.dataset.taskId);
  if(!isClientOwned(task))throw new Error('This action is no longer editable by the client.');
  const now=new Date().toISOString();
  const result=await sb.from('nexus_tasks').update({response_data:taskFormData(form),response_updated_at:now,status:'in_progress',updated_at:now}).eq('id',task.id).eq('company_id',state.companyId).eq('assignee','client');
  if(result.error)throw result.error;
  toast?.('Progress saved. You can return and submit when ready.');
  await portal.workspace?.();
}

async function saveRequirementAnswer(requirementId){
  requireWritable();
  const row=requirementById(requirementId);
  if(!row)throw new Error('Preparation item not found.');
  const input=$(`nexus-prep-note-${row.id}`);
  const note=String(input?.value||'').trim();
  if(!note){toast?.('Add a response before saving.');return}
  const now=new Date().toISOString();
  const result=await sb.from('nexus_project_data_requirements').update({client_note:note,status:'ready',updated_by:state.user?.id,updated_at:now}).eq('id',row.id).eq('company_id',state.companyId);
  if(result.error)throw result.error;
  toast?.('Preparation response saved.');
  await portal.workspace?.();
}

async function setRequirementStatus(requirementId,status){
  requireWritable();
  if(!['build_with_nexus','not_applicable'].includes(status))throw new Error('Unsupported preparation status.');
  const row=requirementById(requirementId);
  if(!row)throw new Error('Preparation item not found.');
  const result=await sb.from('nexus_project_data_requirements').update({status,updated_by:state.user?.id,updated_at:new Date().toISOString()}).eq('id',row.id).eq('company_id',state.companyId);
  if(result.error)throw result.error;
  toast?.(status==='build_with_nexus'?'This item is marked for Nexus to help build.':'Preparation item marked not applicable.');
  await portal.workspace?.();
}

function enhanceTaskForm(){
  const form=$('nexusClientTaskForm');
  if(!form||form.dataset.directExecutionReady==='true')return;
  form.dataset.directExecutionReady='true';
  const preview=isReadOnlyPreview();
  const actions=form.querySelector('.actions');
  const submit=actions?.querySelector('button[type="submit"]');
  if(submit){
    submit.textContent=preview?'Client can submit to Nexus':'Submit to Nexus →';
    if(preview){submit.disabled=true;submit.title=previewMessage}
  }
  if(actions&&!actions.querySelector('[data-client-save-progress]')){
    const save=document.createElement('button');
    save.type='button';
    save.className='btn secondary';
    save.dataset.clientSaveProgress='true';
    save.textContent=preview?'Client can save progress':'Save progress';
    if(preview){save.disabled=true;save.title=previewMessage}
    actions.insertBefore(save,submit||actions.firstChild);
  }
}

function addressedRequirementSummary(){
  const rows=Array.isArray(state.dataRequirements)?state.dataRequirements:[];
  const addressed=rows.filter(isRequirementAddressed).length;
  return{total:rows.length,addressed,remaining:Math.max(0,rows.length-addressed)};
}

function preparationTask(){
  const active=taskById(activeFileTaskId);
  if(isClientOwned(active)&&isFileTask(active))return active;
  const primary=taskById(primaryTaskId);
  if(isClientOwned(primary)&&isFileTask(primary))return primary;
  return null;
}

function requirementCard(row){
  const catalog=row.catalog||{};
  const type=normalize(catalog.input_type);
  const fileLike=['file','export'].includes(type);
  const answerLike=['answer','list','access_context'].includes(type);
  const addressed=isRequirementAddressed(row);
  const preview=isReadOnlyPreview();
  const disabled=preview?' disabled aria-disabled="true" title="Available to the signed-in client; administrator preview is read-only."':'';
  const readOnly=preview?' readonly aria-readonly="true"':'';
  const controls=`<div class="req-actions">${fileLike?`<button class="btn primary" type="button" data-prep-upload="${esc(row.id)}" data-prep-title="${esc(catalog.title||'Preparation evidence')}"${disabled}>Upload evidence</button>`:''}${answerLike?`<button class="btn secondary" type="button" data-prep-answer-toggle="${esc(row.id)}">Answer here</button>`:''}<button class="btn secondary" type="button" data-prep-build="${esc(row.id)}"${disabled}>Build with Nexus</button><button class="btn secondary" type="button" data-prep-na="${esc(row.id)}"${disabled}>Not applicable</button></div>${answerLike?`<div class="req-answer" data-prep-answer="${esc(row.id)}"><textarea id="nexus-prep-note-${esc(row.id)}" placeholder="Be specific. A short list or clear explanation is enough."${readOnly}>${esc(row.client_note||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn primary" type="button" data-prep-save="${esc(row.id)}"${disabled}>Save response</button></div></div>`:''}`;
  return `<article class="requirement-card ${addressed?'addressed':''}"><div class="requirement-head"><div><span class="pill">${esc(catalog.category||'Preparation')}</span> <span class="pill">${esc(String(catalog.importance||'helpful').replaceAll('_',' '))}</span></div><span class="req-status ${esc(normalize(row.status))}">${esc(String(row.status||'needed').replaceAll('_',' '))}</span></div><h3>${esc(catalog.title||'Preparation item')}</h3><div class="req-detail"><b>Why Nexus needs it</b><p>${esc(catalog.why_needed||'This helps Nexus understand the current state without guessing.')}</p></div><div class="req-detail"><b>How to find it</b><p>${esc(catalog.how_to_find||'Ask the person closest to the workflow or check the system where the work happens.')}</p></div><div class="req-detail"><b>Good examples</b><p>${esc(catalog.good_examples||'A representative example is enough.')}</p></div><div class="req-detail missing"><b>Don’t have it?</b><p>${esc(catalog.if_missing||'That is okay. Nexus can help build the minimum useful version with you.')}</p></div>${row.client_note?`<div class="req-detail"><b>Your saved response</b><p>${esc(row.client_note)}</p></div>`:''}${controls}</article>`;
}

function renderPreparationWorkspace(panel){
  const rows=Array.isArray(state.dataRequirements)?state.dataRequirements:[];
  const task=preparationTask();
  const summary=addressedRequirementSummary();
  const preview=isReadOnlyPreview();
  const hasWork=rows.length||task;
  panel.hidden=!hasWork;
  if(!hasWork){panel.innerHTML='';return}

  const isChecklist=normalize(task?.task_type)==='preparation_checklist';
  const readyForHandoff=!!task&&(!isChecklist||summary.total===0||summary.remaining===0);
  const previewNotice=preview?'<div class="nexus-client-preview-work-note"><b>Admin preview</b><span>This workspace is read-only for you. The signed-in client can use the controls below, save progress, upload and download files, and submit completed work to Nexus.</span></div>':'';
  let handoff='';
  if(task){
    const text=readyForHandoff?'Ready to send this step back to Nexus.':'Finish the preparation items above before handing this step back.';
    const progress=isChecklist&&summary.total?`${summary.addressed} of ${summary.total} preparation items addressed.`:'When you have provided the requested work for this action, submit it to Nexus.';
    const action=preview?'<button type="button" class="btn primary" disabled aria-disabled="true" title="Available to the signed-in client; administrator preview is read-only.">Client can submit to Nexus</button>':`<button type="button" class="btn primary" data-submit-file-task="${esc(task.id)}" ${readyForHandoff?'':'disabled'}>${readyForHandoff?'Submit to Nexus →':`Address ${summary.remaining} more ${summary.remaining===1?'item':'items'}`}</button>`;
    handoff=`<div class="nexus-client-preparation-handoff"><div><span>CLIENT → NEXUS HANDOFF</span><b>${text}</b><small>${progress}</small></div>${action}</div>`;
  }
  const meter=rows.length?`<div class="data-room-meter"><div class="data-room-meter-track"><div class="data-room-meter-fill" style="width:${Math.round(summary.addressed/summary.total*100)}%"></div></div><strong>${summary.addressed} of ${summary.total} preparation items addressed</strong></div>`:'';
  panel.innerHTML=`<div class="nexus-client-section-head"><div><div class="kicker">Preparation workspace</div><h2>Do the work here.</h2><p>Answer preparation items, upload existing evidence, choose <b>Build with Nexus</b> when an artifact does not exist, or mark an item <b>Not applicable</b>. You do not need separate permission to work through client-owned items.</p></div></div>${previewNotice}${meter}${rows.length?`<div class="requirement-grid nexus-client-preparation-grid">${rows.map(requirementCard).join('')}</div>`:'<div class="nexus-client-empty-small">No preparation checklist items are assigned to this project.</div>'}${handoff}`;
}

function mountPreparationWorkspace(){
  const filesRoot=$('nexus-client-files');
  if(!filesRoot)return;
  let panel=$('nexusClientPreparationWork');
  if(!panel){
    panel=document.createElement('section');
    panel.id='nexusClientPreparationWork';
    panel.className='nexus-client-files-panel nexus-client-preparation-work';
    const requestedPanel=filesRoot.querySelector('.nexus-client-files-panel');
    filesRoot.insertBefore(panel,requestedPanel||null);
  }
  renderPreparationWorkspace(panel);
}

function decorateToday(){
  const task=taskById(primaryTaskId);
  if(!isClientOwned(task))return;
  const today=$('nexus-client-today');
  if(!today)return;
  const cta=today.querySelector('[data-complete-task]');
  if(cta&&String(cta.dataset.completeTask)===String(task.id)&&isFileTask(task))cta.textContent=normalize(task.task_type)==='preparation_checklist'?'Open preparation workspace →':'Open Secure Data Room →';
  const cells=today.querySelectorAll('.nexus-client-today-strip > div');
  const next=cells?.[1];
  if(next){
    const label=next.querySelector('span'),title=next.querySelector('b');
    let detail=next.querySelector('small');
    if(label)label.textContent='After you submit';
    if(title)title.textContent='Nexus reviews your submission';
    if(!detail){detail=document.createElement('small');next.appendChild(detail)}
    detail.textContent='Nexus confirms scope or access boundaries only when the next controlled step requires it.';
  }
}

function scheduleEnhancements(){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{enhanceTaskForm();decorateToday();mountPreparationWorkspace()}));
}

document.addEventListener('submit',event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement)||form.id!=='nexusClientTaskForm')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(isReadOnlyPreview()){toast?.(previewMessage);return}
  boundary.run('client action submission',async()=>{
    const button=form.querySelector('button[type="submit"]');
    if(button){button.disabled=true;button.textContent='Submitting…'}
    try{await submitTaskForReview(form.dataset.taskId,taskFormData(form))}
    finally{if(button){button.disabled=false;button.textContent='Submit to Nexus →'}}
  });
},true);

document.addEventListener('click',event=>{
  const previewMutation=event.target.closest?.('[data-client-save-progress],[data-prep-upload],[data-prep-save],[data-prep-build],[data-prep-na],[data-submit-file-task]');
  if(previewMutation&&isReadOnlyPreview()){
    event.preventDefault();event.stopImmediatePropagation();toast?.(previewMessage);return;
  }

  const save=event.target.closest?.('[data-client-save-progress]');
  if(save){
    event.preventDefault();event.stopImmediatePropagation();
    const form=save.closest('form');
    if(form)boundary.run('client action draft save',()=>saveTaskProgress(form));
    return;
  }

  const prepUpload=event.target.closest?.('[data-prep-upload]');
  if(prepUpload){
    event.preventDefault();event.stopImmediatePropagation();
    portal.prepareUpload?.({requirementId:prepUpload.dataset.prepUpload,title:prepUpload.dataset.prepTitle||'Preparation evidence'});
    $('nexusClientUploadHost')?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>$('docFile')?.focus(),180);
    return;
  }

  const answerToggle=event.target.closest?.('[data-prep-answer-toggle]');
  if(answerToggle){
    event.preventDefault();event.stopImmediatePropagation();
    const answer=document.querySelector(`[data-prep-answer="${CSS.escape(answerToggle.dataset.prepAnswerToggle)}"]`);
    answer?.classList.toggle('open');
    if(answer?.classList.contains('open'))answer.querySelector('textarea')?.focus();
    return;
  }

  const prepSave=event.target.closest?.('[data-prep-save]');
  if(prepSave){
    event.preventDefault();event.stopImmediatePropagation();
    boundary.run('preparation response save',()=>saveRequirementAnswer(prepSave.dataset.prepSave));
    return;
  }

  const prepBuild=event.target.closest?.('[data-prep-build]');
  if(prepBuild){
    event.preventDefault();event.stopImmediatePropagation();
    boundary.run('preparation build with Nexus',()=>setRequirementStatus(prepBuild.dataset.prepBuild,'build_with_nexus'));
    return;
  }

  const prepNa=event.target.closest?.('[data-prep-na]');
  if(prepNa){
    event.preventDefault();event.stopImmediatePropagation();
    boundary.run('preparation not applicable',()=>setRequirementStatus(prepNa.dataset.prepNa,'not_applicable'));
    return;
  }

  const handoff=event.target.closest?.('[data-submit-file-task]');
  if(handoff){
    event.preventDefault();event.stopImmediatePropagation();
    const taskId=handoff.dataset.submitFileTask;
    const summary=addressedRequirementSummary();
    const task=taskById(taskId);
    if(normalize(task?.task_type)==='preparation_checklist'&&summary.total&&summary.remaining){toast?.(`Address ${summary.remaining} remaining preparation ${summary.remaining===1?'item':'items'} first.`);return}
    boundary.run('client file action submission',async()=>{
      handoff.disabled=true;handoff.textContent='Submitting…';
      try{await submitTaskForReview(taskId,{preparation_items_addressed:summary.addressed,preparation_items_total:summary.total,submitted_from:'client_workspace'})}
      finally{handoff.disabled=false;handoff.textContent='Submit to Nexus →'}
    });
    return;
  }

  const taskButton=event.target.closest?.('[data-complete-task]');
  if(taskButton){
    const task=taskById(taskButton.dataset.completeTask);
    if(isFileTask(task))activeFileTaskId=task.id;
    scheduleEnhancements();
    return;
  }

  if(event.target.closest?.('[data-client-view="files"],[data-client-go="files"]'))scheduleEnhancements();
  if(event.target.closest?.('[data-client-view="today"],[data-client-go="today"]'))scheduleEnhancements();
},true);

window.addEventListener('nexus:client-context-ready',event=>{
  if(event.detail?.companyId!==state.companyId)return;
  primaryTaskId=event.detail?.primaryTaskId||null;
  const task=taskById(primaryTaskId);
  if(isFileTask(task))activeFileTaskId=task.id;
  scheduleEnhancements();
});

window.addEventListener('nexus:workspace-ready',event=>{
  if(event.detail?.companyId===state.companyId)scheduleEnhancements();
});

const service=Object.freeze({submitTaskForReview,saveTaskProgress,saveRequirementAnswer,setRequirementStatus,mountPreparationWorkspace,decorateToday,addressedRequirementSummary,isReadOnlyPreview});
portal.services=portal.services||{};
portal.services.clientActionExecution=service;
window.NexusClientActionExecution=service;

scheduleEnhancements();