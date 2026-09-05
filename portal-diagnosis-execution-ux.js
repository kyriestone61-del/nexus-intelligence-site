const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');
const {sb,state,toast}=portal;
let executionBusy=false;
const confirmedRelease=new WeakSet();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showProgress(button){
  const body=document.getElementById('diagnosisReviewBody');
  button.disabled=true;button.dataset.originalLabel=button.textContent||'Run secured diagnosis →';button.textContent='Analyzing…';
  body?.querySelector('.note.error')?.remove();
  const status=body?.querySelector('.diagnosis-review-meta .diagnosis-status');if(status){status.className='diagnosis-status analyzing';status.textContent='Analyzing'}
  let panel=body?.querySelector('.diagnosis-live-progress');
  if(!panel&&body){panel=document.createElement('div');panel.className='diagnosis-live-progress note';body.querySelector('.diagnosis-review-meta')?.after(panel)}
  if(panel)panel.innerHTML='<b>Secured diagnosis is running.</b><br><span class="small">Relystra is analyzing only the authorized evidence. This can take about 1–2 minutes. Keep this screen open; no client communication or external action occurs.</span>';
}
function clearProgress(button){
  const body=document.getElementById('diagnosisReviewBody');body?.querySelector('.diagnosis-live-progress')?.remove();
  if(button?.isConnected){button.disabled=false;button.textContent=button.dataset.originalLabel||'Run secured diagnosis →';delete button.dataset.originalLabel}
}
async function executeDiagnosis(button){
  if(executionBusy)return;
  const id=button?.dataset?.id;if(!id)return;
  executionBusy=true;showProgress(button);toast?.('Secured diagnosis started. Analysis is running…');
  try{
    const {data,error}=await sb.functions.invoke('nexus-diagnosis-execute',{body:{run_id:id}});
    if(error||data?.ok===false)throw new Error(data?.error||error?.message||'Diagnosis execution failed.');
    window.NexusDiagnosisController?.invalidateLatest?.();
    sessionStorage.setItem('nexus_diagnosis_open_after_reload',id);
    toast?.('Diagnosis completed. Opening the review…');
    setTimeout(()=>location.reload(),180);
  }catch(error){
    console.error('Secured diagnosis execution failed',error);
    const message=String(error?.message||'Diagnosis execution failed.');
    toast?.(message);
    try{
      const {data:run}=await sb.from('nexus_diagnosis_runs').select('id,status,analysis_result,execution_error,created_at').eq('id',id).single();
      if(run){window.NexusDiagnosisController?.invalidateLatest?.();sessionStorage.setItem('nexus_diagnosis_open_after_reload',id);setTimeout(()=>location.reload(),220)}
    }catch{}
  }finally{executionBusy=false;clearProgress(button)}
}

function releaseNeedsConfirmation(button){
  const label=String(button?.textContent||'').trim().toLowerCase();
  return label.includes('send request to client')||label.includes('release to client')||label.includes('send client checklist');
}
function confirmRelease(button,event){
  if(!releaseNeedsConfirmation(button)||confirmedRelease.has(button))return false;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  const ok=window.confirm('Release this item to the client workspace?\n\nThis makes the item client-visible and creates a client notification. It does not authorize any other external action.');
  if(ok){confirmedRelease.add(button);button.click();queueMicrotask(()=>confirmedRelease.delete(button))}
  return true;
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('button');if(!button)return;
  if(confirmRelease(button,event))return;
  const retry=button.closest?.('.diagnosis-retry-btn');
  if(!retry||!state.admin)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();executeDiagnosis(retry);
},true);

window.NexusDiagnosisExecutionUX={executeDiagnosis};
