const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');

const {sb,state,$,toast,workspace,log}=portal;
let templates=[];
let diagnosisDrafts=[];
let lastCompanyId=null;
let taskStamp='';
let draftStamp='';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString():'No fixed due date';
const addressed=s=>['ready','uploaded','build_with_nexus','not_available','not_applicable'].includes(s);
const friendlyRequirementTitle=title=>({
  'Current workflow or SOP':'How this work is done today',
  'Representative examples of the work':'3–10 real examples',
  'Systems and tools list':'Tools your team uses',
  'Volume and frequency':'How often this happens',
  'Existing KPI or performance report':'Any reports or numbers you already track',
  'Process owners and decision makers':'Who does the work and who approves changes'
}[title]||title||'Preparation item');

function openSection(name){
  document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${name}`));
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderField(field,value,admin){
  const required=field.required?' <span class="required-mark">Required</span>':'';
  const common=`data-task-field="${esc(field.key)}" ${field.required?'data-required="true"':''} ${admin?'disabled':''}`;
  const val=esc(value??'');
  if(field.type==='textarea')return `<label class="action-form-field"><span>${esc(field.label)}${required}</span><textarea ${common} placeholder="${esc(field.placeholder||'')}">${val}</textarea></label>`;
  if(field.type==='select'&&Array.isArray(field.options))return `<label class="action-form-field"><span>${esc(field.label)}${required}</span><select ${common}>${field.options.map(o=>`<option value="${esc(o)}" ${String(value??'')===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label class="action-form-field"><span>${esc(field.label)}${required}</span><input ${common} type="${field.type==='date'?'date':'text'}" value="${val}" placeholder="${esc(field.placeholder||'')}"></label>`;
}

function formMarkup(task){
  const schema=Array.isArray(task.form_schema)?task.form_schema:[];
  if(!schema.length)return '';
  const data=task.response_data||{};
  return `<div class="action-form" data-task-form="${task.id}">${schema.map(f=>renderField(f,data[f.key],state.admin)).join('')}</div>`;
}

function checklistMarkup(task){
  const reqs=state.dataRequirements||[];
  if(!reqs.length)return '<div class="action-empty">No preparation checklist has been assigned to this project yet.</div>';
  const complete=reqs.filter(r=>addressed(r.status)).length;
  return `<div class="embedded-checklist"><div class="embedded-checklist-head"><b>${complete} of ${reqs.length} items addressed</b><span>${complete===reqs.length?'Checklist ready to complete':'Work through the items below'}</span></div>${reqs.map(r=>{
    const c=r.catalog||{};const fileLike=['file','export'].includes(c.input_type),answerLike=['answer','list','access_context'].includes(c.input_type);
    return `<article class="embedded-requirement ${addressed(r.status)?'done':''}" data-req-id="${r.id}"><div class="embedded-req-top"><div><b>${esc(friendlyRequirementTitle(c.title))}</b><span>${esc(c.why_needed||'This helps Nexus understand the current state without guessing.')}</span></div><span class="embedded-status">${esc(String(r.status||'needed').replaceAll('_',' '))}</span></div>${r.client_note?`<div class="embedded-answer"><b>Your response:</b> ${esc(r.client_note)}</div>`:''}${!state.admin?`<div class="embedded-req-actions">${fileLike?`<button class="btn primary req-open-upload" data-id="${r.id}" type="button">Upload / provide</button>`:''}${answerLike?`<button class="btn secondary req-inline-answer" data-id="${r.id}" type="button">Answer here</button>`:''}<button class="btn secondary req-inline-build" data-id="${r.id}" type="button">Build with Nexus</button><button class="btn secondary req-inline-na" data-id="${r.id}" type="button">Not applicable</button></div>${answerLike?`<div class="embedded-answer-editor" data-id="${r.id}"><textarea data-req-note="${r.id}" placeholder="A short, clear answer is enough.">${esc(r.client_note||'')}</textarea><button class="btn primary req-inline-save" data-id="${r.id}" type="button">Save response</button></div>`:''}`:''}</article>`;
  }).join('')}</div>`;
}

function workflowEvidenceMarkup(task){
  return `<div class="workflow-evidence-guide"><h4>What “current-workflow evidence” means</h4><p>Show Nexus how the work actually happens <b>today</b>—not how it is supposed to happen in theory.</p><div class="evidence-guide-grid"><div><b>What we are looking for</b><span>People involved, steps, systems, handoffs, repeated work, delays, exceptions, and what a normal completed example looks like.</span></div><div><b>Useful examples</b><span>SOPs, checklists, screenshots, booking/CRM exports, spreadsheets, sample emails, forms, reports, or a short written walkthrough.</span></div><div><b>What you do not need</b><span>You do not need polished documentation or a formal process map. Representative evidence is enough.</span></div></div>${!state.admin?'<button class="btn primary workflow-upload-btn" type="button">Open the secure upload area →</button>':''}</div>${formMarkup(task)}`;
}

function responseSummary(task){
  const schema=Array.isArray(task.form_schema)?task.form_schema:[];const data=task.response_data||{};
  if(!state.admin||!schema.length||!Object.keys(data).length)return '';
  return `<div class="admin-response-summary"><div class="kicker">Client response</div>${schema.filter(f=>data[f.key]!==undefined&&String(data[f.key]).trim()!=='').map(f=>`<div><b>${esc(f.label)}</b><span>${esc(data[f.key])}</span></div>`).join('')}</div>`;
}

function taskCard(task){
  let body='';
  if(task.task_type==='preparation_checklist')body=checklistMarkup(task);
  else if(task.task_type==='workflow_evidence')body=workflowEvidenceMarkup(task);
  else body=formMarkup(task);
  const hasForm=Array.isArray(task.form_schema)&&task.form_schema.length>0;
  return `<article class="operational-action-card ${task.status==='done'?'completed':''}" data-task-id="${task.id}"><div class="operational-action-head"><div><div class="action-meta"><span>${esc(task.assignee==='client'?'Client action':'Nexus action')}</span><span>${esc(task.priority||'normal')} priority</span>${task.response_updated_at?'<span>response saved</span>':''}</div><h3>${esc(task.title)}</h3></div><select class="operational-task-status" data-id="${task.id}" ${!state.admin&&task.assignee!=='client'?'disabled':''}>${[['open','Open'],['in_progress','In progress'],['blocked','Blocked'],['done','Done']].map(([v,l])=>`<option value="${v}" ${task.status===v?'selected':''}>${l}</option>`).join('')}</select></div><p class="action-description">${esc(task.description||'')}</p>${task.instructions?`<div class="action-instructions"><b>What to do</b><p>${esc(task.instructions)}</p></div>`:''}${body}${responseSummary(task)}<div class="action-footer"><span>${task.due_date?'Due '+fmtDate(task.due_date):'No fixed due date'}</span>${!state.admin&&task.assignee==='client'?`<div class="action-footer-buttons">${hasForm?'<button class="btn secondary save-task-response" type="button">Save response</button>':''}<button class="btn primary complete-task-action" type="button">Mark complete →</button></div>`:''}</div></article>`;
}

async function saveTaskResponse(card,{complete=false}={}){
  const id=card.dataset.taskId;const task=state.tasks.find(t=>t.id===id);if(!task)return;
  const data={...(task.response_data||{})};let missing=[];
  card.querySelectorAll('[data-task-field]').forEach(el=>{data[el.dataset.taskField]=el.value.trim();if(el.dataset.required==='true'&&!el.value.trim())missing.push(el.closest('label')?.querySelector('span')?.textContent?.replace('Required','').trim()||el.dataset.taskField)});
  if(complete&&task.task_type==='preparation_checklist'){
    const remaining=(state.dataRequirements||[]).filter(r=>!addressed(r.status));
    if(remaining.length)return toast(`Address ${remaining.length} remaining checklist item${remaining.length===1?'':'s'} before completing this action.`);
  }
  if(complete&&missing.length)return toast(`Complete the required field${missing.length===1?'':'s'}: ${missing.join(', ')}.`);
  const now=new Date().toISOString();const patch={response_data:data,response_updated_at:now,updated_at:now,status:complete?'done':(task.status==='open'?'in_progress':task.status)};
  const {error}=await sb.from('nexus_tasks').update(patch).eq('id',id);if(error)return toast(error.message||'Action response could not be saved.');
  try{await log(complete?'task_completed':'task_response_saved','task',id,`${complete?'Client completed':'Client saved a response for'}: ${task.title}`)}catch{}
  toast(complete?'Action completed. Nexus has been notified.':'Response saved. Nexus has been notified.');
  await workspace();taskStamp='';
}

async function updateTaskStatus(id,status){
  const {error}=await sb.from('nexus_tasks').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message||'Action status could not be updated.');
  await workspace();taskStamp='';
}

async function saveRequirement(id){
  const note=document.querySelector(`[data-req-note="${id}"]`)?.value.trim();if(!note)return toast('Add a response before saving.');
  const {error}=await sb.from('nexus_project_data_requirements').update({client_note:note,status:'ready',updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message||'Preparation response could not be saved.');
  toast('Checklist response saved.');await workspace();taskStamp='';
}
async function setRequirement(id,status){
  const {error}=await sb.from('nexus_project_data_requirements').update({status,updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message||'Checklist item could not be updated.');
  toast(status==='build_with_nexus'?'Nexus will help build this item.':'Checklist item updated.');await workspace();taskStamp='';
}
function openRequirementUpload(id){
  openSection('documents');
  setTimeout(()=>{const btn=document.querySelector(`.req-upload[data-id="${id}"]`);if(btn)btn.click();else $('section-documents')?.scrollIntoView({behavior:'smooth'})},180);
}
function openWorkflowUpload(){
  const req=(state.dataRequirements||[]).find(r=>/workflow|sop/i.test(r.catalog?.title||''));
  if(req)return openRequirementUpload(req.id);
  openSection('documents');
}

function bindTaskCards(){
  const root=$('taskList');if(!root)return;
  root.querySelectorAll('.operational-task-status').forEach(el=>el.onchange=()=>updateTaskStatus(el.dataset.id,el.value));
  root.querySelectorAll('.save-task-response').forEach(b=>b.onclick=()=>saveTaskResponse(b.closest('.operational-action-card')));
  root.querySelectorAll('.complete-task-action').forEach(b=>b.onclick=()=>saveTaskResponse(b.closest('.operational-action-card'),{complete:true}));
  root.querySelectorAll('.req-open-upload').forEach(b=>b.onclick=()=>openRequirementUpload(b.dataset.id));
  root.querySelectorAll('.req-inline-answer').forEach(b=>b.onclick=()=>root.querySelector(`.embedded-answer-editor[data-id="${b.dataset.id}"]`)?.classList.toggle('open'));
  root.querySelectorAll('.req-inline-save').forEach(b=>b.onclick=()=>saveRequirement(b.dataset.id));
  root.querySelectorAll('.req-inline-build').forEach(b=>b.onclick=()=>setRequirement(b.dataset.id,'build_with_nexus'));
  root.querySelectorAll('.req-inline-na').forEach(b=>b.onclick=()=>setRequirement(b.dataset.id,'not_applicable'));
  root.querySelectorAll('.workflow-upload-btn').forEach(b=>b.onclick=openWorkflowUpload);
}

function enhanceTaskSection(){
  const root=$('taskList');if(!root||!state.user||!state.companyId)return;
  const stamp=JSON.stringify({company:state.companyId,admin:state.admin,tasks:(state.tasks||[]).map(t=>[t.id,t.status,t.updated_at,t.response_updated_at,t.task_type]),reqs:(state.dataRequirements||[]).map(r=>[r.id,r.status,r.client_note])});
  if(stamp===taskStamp&&root.querySelector('.operational-action-card'))return;
  taskStamp=stamp;
  root.innerHTML=(state.tasks||[]).map(taskCard).join('')||'<div class="empty">No action items yet.</div>';
  bindTaskCards();
  const section=$('section-tasks');
  const p=section?.querySelector('.toolbar p.small');if(p)p.textContent=state.admin?'Assign clear work, review client responses, and keep responsibility synchronized across the engagement.':'Complete your Nexus work here. Each action tells you exactly what is needed and saves your response directly to the shared engagement record.';
}

function ensureTemplateUI(){
  if(!state.admin){$('assignTemplateBtn')?.remove();$('actionTemplateModal')?.remove();return}
  const add=$('newTaskBtn');if(add&&!$('assignTemplateBtn')){const b=document.createElement('button');b.id='assignTemplateBtn';b.className='btn primary';b.type='button';b.textContent='+ Assign from template';add.before(b);b.onclick=openTemplateModal}
  if(!$('actionTemplateModal')){
    const modal=document.createElement('div');modal.id='actionTemplateModal';modal.className='modal';modal.innerHTML=`<div class="modal-card action-template-modal-card"><div class="toolbar"><div><div class="kicker">Reusable client actions</div><h2 style="margin:4px 0">Assign from template</h2></div><button class="btn secondary close-template-modal" type="button">Close</button></div><div class="field"><label>Action template</label><select id="actionTemplateSelect"></select></div><div id="actionTemplatePreview" class="template-preview"></div><div class="form-grid"><div class="field"><label>Priority</label><select id="actionTemplatePriority"><option value="">Template default</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div><div class="field"><label>Due date</label><input id="actionTemplateDue" type="date"></div></div><div class="actions"><button id="assignSelectedTemplate" class="btn primary" type="button">Assign to selected company →</button></div></div>`;document.body.appendChild(modal);
    modal.querySelector('.close-template-modal').onclick=()=>modal.classList.remove('show');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('show')};$('actionTemplateSelect').onchange=renderTemplatePreview;$('assignSelectedTemplate').onclick=assignTemplate;
  }
}
function openTemplateModal(){ensureTemplateUI();const modal=$('actionTemplateModal');if(!modal)return;const existing=new Set((state.tasks||[]).map(t=>t.template_code).filter(Boolean));$('actionTemplateSelect').innerHTML=templates.map(t=>`<option value="${esc(t.code)}" ${existing.has(t.code)?'data-existing="true"':''}>${esc(t.category)} · ${esc(t.title)}${existing.has(t.code)?' · already assigned':''}</option>`).join('');renderTemplatePreview();modal.classList.add('show')}
function renderTemplatePreview(){const t=templates.find(x=>x.code===$('actionTemplateSelect')?.value);const root=$('actionTemplatePreview');if(!root)return;root.innerHTML=t?`<span>${esc(t.category)}</span><h3>${esc(t.title)}</h3><p>${esc(t.description||'')}</p><div><b>Client instruction</b><p>${esc(t.instructions||'')}</p></div>`:'<div class="empty">No template selected.</div>'}
async function assignTemplate(){const code=$('actionTemplateSelect')?.value;if(!code)return;const btn=$('assignSelectedTemplate');btn.disabled=true;btn.textContent='Assigning…';try{const {error}=await sb.rpc('nexus_assign_action_template',{p_company_id:state.companyId,p_project_id:state.projects?.[0]?.id||null,p_template_code:code,p_due_date:$('actionTemplateDue').value||null,p_priority:$('actionTemplatePriority').value||null});if(error)throw error;$('actionTemplateModal').classList.remove('show');toast('Action assigned. The client has been notified in Nexus.');await workspace();taskStamp=''}catch(error){toast(error.message||'Template action could not be assigned.')}finally{btn.disabled=false;btn.textContent='Assign to selected company →'}}

async function loadTemplates(){if(!state.admin){templates=[];return}const {data,error}=await sb.from('nexus_action_templates').select('*').eq('active',true).order('sort_order');if(error){console.error(error);templates=[];return}templates=data||[]}
async function loadDiagnosisDrafts(){if(!state.admin||!state.companyId){diagnosisDrafts=[];return}const {data,error}=await sb.from('nexus_diagnosis_request_drafts').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false});if(error){console.error(error);diagnosisDrafts=[];return}diagnosisDrafts=data||[]}

function draftCard(d){const locked=d.status==='sent'||d.status==='dismissed';return `<article class="diagnosis-request-draft ${esc(d.status)}" data-draft-id="${d.id}"><div class="draft-head"><div><span class="pill">${esc(d.source==='diagnosis_gap'?'Diagnosis gap':'Preparation gap')}</span><span class="pill">${esc(d.status)}</span></div>${d.document_request_id?'<span class="sent-mark">Client request created</span>':''}</div><label><span>Request title</span><input data-draft-field="title" value="${esc(d.title)}" ${locked?'disabled':''}></label><label><span>Why Nexus needs it</span><textarea data-draft-field="purpose" ${locked?'disabled':''}>${esc(d.purpose||'')}</textarea></label><label><span>Good examples</span><textarea data-draft-field="examples" ${locked?'disabled':''}>${esc(d.examples||'')}</textarea></label><label><span>Privacy / redaction guidance</span><textarea data-draft-field="redaction_guidance" ${locked?'disabled':''}>${esc(d.redaction_guidance||'')}</textarea></label><div class="draft-grid"><label><span>Sensitivity</span><select data-draft-field="sensitivity" ${locked?'disabled':''}><option value="standard" ${d.sensitivity==='standard'?'selected':''}>Standard</option><option value="confidential" ${d.sensitivity==='confidential'?'selected':''}>Confidential</option></select></label><label><span>Due date</span><input type="date" data-draft-field="due_date" value="${esc(d.due_date||'')}" ${locked?'disabled':''}></label></div>${!locked?`<div class="actions"><button class="btn secondary save-diagnosis-draft" type="button">Save draft</button><button class="btn primary send-diagnosis-draft" type="button">Send request to client →</button><button class="btn secondary dismiss-diagnosis-draft" type="button">Dismiss</button></div>`:''}</article>`}

function ensureDiagnosisDraftPanel(){
  if(!state.admin)return;
  const section=$('section-intake');if(!section)return;
  let panel=$('diagnosisRequestReviewPanel');if(!panel){panel=document.createElement('section');panel.id='diagnosisRequestReviewPanel';panel.className='box intake-card diagnosis-request-review';const queueCard=[...section.querySelectorAll('.intake-card')].find(x=>/Diagnosis packet/i.test(x.textContent||''));if(queueCard)queueCard.after(panel);else section.appendChild(panel)}
  const stamp=JSON.stringify({company:state.companyId,drafts:diagnosisDrafts.map(d=>[d.id,d.status,d.updated_at,d.document_request_id])});if(stamp===draftStamp&&panel.querySelector('.diagnosis-request-draft'))return;draftStamp=stamp;
  const openDrafts=diagnosisDrafts.filter(d=>d.status==='draft');
  panel.innerHTML=`<div class="toolbar"><div><div class="kicker">Diagnosis → evidence requests</div><h2>Requests to review</h2><p class="small">Nexus creates draft evidence requests from unresolved preparation gaps and, when a diagnosis result supplies structured evidence gaps, from those findings too. <b>Nothing is sent to the client until you approve it here.</b></p></div>${openDrafts.length>1?'<button id="sendAllDiagnosisDrafts" class="btn secondary" type="button">Send all reviewed drafts</button>':''}</div><div class="draft-summary"><b>${openDrafts.length}</b><span>draft request${openDrafts.length===1?'':'s'} waiting for review</span></div><div class="diagnosis-draft-list">${diagnosisDrafts.length?diagnosisDrafts.map(draftCard).join(''):'<div class="empty">No diagnosis-generated requests yet. Queue a diagnosis to create preliminary request drafts from unresolved preparation gaps.</div>'}</div>`;
  bindDrafts();
}
function collectDraft(card){const row={};card.querySelectorAll('[data-draft-field]').forEach(el=>row[el.dataset.draftField]=el.value.trim()||null);return row}
async function saveDraft(card){const id=card.dataset.draftId,row=collectDraft(card);if(!row.title)return toast('Request title is required.');row.updated_at=new Date().toISOString();const {error}=await sb.from('nexus_diagnosis_request_drafts').update(row).eq('id',id);if(error)throw error;toast('Draft request saved.');await loadDiagnosisDrafts();draftStamp='';ensureDiagnosisDraftPanel()}
async function sendDraft(card){const id=card.dataset.draftId;try{await saveDraft(card);const {error}=await sb.rpc('nexus_send_diagnosis_request_draft',{p_draft_id:id});if(error)throw error;toast('Request sent to the client workspace.');await Promise.all([workspace(),loadDiagnosisDrafts()]);draftStamp='';ensureDiagnosisDraftPanel()}catch(error){toast(error.message||'Request could not be sent.')}}
async function dismissDraft(card){const id=card.dataset.draftId;const {error}=await sb.rpc('nexus_dismiss_diagnosis_request_draft',{p_draft_id:id});if(error)return toast(error.message||'Draft could not be dismissed.');toast('Draft dismissed.');await loadDiagnosisDrafts();draftStamp='';ensureDiagnosisDraftPanel()}
async function sendAllDrafts(){const cards=[...document.querySelectorAll('.diagnosis-request-draft.draft')];for(const card of cards){const id=card.dataset.draftId;try{await saveDraft(card);const {error}=await sb.rpc('nexus_send_diagnosis_request_draft',{p_draft_id:id});if(error)throw error}catch(error){toast(error.message||'One request could not be sent.');return}}toast('Reviewed requests sent to the client workspace.');await Promise.all([workspace(),loadDiagnosisDrafts()]);draftStamp='';ensureDiagnosisDraftPanel()}
function bindDrafts(){const panel=$('diagnosisRequestReviewPanel');if(!panel)return;panel.querySelectorAll('.save-diagnosis-draft').forEach(b=>b.onclick=()=>saveDraft(b.closest('.diagnosis-request-draft')).catch(e=>toast(e.message)));panel.querySelectorAll('.send-diagnosis-draft').forEach(b=>b.onclick=()=>sendDraft(b.closest('.diagnosis-request-draft')));panel.querySelectorAll('.dismiss-diagnosis-draft').forEach(b=>b.onclick=()=>dismissDraft(b.closest('.diagnosis-request-draft')));$('sendAllDiagnosisDrafts')?.addEventListener('click',sendAllDrafts)}

async function reconcile(force=false){
  if(!state.user||!state.companyId)return;
  if(force||state.companyId!==lastCompanyId){lastCompanyId=state.companyId;taskStamp='';draftStamp='';await Promise.all([loadTemplates(),loadDiagnosisDrafts()])}
  ensureTemplateUI();enhanceTaskSection();ensureDiagnosisDraftPanel();
}

$('companySelect')?.addEventListener('change',()=>setTimeout(()=>reconcile(true),240));
sb.auth.onAuthStateChange(()=>setTimeout(()=>reconcile(true),240));
setInterval(()=>reconcile(false).catch(console.error),1200);
await reconcile(true);
