const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
let busy=false;

const byId=id=>document.getElementById(id);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transcriptDocs=()=>[...(state.docs||[])].filter(d=>d.category==='Discovery Transcript').sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));

function transcriptId(){
  const explicit=byId('diagnosisTranscriptDoc')?.value||'';
  if(explicit)return explicit;
  return transcriptDocs()[0]?.id||null;
}

async function latestUnresolvedForTranscript(id){
  if(!id||!state.companyId)return null;
  const {data,error}=await sb.from('nexus_diagnosis_runs')
    .select('id,status,analysis_result,transcript_document_id,created_at')
    .eq('company_id',state.companyId)
    .eq('transcript_document_id',id)
    .in('status',['failed','blocked','revision_requested'])
    .order('created_at',{ascending:false})
    .limit(5);
  if(error){console.error('Diagnosis recovery lookup failed',error);return null}
  return (data||[]).find(run=>!run.analysis_result)||null;
}

async function openRecovery(run){
  if(!run)return false;
  for(let i=0;i<12;i++){
    const button=document.querySelector(`.diagnosis-review-btn[data-id="${CSS.escape(run.id)}"]`);
    if(button){button.click();return true}
    window.NexusDiagnosisController?.normalizeIntake?.();
    await delay(70);
  }
  if(window.NexusDiagnosisController?.openRun){await window.NexusDiagnosisController.openRun(run);return true}
  return false;
}

async function handleQueue(){
  if(busy)return;
  busy=true;
  try{
    const id=transcriptId();
    const unresolved=await latestUnresolvedForTranscript(id);
    if(unresolved){
      toast?.('This transcript already has a diagnosis issue. Opening the recovery step instead of creating another failed run.');
      if(!await openRecovery(unresolved))toast?.('The diagnosis issue is saved, but the recovery panel did not finish loading. Refresh once and try Resolve diagnosis issue again.');
      return;
    }
    if(window.NexusDiagnosisController?.securedQueue)return await window.NexusDiagnosisController.securedQueue();
    toast?.('Diagnosis controls are still loading. Wait a moment and try again.');
  }catch(error){console.error('Diagnosis recovery flow failed',error);toast?.(error.message||'Diagnosis could not be opened.')}finally{busy=false}
}

document.addEventListener('click',event=>{
  const queue=event.target.closest?.('#queueDiagnosisBtn');
  if(!queue)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  handleQueue();
},true);

window.NexusDiagnosisRecovery={handleQueue,openRecovery};
