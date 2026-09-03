const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
let currentRunId=null,renderBusy=false;

async function loadQueue(id){
  const [tasks,docs,approvals,releases]=await Promise.all([
    sb.from('nexus_tasks').select('id,title,description,status,task_type,phase').eq('source_diagnosis_run_id',id).eq('assignee','client').eq('status','draft').order('created_at'),
    sb.from('nexus_document_requests').select('id,title,purpose,status').eq('source_diagnosis_run_id',id).eq('status','draft').order('created_at'),
    sb.from('nexus_approvals').select('id,title,description,status').eq('source_diagnosis_run_id',id).eq('status','draft').order('created_at'),
    sb.from('nexus_diagnosis_report_releases').select('id,status,report_version,released_at,revoked_at').eq('diagnosis_run_id',id).order('report_version',{ascending:false}).limit(1)
  ]);
  for(const r of [tasks,docs,approvals,releases])if(r.error)throw r.error;
  const clientTasks=(tasks.data||[]).filter(item=>!(String(item.task_type||'').toLowerCase()==='approval'&&String(item.phase||'').toLowerCase()==='diagnosis'));
  return {tasks:clientTasks,docs:docs.data||[],approvals:approvals.data||[],report:releases.data?.[0]||null};
}
function row(kind,item){
  const copy=item.description||item.purpose||'';
  return `<div class="diagnosis-release-item"><div><div class="kicker">${esc(kind)}</div><b>${esc(item.title)}</b>${copy?`<p class="small">${esc(copy)}</p>`:''}</div><button class="btn secondary" data-nexus-release="${esc(kind)}" data-id="${esc(item.id)}" type="button">Release to client →</button></div>`;
}
function reportGate(run,report){
  const live=report?.status==='released'&&!report?.revoked_at;
  const version=Number(report?.report_version||0);
  const releasedAt=report?.released_at?new Date(report.released_at).toLocaleString():'';
  return `<div class="diagnosis-report-release-gate ${live?'released':''}"><div><div class="kicker">Client diagnosis handoff</div><h3>${live?`Client report v${esc(version)} is released`:'Release the diagnosis before asking the client to approve it'}</h3><p class="small">${live?`Released ${esc(releasedAt)}. Releasing an updated version will reopen the diagnosis approval so the client reviews the newest report.`:'The client cannot approve a diagnosis they cannot see. Release the client-safe report first; Nexus will then make the matching “Approve diagnosis and first priority” task available automatically.'}</p></div><button class="btn ${live?'secondary':'primary'}" data-nexus-release-report="${esc(run.id)}" type="button">${live?'Release updated report →':'Release diagnosis report →'}</button></div>`;
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
    panel.innerHTML=`${reportGate(run,q.report)}<div class="diagnosis-release-queue-copy"><div class="kicker">Human release gate</div><h3>Other client release items</h3><p class="small">Release client-facing actions only after you have reviewed the wording and confirmed the client is ready for them. Diagnosis approval itself is opened automatically by releasing the report above.</p></div>${count?`<div class="diagnosis-release-list">${q.tasks.map(x=>row('task',x)).join('')}${q.docs.map(x=>row('document request',x)).join('')}${q.approvals.map(x=>row('decision',x)).join('')}</div>`:'<div class="note"><b>No other unreleased client drafts remain.</b></div>'}`;
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
async function latestReportRelease(runId){
  const {data,error}=await sb.from('nexus_diagnosis_report_releases').select('id,status,report_version,released_at,revoked_at').eq('diagnosis_run_id',runId).order('report_version',{ascending:false}).limit(1);
  if(error)throw error;
  return data?.[0]||null;
}
async function releaseApprovalChain(runId){
  const {data,error}=await sb.from('nexus_approval_chains').select('id,status,current_step').eq('entity_type','diagnosis_report_release').eq('entity_id',runId).order('created_at',{ascending:false}).limit(1);
  if(error)throw error;
  return data?.[0]||null;
}
async function completePendingReleaseApproval(runId){
  const chain=await releaseApprovalChain(runId);
  if(!chain)return null;
  if(chain.status==='approved')return null;
  if(chain.status!=='pending')throw new Error(`Diagnosis release approval is ${String(chain.status||'not actionable').replaceAll('_',' ')}.`);
  const {data:steps,error}=await sb.from('nexus_approval_chain_steps').select('id,step_order,status').eq('chain_id',chain.id).eq('step_order',chain.current_step).limit(1);
  if(error)throw error;
  const step=steps?.[0];
  if(!step||step.status!=='pending')throw new Error('The diagnosis release approval step is not currently actionable.');
  const decision=await sb.rpc('nexus_decide_approval_step',{p_step_id:step.id,p_decision:'approved',p_note:'Founder approved release of the client-safe diagnosis report after reviewing wording, scope, recipient visibility, and downstream consequences.'});
  if(decision.error)throw decision.error;
  return chain.id;
}
async function performDiagnosisReportRelease(runId){
  const chain=await releaseApprovalChain(runId);
  if(chain?.status==='pending'){
    await completePendingReleaseApproval(runId);
    const released=await latestReportRelease(runId);
    if(!released||released.status!=='released'||released.revoked_at)throw new Error('Release approval completed, but the client report was not published.');
    return released.id;
  }
  if(chain&&chain.status!=='approved')throw new Error(`Diagnosis release approval is ${String(chain.status||'not actionable').replaceAll('_',' ')}.`);
  const {data,error}=await sb.rpc('nexus_release_diagnosis_report',{p_run_id:runId});
  if(error)throw error;
  return data||null;
}
async function releaseReport(button){
  const runId=button.dataset.nexusReleaseReport;if(!runId)return;
  const existing=button.closest('.diagnosis-report-release-gate')?.classList.contains('released');
  const copy=existing
    ? 'Release an updated diagnosis report to the client?\n\nThis creates a new report version, notifies the client, and reopens their diagnosis approval so they review the newest version. It does not authorize implementation or production access.'
    : 'Release this diagnosis report to the client?\n\nThe client will be notified, the report will appear in their Reports area, and “Approve diagnosis and first priority” will become available. It does not authorize implementation or production access.';
  if(!window.confirm(copy))return;
  button.disabled=true;const original=button.textContent;button.textContent='Releasing report…';
  try{
    const releaseId=await performDiagnosisReportRelease(runId);
    toast?.(existing?'Updated diagnosis report released. Client approval reopened.':'Diagnosis report released. The client can now review and approve it.');
    await portal.workspace?.();
    await renderReleaseQueue();
    window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed',{detail:{runId,releaseId}}));
  }catch(error){console.error('Diagnosis report release failed',error);toast?.(error.message||'The diagnosis report could not be released.')}
  finally{if(button.isConnected){button.disabled=false;button.textContent=original}}
}

document.addEventListener('click',event=>{
  const review=event.target.closest?.('.diagnosis-review-btn');if(review){currentRunId=review.dataset.id;setTimeout(renderReleaseQueue,300);setTimeout(renderReleaseQueue,700);return}
  const action=event.target.closest?.('[data-diagnosis-action]');if(action){currentRunId=action.dataset.id;setTimeout(renderReleaseQueue,500);return}
  const reportButton=event.target.closest?.('[data-nexus-release-report]');if(reportButton){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();releaseReport(reportButton);return}
  const button=event.target.closest?.('[data-nexus-release]');if(button){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();release(button)}
},true);
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(renderReleaseQueue,180));

const style=document.createElement('style');style.textContent='.diagnosis-report-release-gate{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:18px;padding:16px;border:1px solid rgba(217,255,114,.28);border-radius:14px;background:rgba(217,255,114,.05)}.diagnosis-report-release-gate.released{border-color:rgba(128,239,192,.24);background:rgba(128,239,192,.04)}.diagnosis-report-release-gate h3{margin:4px 0 6px}.diagnosis-report-release-gate p{margin:0}.diagnosis-release-queue-copy{padding-top:2px}.diagnosis-release-queue-copy h3{margin:4px 0 5px}.diagnosis-release-queue-copy p{margin:0}.diagnosis-release-list{display:grid;gap:10px;margin-top:12px}.diagnosis-release-item{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:13px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.025)}.diagnosis-release-item>div{min-width:0}.diagnosis-release-item p{margin:5px 0 0}@media(max-width:720px){.diagnosis-report-release-gate,.diagnosis-release-item{display:grid}.diagnosis-report-release-gate .btn,.diagnosis-release-item .btn{width:100%;min-height:48px}}';document.head.appendChild(style);
window.NexusDiagnosisReleaseQueue={renderReleaseQueue};
