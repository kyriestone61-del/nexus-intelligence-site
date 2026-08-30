const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let runs=new Map(),loading=false,scheduled=false;

async function load(){
 if(!state.admin||!state.companyId||loading)return;loading=true;
 try{
   const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,analysis_result,updated_at').eq('company_id',state.companyId).order('created_at',{ascending:false});
   if(error)throw error;runs=new Map((data||[]).map(r=>[r.id,r]));enhance();
 }catch(error){console.error('Diagnosis result capture load failed',error)}finally{loading=false}
}
function rawResult(run){const r=run?.analysis_result;if(!r)return '';if(typeof r==='string')return r;return String(r.raw_text||r.text||r.summary||'')}
function enhance(){
 scheduled=false;if(!state.admin)return;
 document.querySelectorAll('.diagnosis-run-card').forEach(card=>{
   const id=card.querySelector('.copy-agent-packet')?.dataset.id,run=runs.get(id);if(!id||!run)return;
   let wrap=card.querySelector('.diagnosis-result-capture');if(!wrap){wrap=document.createElement('div');wrap.className='diagnosis-result-capture';card.querySelector('.diagnosis-run-actions')?.before(wrap)}
   const text=rawResult(run),approved=run.status==='approved';
   wrap.innerHTML=`<div class="kicker">Diagnosis output</div><p class="small">Current shadow-mode workflow: copy the agent packet, run it in ChatGPT, then paste the completed diagnosis here so it stays with the client record.</p><textarea data-diagnosis-output="${id}" placeholder="Paste the Client Diagnosis Agent output here...">${esc(text)}</textarea><div class="actions"><button class="btn secondary" data-save-diagnosis="${id}" type="button">${text?'Update diagnosis output':'Save diagnosis output'}</button><button class="btn primary" data-approve-diagnosis="${id}" type="button" ${text?'':'disabled'}>${approved?'Diagnosis approved ✓':'Approve diagnosis →'}</button></div>${approved?'<div class="small">Approved diagnosis is now the gate that unlocks Step 4.</div>':''}`;
 });
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{enhance();setTimeout(load,40)})}
async function save(id,button){
 const card=button.closest('.diagnosis-run-card'),textarea=card?.querySelector(`[data-diagnosis-output="${id}"]`),text=textarea?.value.trim();if(!text)return toast('Paste the diagnosis output before saving.');
 button.disabled=true;const original=button.textContent;button.textContent='Saving…';
 try{
   const result={raw_text:text,source:'manual_shadow_agent_run',captured_at:new Date().toISOString()};
   const {error}=await sb.from('nexus_diagnosis_runs').update({analysis_result:result,status:'in_review',updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;
   toast('Diagnosis output saved. Review it, then approve the diagnosis.');window.dispatchEvent(new CustomEvent('nexus:diagnosis-updated'));await load();
 }catch(error){console.error(error);toast(error.message||'Diagnosis output could not be saved.')}finally{if(button.isConnected){button.disabled=false;button.textContent=original}}
}
async function approve(id,button){
 const run=runs.get(id);if(!rawResult(run))return toast('Save the diagnosis output before approving it.');
 if(!confirm('Approve this diagnosis and unlock solution planning?'))return;
 button.disabled=true;const original=button.textContent;button.textContent='Approving…';
 try{const {error}=await sb.from('nexus_diagnosis_runs').update({status:'approved',updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;toast('Diagnosis approved. Step 4 is now ready.');window.dispatchEvent(new CustomEvent('nexus:diagnosis-updated'));await load()}catch(error){console.error(error);toast(error.message||'Diagnosis could not be approved.')}finally{if(button.isConnected){button.disabled=false;button.textContent=original}}
}

document.addEventListener('click',event=>{if(!state.admin)return;const b=event.target.closest('button');if(!b)return;if(b.dataset.saveDiagnosis){event.preventDefault();return save(b.dataset.saveDiagnosis,b)}if(b.dataset.approveDiagnosis){event.preventDefault();return approve(b.dataset.approveDiagnosis,b)}},true);
document.addEventListener('change',event=>{const sel=event.target.closest?.('.diagnosis-status-select');if(!sel||!state.admin||sel.value!=='approved')return;const run=runs.get(sel.dataset.id);if(rawResult(run))return;event.preventDefault();event.stopImmediatePropagation();sel.value=run?.status||'ready_for_analysis';toast('Save a diagnosis output before marking this run approved.');},true);
window.addEventListener('focus',schedule);document.addEventListener('click',()=>setTimeout(schedule,70));window.addEventListener('nexus:diagnosis-updated',schedule);setTimeout(load,250);setTimeout(load,1000);