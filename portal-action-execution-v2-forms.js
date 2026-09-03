const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast,workspace}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const addressed=s=>['ready','uploaded','build_with_nexus','not_available','not_applicable'].includes(s);
const complete=s=>['completed','approved','done','not_applicable'].includes(s);
let scheduled=false;

function inputFor(field,value){const required=field.required?' <em>Required</em>':'';const common=`data-v2-field="${esc(field.key)}" ${field.required?'data-required="true"':''}`;if(field.type==='textarea')return `<label><span>${esc(field.label)}${required}</span><textarea ${common} placeholder="${esc(field.placeholder||'')}">${esc(value??'')}</textarea></label>`;if(field.type==='select'&&Array.isArray(field.options))return `<label><span>${esc(field.label)}${required}</span><select ${common}>${field.options.map(o=>`<option value="${esc(o)}" ${String(value??'')===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;return `<label><span>${esc(field.label)}${required}</span><input ${common} type="${field.type==='date'?'date':'text'}" value="${esc(value??'')}" placeholder="${esc(field.placeholder||'')}"></label>`}
function blocked(task){if(!task.dependency_task_id)return false;const d=(state.tasks||[]).find(x=>x.id===task.dependency_task_id);return !!d&&!complete(d.status)}

async function submit(task,card){
 if(blocked(task))return toast('Complete the prerequisite before submitting this item.');
 if(task.task_type==='preparation_checklist'){
   const remaining=(state.dataRequirements||[]).filter(r=>!addressed(r.status));
   if(remaining.length)return toast(`Address ${remaining.length} remaining checklist item${remaining.length===1?'':'s'} before submitting this action.`);
 }
 const data={...(task.response_data||{})};const missing=[];
 card.querySelectorAll('[data-v2-field]').forEach(el=>{const value=el.value.trim();data[el.dataset.v2Field]=value;if(el.dataset.required==='true'&&!value)missing.push(el.closest('label')?.querySelector('span')?.textContent?.replace('Required','').trim()||el.dataset.v2Field)});
 const note=card.querySelector(`[data-client-note="${task.id}"]`)?.value.trim();if(note!==undefined)data.client_note=note;
 if(missing.length)return toast(`Complete the required field${missing.length===1?'':'s'}: ${missing.join(', ')}.`);
 const {error}=await sb.rpc('nexus_submit_task_for_review',{p_task_id:task.id,p_response_data:data});
 if(error)return toast(error.message||'This item could not be submitted.');
 toast('Submitted to Nexus for review.');await workspace();scheduleSoon();
}

function adminSummary(task,card){const schema=Array.isArray(task.form_schema)?task.form_schema:[],data=task.response_data||{};if(!schema.length||!Object.keys(data).length)return;const current=card.querySelector('.structured-response-summary');if(current)return;const rows=schema.filter(f=>String(data[f.key]??'').trim()).map(f=>`<div><b>${esc(f.label)}</b><span>${esc(data[f.key])}</span></div>`).join('');if(!rows)return;const el=document.createElement('div');el.className='client-submission-note structured-response-summary';el.innerHTML=`<b>Structured client response</b>${rows}`;const actions=card.querySelector('.action-v2-actions');actions?.before(el)}

function enhance(){
 scheduled=false;
 document.querySelectorAll('.action-v2-card').forEach(card=>{
   const task=(state.tasks||[]).find(t=>t.id===card.dataset.taskId);if(!task)return;
   if(state.admin){adminSummary(task,card);return}
   if(task.assignee!=='client')return;
   const schema=Array.isArray(task.form_schema)?task.form_schema:[];
   if(schema.length&&!card.querySelector('.structured-task-response')){
     const old=card.querySelector('.simple-response');const data=task.response_data||{};const wrapper=document.createElement('div');wrapper.className='simple-response structured-task-response';wrapper.innerHTML=`<div class="structured-task-fields">${schema.map(f=>inputFor(f,data[f.key])).join('')}</div><label><span>Note for Nexus (optional)</span><textarea data-client-note="${task.id}" placeholder="Add any context that will help Nexus review this item.">${esc(data.client_note||'')}</textarea></label>`;old?.replaceWith(wrapper);
   }
   const submitBtn=card.querySelector('.client-submit-task');if(submitBtn){if(['upload','workflow_evidence'].includes(task.task_type))submitBtn.textContent='Submit uploaded item for review →';submitBtn.onclick=()=>submit(task,card)}
 });
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance)}
function scheduleSoon(){schedule();setTimeout(schedule,100);setTimeout(schedule,350)}
window.addEventListener('load',scheduleSoon);
window.addEventListener('focus',scheduleSoon);
document.addEventListener('click',scheduleSoon,true);
document.addEventListener('change',scheduleSoon,true);
document.addEventListener('submit',scheduleSoon,true);
setTimeout(scheduleSoon,120);setTimeout(scheduleSoon,700);setTimeout(scheduleSoon,1500);

const TASK_FILE_BUILD='20260903-inline-action-files1';
if(!document.querySelector('link[data-nexus-task-files]')){const link=document.createElement('link');link.rel='stylesheet';link.href=`/portal-task-file-attachments.css?v=${TASK_FILE_BUILD}`;link.dataset.nexusTaskFiles='1';document.head.appendChild(link)}
import(`/portal-task-file-attachments.js?v=${TASK_FILE_BUILD}`).then(()=>import(`/portal-task-file-attachments-live.js?v=${TASK_FILE_BUILD}`)).catch(error=>console.error('Nexus task file controls failed to load.',error));
