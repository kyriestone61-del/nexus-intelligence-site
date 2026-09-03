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
const taskById=id=>state.tasks?.find(task=>String(task.id)===String(id))||null;
const isClientOwned=task=>task&&String(task.assignee||'').toLowerCase()==='client'&&!REVIEW_STATUSES.has(normalize(task.status))&&!TERMINAL_STATUSES.has(normalize(task.status));
const isFileTask=task=>task&&FILE_TASK_TYPES.has(normalize(task.task_type));

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
  const task=taskById(form.dataset.taskId);
  if(!isClientOwned(task))throw new Error('This action is no longer editable by the client.');
  const now=new Date().toISOString();
  const result=await sb.from('nexus_tasks').update({response_data:taskFormData(form),response_updated_at:now,status:'in_progress',updated_at:now}).eq('id',task.id).eq('company_id',state.companyId).eq('assignee','client');
  if(result.error)throw result.error;
  toast?.('Progress saved. You can return and submit when ready.');
  await portal.workspace?.();
}

function enhanceTaskForm(){
  const form=$('nexusClientTaskForm');
  if(!form||form.dataset.directExecutionReady==='true')return;
  form.dataset.directExecutionReady='true';
  const actions=form.querySelector('.actions');
  const submit=actions?.querySelector('button[type="submit"]');
  if(submit)submit.textContent='Submit to Nexus →';
  if(actions&&!actions.querySelector('[data-client-save-progress]')){
    const save=document.createElement('button');
    save.type='button';
    save.className='btn secondary';
    save.dataset.clientSaveProgress='true';
    save.textContent='Save progress';
    actions.insertBefore(save,submit||actions.firstChild);
  }
}

function addressedRequirementSummary(){
  const rows=Array.isArray(state.dataRequirements)?state.dataRequirements:[];
  const addressed=rows.filter(row=>ADDRESSED_REQUIREMENT_STATUSES.has(normalize(row.status))).length;
  return{total:rows.length,addressed,remaining:Math.max(0,rows.length-addressed)};
}

function preparationTask(){
  const active=taskById(activeFileTaskId);
  if(isClientOwned(active)&&isFileTask(active))return active;
  const primary=taskById(primaryTaskId);
  if(isClientOwned(primary)&&isFileTask(primary))return primary;
  return null;
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
    filesRoot.insertBefore(panel,requestedPanel||filesRoot.firstChild?.nextSibling||null);
  }

  let heading=$('nexusClientPreparationHeading');
  if(!heading){
    heading=document.createElement('div');
    heading.id='nexusClientPreparationHeading';
    heading.className='nexus-client-section-head';
    panel.prepend(heading);
  }
  heading.innerHTML='<div><div class="kicker">Preparation workspace</div><h2>Do the work here.</h2><p>Answer preparation items, upload existing evidence, choose <b>Build with Nexus</b> when an artifact does not exist, or mark an item <b>Not applicable</b>. You do not need separate permission to work through client-owned items.</p></div>';

  const progress=$('dataRoomProgress');
  const requirements=$('dataRoomRequirements');
  if(progress&&progress.parentElement!==panel)panel.appendChild(progress);
  if(requirements&&requirements.parentElement!==panel)panel.appendChild(requirements);

  let handoff=$('nexusClientPreparationHandoff');
  if(!handoff){
    handoff=document.createElement('div');
    handoff.id='nexusClientPreparationHandoff';
    handoff.className='nexus-client-preparation-handoff';
    panel.appendChild(handoff);
  }
  renderPreparationHandoff(handoff);
}

function renderPreparationHandoff(host){
  const task=preparationTask();
  if(!task){host.innerHTML='';host.hidden=true;return}
  host.hidden=false;
  const type=normalize(task.task_type);
  const summary=addressedRequirementSummary();
  const isChecklist=type==='preparation_checklist';
  const ready=!isChecklist||summary.total===0||summary.remaining===0;
  const progressText=isChecklist&&summary.total?`${summary.addressed} of ${summary.total} preparation items addressed.`:'When you have provided the requested work for this action, submit it to Nexus.';
  host.innerHTML=`<div><span>CLIENT → NEXUS HANDOFF</span><b>${ready?'Ready to send this step back to Nexus.':'Finish the preparation items above before handing this step back.'}</b><small>${progressText}</small></div><button type="button" class="btn primary" data-submit-file-task="${task.id}" ${ready?'':'disabled'}>${ready?'Submit to Nexus →':`Address ${summary.remaining} more ${summary.remaining===1?'item':'items'}`}</button>`;
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
  boundary.run('client action submission',async()=>{
    const button=form.querySelector('button[type="submit"]');
    if(button){button.disabled=true;button.textContent='Submitting…'}
    try{await submitTaskForReview(form.dataset.taskId,taskFormData(form))}
    finally{if(button){button.disabled=false;button.textContent='Submit to Nexus →'}}
  });
},true);

document.addEventListener('click',event=>{
  const save=event.target.closest?.('[data-client-save-progress]');
  if(save){
    event.preventDefault();event.stopImmediatePropagation();
    const form=save.closest('form');
    if(form)boundary.run('client action draft save',()=>saveTaskProgress(form));
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

const service=Object.freeze({submitTaskForReview,saveTaskProgress,mountPreparationWorkspace,decorateToday,addressedRequirementSummary});
portal.services=portal.services||{};
portal.services.clientActionExecution=service;
window.NexusClientActionExecution=service;

scheduleEnhancements();
