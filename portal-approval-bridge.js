const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
let lastDiagnosisRunId=null,busy=false;

function rememberDiagnosis(event){
  const target=event.target.closest?.('.diagnosis-review-btn,[data-diagnosis-action],.diagnosis-retry-btn');
  if(target?.dataset?.id)lastDiagnosisRunId=target.dataset.id;
}
async function findChain(entityType,entityId){
  if(!entityType||!entityId)return null;
  const {data,error}=await sb.from('nexus_approval_chains').select('id,status,title').eq('entity_type',entityType).eq('entity_id',entityId).in('status',['draft','pending','changes_requested','approved']).order('created_at',{ascending:false}).limit(1);
  if(error)throw error;return data?.[0]||null;
}
async function openApproval(entityType,entityId){
  if(busy)return;busy=true;
  try{
    const chain=await findChain(entityType,entityId);
    if(!chain){toast?.('Approval chain is still being prepared. Refresh the workspace and try again.');return}
    if(chain.status==='approved'){toast?.('This approval is already complete. Refreshing the workspace.');await portal.workspace?.();return}
    if(window.NexusApprovalInbox){window.NexusApprovalInbox.activate();setTimeout(()=>window.NexusApprovalInbox.openChain(chain.id),80);return}
    location.href=`/portal?view=inbox&approval_chain=${encodeURIComponent(chain.id)}`;
  }catch(error){console.error('Approval routing failed',error);toast?.(error.message||'Approval could not be opened.')}
  finally{busy=false}
}

document.addEventListener('click',event=>{
  rememberDiagnosis(event);
  const release=event.target.closest?.('[data-nexus-release]');
  if(release){
    const type=release.dataset.nexusRelease,id=release.dataset.id;
    if(type==='task'||type==='document request'){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      openApproval(type==='task'?'client_task_release':'document_request_release',id);return;
    }
    // A client decision is different: the existing release action submits the company-visible
    // chain to its first client approver. Do not intercept it here.
  }
  const report=event.target.closest?.('.vnext-release-report');
  if(report){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(lastDiagnosisRunId)return void openApproval('diagnosis_report_release',lastDiagnosisRunId);
    window.NexusDiagnosisController?.latestRun?.({force:true}).then(run=>run?.id?openApproval('diagnosis_report_release',run.id):toast?.('Open the diagnosis you want to release first.')).catch(error=>toast?.(error.message||'Diagnosis approval could not be opened.'));return;
  }
  const packet=event.target.closest?.('.approve-packet');
  if(packet){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openApproval('outreach_packet',packet.dataset.id);return}
  const step=event.target.closest?.('.approve-step');
  if(step){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openApproval('outreach_step',step.dataset.id);return}
},true);

const observer=new MutationObserver(()=>{
  document.querySelectorAll('.vnext-release-report').forEach(b=>{b.textContent='Review release approval →';b.title='Client release is controlled through the Nexus approval chain.'});
  document.querySelectorAll('.approve-packet').forEach(b=>{b.textContent='Review approval';b.title='Open the governed outreach approval chain.'});
  document.querySelectorAll('.approve-step').forEach(b=>{b.textContent='Review approval';b.title='Open the governed outreach approval chain.'});
  document.querySelectorAll('[data-nexus-release="task"],[data-nexus-release="document request"]').forEach(b=>{b.textContent='Review approval →';b.title='Open the governed client-release approval chain.'});
});
observer.observe(document.body,{childList:true,subtree:true});

window.NexusApprovalBridge={findChain,openApproval};
