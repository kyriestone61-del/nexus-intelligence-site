const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast,workspace}=portal;
const terminal=s=>['completed','approved','done','not_applicable'].includes(String(s||'').toLowerCase());
let scheduled=false,busy=false;

function taskFor(card){return (state.tasks||[]).find(t=>t.id===card?.dataset.taskId)}
function dependencyBlocked(task){if(!task?.dependency_task_id)return false;const dep=(state.tasks||[]).find(t=>t.id===task.dependency_task_id);return !!dep&&!terminal(dep.status)}
function button(label,cls,action){const b=document.createElement('button');b.type='button';b.className=`btn ${cls}`;b.textContent=label;b.dataset.journeyGuardAction=action;return b}
function enhance(){
 scheduled=false;if(!state.admin)return;
 document.querySelectorAll('.action-v2-card').forEach(card=>{
   const task=taskFor(card);if(!task)return;
   const actions=card.querySelector('.action-v2-actions');if(!actions)return;
   const blocked=dependencyBlocked(task);
   card.classList.toggle('journey-admin-blocked',blocked);
   card.querySelectorAll('.admin-start-task,.admin-complete-task').forEach(b=>{b.disabled=blocked;b.title=blocked?'Complete the prerequisite first.':''});
   if(task.status==='not_applicable'){card.classList.add('completed','journey-not-applicable');card.style.display='none';return}
   card.style.removeProperty('display');
   if(terminal(task.status)||task.status==='ready_for_review')return;
   if(task.assignee==='client'){
     if(!actions.querySelector('[data-journey-guard-action="evidence"]'))actions.appendChild(button('Complete from evidence','secondary','evidence'));
     if(!actions.querySelector('[data-journey-guard-action="na"]'))actions.appendChild(button('Not applicable','secondary','na'));
   }else if(task.assignee==='nexus'&&!actions.querySelector('[data-journey-guard-action="na"]')){
     actions.appendChild(button('Not applicable','secondary','na'));
   }
   actions.querySelectorAll('[data-journey-guard-action]').forEach(b=>{b.disabled=blocked;b.title=blocked?'Complete the prerequisite first.':''});
 });
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance)}
async function transition(task,status,note,clicked){
 if(busy)return;if(!task)return;
 if(dependencyBlocked(task))return toast('Complete the prerequisite before changing this action.');
 busy=true;const original=clicked?.textContent;if(clicked){clicked.disabled=true;clicked.textContent='Saving…'}
 try{
   const {error}=await sb.rpc('nexus_admin_set_task_status',{p_task_id:task.id,p_status:status,p_note:note||null});
   if(error)throw error;
   toast(status==='not_applicable'?'Marked not applicable.':status==='completed'&&task.assignee==='client'?'Completed from available evidence.':status==='completed'?'Action completed.':'Action started.');
   await workspace();schedule();
 }catch(error){console.error('Guided task transition failed',error);toast(error.message||'The action could not be updated.')}
 finally{busy=false;if(clicked&&clicked.isConnected){clicked.disabled=false;clicked.textContent=original}}
}

document.addEventListener('click',event=>{
 if(!state.admin)return;const clicked=event.target.closest('button');if(!clicked)return;
 const card=clicked.closest('.action-v2-card'),task=taskFor(card);if(!task)return;
 if(clicked.matches('.admin-start-task')){event.preventDefault();event.stopImmediatePropagation();return transition(task,'in_progress',null,clicked)}
 if(clicked.matches('.admin-complete-task')){event.preventDefault();event.stopImmediatePropagation();return transition(task,'completed',null,clicked)}
 const action=clicked.dataset.journeyGuardAction;if(!action)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(action==='evidence'){
   const note=prompt(`What evidence satisfies “${task.title}”?\n\nExample: Answered during discovery meeting / contained in transcript / supplied in attached file.`);
   if(!note?.trim())return;
   return transition(task,'completed',note.trim(),clicked);
 }
 if(action==='na'){
   const note=prompt(`Why is “${task.title}” not applicable to this client?`);
   if(!note?.trim())return;
   return transition(task,'not_applicable',note.trim(),clicked);
 }
},true);

window.addEventListener('load',schedule);window.addEventListener('focus',schedule);document.addEventListener('click',()=>setTimeout(schedule,60));document.addEventListener('change',schedule);setTimeout(schedule,200);setTimeout(schedule,900);