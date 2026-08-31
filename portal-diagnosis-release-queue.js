const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentRunId=null,renderBusy=false;

async function loadQueue(id){
  const [tasks,docs,approvals]=await Promise.all([
    sb.from('nexus_tasks').select('id,title,description,status').eq('source_diagnosis_run_id',id).eq('assignee','client').eq('status','draft').order('created_at'),
    sb.from('nexus_document_requests').select('id,title,purpose,status').eq('source_diagnosis_run_id',id).eq('status','draft').order('created_at'),
    sb.from('nexus_approvals').select('id,title,description,status').eq('source_diagnosis_run_id',id).eq('status','draft').order('created_at')
  ]);
  for(const r of [tasks,docs,approvals])if(r.error)throw r.error;
  return {tasks:tasks.data||[],docs:docs.data||[],approvals:approvals.data||[]};
}
function row(kind,item){
  const copy=item.description||item.purpose||'';
  return `<div class="diagnosis-release-item"><div><div class="kicker">${esc(kind)}</div><b>${esc(item.title)}</b>${copy?`<p class="small">${esc(copy)}</p>`:''}</div><button class="btn secondary" data-nexus-release="${esc(kind)}" data-id="${esc(item.id)}" type="button">Release to client →</button></div>`;
}
async function renderReleaseQueue(){
  if(renderBusy||!currentRunId||!state.admin)return;renderBusy=true;
  try{
    const body=document.getElementById('diagnosisReviewBody');if(!body)return;
    const {data:run,error}=await sb.from('nexus_diagnosis_runs').select('id,status,orchestrated_at').eq('id',currentRunId).single();if(error)throw error;
    let panel=body.querySelector('.diagnosis-release-queue');
    if(!run?.orchestrated_at){panel?.remove();return}
    const q=await loadQueue(currentRunId),count=q.tasks.length+q.docs.length+q.approvals.length;
    if(!panel){panel=document.createElement('section');panel.className='diagnosis-release-queue diagnosis-generated';const actions=body.querySelector('.diagnosis-review-actions');if(actions)actions.before(panel);else body.appendChild(panel)}
    panel.innerHTML=`<div class="kicker">Human release gate</div><h3>Client release queue</h3><p class="small">Diagnosis approval created these items as internal drafts. Nothing below is visible to the client until you release it individually.</p>${count?`<div class="diagnosis-release-list">${q.tasks.map(x=>row('task',x)).join('')}${q.docs.map(x=>row('document request',x)).join('')}${q.approvals.map(x=>row('decision',x)).join('')}</div>`:'<div class="note"><b>No unreleased client drafts remain.</b> Anything already released is now visible in the client workspace.</div>'}`;
  }catch(error){console.error('Diagnosis release queue failed',error)}finally{renderBusy=false}
}
async function release(button){
  const type=button.dataset.nexusRelease,id=button.dataset.id;
  const map={'task':['nexus_release_client_task',{p_task_id:id}],'document request':['nexus_release_document_request',{p_request_id:id}],'decision':['nexus_release_approval',{p_approval_id:id}]};
  const spec=map[type];if(!spec)return;
  const ok=window.confirm(`Release this ${type} to the client workspace?\n\nIt will become client-visible and a notification will be queued. Review the wording before continuing.`);if(!ok)return;
  button.disabled=true;const original=button.textContent;button.textContent='Releasing…';
  try{const {error}=await sb.rpc(spec[0],spec[1]);if(error)throw error;toast?.(`${type[0].toUpperCase()+type.slice(1)} released to the client workspace.`);await renderReleaseQueue();window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'))}
  catch(error){console.error('Client release failed',error);toast?.(error.message||'The item could not be released.')}
  finally{if(button.isConnected){button.disabled=false;button.textContent=original}}
}

document.addEventListener('click',event=>{
  const review=event.target.closest?.('.diagnosis-review-btn');if(review){currentRunId=review.dataset.id;setTimeout(renderReleaseQueue,300);setTimeout(renderReleaseQueue,700);return}
  const action=event.target.closest?.('[data-diagnosis-action]');if(action){currentRunId=action.dataset.id;setTimeout(renderReleaseQueue,500);return}
  const button=event.target.closest?.('[data-nexus-release]');if(button){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();release(button)}
},true);
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(renderReleaseQueue,180));

const style=document.createElement('style');style.textContent='.diagnosis-release-list{display:grid;gap:10px;margin-top:12px}.diagnosis-release-item{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:13px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.025)}.diagnosis-release-item>div{min-width:0}.diagnosis-release-item p{margin:5px 0 0}@media(max-width:720px){.diagnosis-release-item{display:grid}.diagnosis-release-item .btn{width:100%}}';document.head.appendChild(style);
window.NexusDiagnosisReleaseQueue={renderReleaseQueue};
