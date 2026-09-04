const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for diagnosis approval bridge.');
const {sb,state,toast,workspace,runtime}=portal;
if(!state?.admin)throw new Error('Diagnosis approval bridge is admin-only.');

let approving=false;
const boundary=runtime?.boundary;
const runBoundary=(name,fn)=>boundary?.run?boundary.run(name,fn):fn();

async function approveFromIntake(button){
  if(approving)return;
  const run=window.NexusAdminIntake?.latestDiagnosisRun?.();
  if(!run||run.status!=='ready_for_review')return toast?.('The diagnosis is not ready for approval.');
  approving=true;
  const original=button.textContent;
  button.disabled=true;button.textContent='Approving…';
  try{
    const {data,error}=await sb.rpc('nexus_approve_diagnosis',{p_run_id:run.id,p_note:null});
    if(error)throw error;
    toast?.('Diagnosis approved. Review the recommended actions before anything is assigned.');
    window.NexusDiagnosisController?.invalidateLatest?.();
    await workspace?.();
    await window.NexusAdminIntake?.refresh?.({reload:true});
    window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed',{detail:{runId:run.id,action:'approved',summary:data||null}}));
    await window.NexusResolutionPlan?.open?.(run.id);
  }catch(error){
    console.error('Inline diagnosis approval failed',error);
    toast?.(error?.message||'Diagnosis approval could not be saved.');
    if(button?.isConnected){button.disabled=false;button.textContent=original}
  }finally{approving=false}
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('#approveDiagnosisBtn');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  runBoundary('approve diagnosis and review actions',()=>approveFromIntake(button));
},true);

window.NexusResolutionInlineApprovalBridge=Object.freeze({approveFromIntake});
