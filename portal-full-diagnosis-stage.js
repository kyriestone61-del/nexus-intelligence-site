import {persistEvidence} from './portal-evidence-upload.js';
import {currentTranscript,transcriptDocuments,transcriptSelectionKey} from './portal-journey-steps.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function selectedTranscript(portal,snapshot){return currentTranscript(portal.state,snapshot?.project_id,portal.runtime.storage.get(transcriptSelectionKey(portal.state.companyId,snapshot?.project_id),null),snapshot?.diagnosis);}
export function mountFullDiagnosisStage(root,portal,{navigate,onChange=async()=>{}}){
  let snapshot=null,company=null,busy=false,message='',failed=false;
  const selected=()=>selectedTranscript(portal,snapshot);
  function render(){
    if(!snapshot)return;
    const retained=!!snapshot.discovery_id,transcript=selected(),docs=transcriptDocuments(portal.state,snapshot.project_id,snapshot.diagnosis).filter(d=>/\.(pdf|docx|txt|md|srt|vtt)$/i.test(d.file_name||'')),admin=portal.state.admin,readOnly=portal.state.previewReadOnly;
    const run=snapshot.diagnosis||{},access=!!run.access,processing=['queued','analyzing','processing'].includes(run.status),hasResult=['approved','ready_for_review','in_review','review_required'].includes(run.status);
    root.innerHTML=`<div class="relystra-transcript-stage"><header><div class="eyebrow">Step 4 · Full Diagnosis</div><h1>Continue to Full Diagnosis.</h1><p>Upload the transcript from this client's meeting, or select one already saved. You can start diagnosis here after it is saved and diagnosis access is confirmed.</p></header>
    <section class="relystra-build-card"><form data-transcript-upload><label>Meeting transcript<input type="file" name="transcript" accept=".pdf,.docx,.txt,.md,.srt,.vtt" required ${readOnly?'disabled':''}></label><p>PDF, DOCX, TXT, Markdown, SRT or VTT · up to 25 MB.</p><button class="btn ${transcript?'secondary':'primary'}" type="submit" ${readOnly?'disabled':''}>Upload meeting transcript</button></form>
    ${docs.length?`<label>Use an existing transcript<select data-transcript-select ${readOnly?'disabled':''}><option value="">Choose a saved file</option>${docs.map(d=>`<option value="${esc(d.id)}" ${transcript?.id===d.id?'selected':''}>${esc(d.file_name)}</option>`).join('')}</select></label>`:''}
    ${transcript?`<p><b>Transcript ready:</b> ${esc(transcript.file_name)}</p>`:retained?'<p>The original Discovery transcript is retained. Relystra can use it for Full Diagnosis and add supporting evidence.</p>':'<p>No transcript selected yet. A failed upload will not complete this step.</p>'}
    <p data-transcript-message role="${failed?'alert':'status'}" ${message?'':'hidden'}>${esc(message)}</p></section>
    <section class="relystra-build-card"><h2>${hasResult?'Continue with your diagnosis':processing?'Diagnosis is running':'Run Diagnosis'}</h2><p><b>Who acts next:</b> ${admin?'Relystra administrator':'Relystra'}</p>
    ${!access?'<p>Diagnosis access has not been confirmed for this workspace. Review setup and payment first; your uploaded transcript remains saved.</p><button class="btn primary" type="button" data-transcript-setup>Review setup & access</button>':processing?'<p>The current analysis is in progress. Refresh its status; do not start another run.</p><button class="btn primary" type="button" data-transcript-next>View diagnosis status</button>':hasResult?'<p>The existing diagnosis is ready to revisit. Opening it does not create another AI run.</p><button class="btn primary" type="button" data-transcript-next>Continue to diagnosis & approval</button>':admin?`<p>Analyze the selected transcript together with the authorized supporting evidence. Then review, edit and approve the deeper findings.</p><button class="btn primary" type="button" data-transcript-run ${transcript||retained?'':'disabled'}>${['failed','blocked','revision_requested'].includes(run.status)?'Retry existing diagnosis':'Run Diagnosis'}</button>`:'<p>Relystra will run and review the diagnosis. Your released findings will appear in the next step.</p><button class="btn primary" type="button" data-transcript-next>Continue to diagnosis status</button>'}</section></div>`;
    root.querySelector('[data-transcript-setup]')?.addEventListener('click',()=>navigate('overview'));
    root.querySelector('[data-transcript-next]')?.addEventListener('click',()=>navigate('diagnosis'));
    root.querySelector('[data-transcript-run]')?.addEventListener('click',runDiagnosis);
    root.querySelector('[data-transcript-upload]')?.addEventListener('submit',upload);
    root.querySelector('[data-transcript-select]')?.addEventListener('change',async event=>{const doc=docs.find(d=>d.id===event.target.value);if(!doc)return;portal.runtime.storage.set(transcriptSelectionKey(company,snapshot.project_id),doc.id);message='Saved transcript selected. Continue below.';failed=false;render();await onChange()});
  }
  async function upload(event){
    event.preventDefault();if(busy||portal.state.previewReadOnly)return;
    const file=event.target.elements.transcript.files[0];if(!file)return;
    if(!/\.(pdf|docx|txt|md|srt|vtt)$/i.test(file.name)){message='Choose a supported transcript file.';failed=true;render();return}
    busy=true;const owner=company,project=snapshot.project_id,button=event.submitter;button.disabled=true;button.textContent='Saving transcript…';
    try{
      const document=await persistEvidence(portal.sb,{file,companyId:owner,userId:portal.state.user.id,projectId:project||null,category:'Discovery Transcript',sourceRole:portal.state.admin?'nexus':'client'});
      if(portal.state.companyId!==owner)return;
      portal.state.docs=[document,...portal.state.docs.filter(d=>d.id!==document.id)];
      portal.runtime.storage.set(transcriptSelectionKey(owner,project),document.id);
      try{await portal.log?.('document_uploaded','document',document.id,'Meeting transcript uploaded in the client journey')}catch{}
      message='Transcript saved. Continue with Run Diagnosis below.';failed=false;
      await onChange();
    }catch(error){if(portal.state.companyId===owner){message=error.message||'Transcript upload failed. Try again; this step is not complete.';failed=true}}
    finally{if(company===owner){busy=false;if(failed){button.disabled=false;button.textContent='Upload meeting transcript';const status=root.querySelector('[data-transcript-message]');status.hidden=false;status.setAttribute('role','alert');status.textContent=message}else render()}}
  }
  async function runDiagnosis(){
    if(busy||!portal.state.admin||!snapshot.diagnosis?.access||(!selected()&&!snapshot.discovery_id))return;
    busy=true;const owner=company,button=root.querySelector('[data-transcript-run]');button.disabled=true;button.textContent='Diagnosis in progress…';
    const status=root.querySelector('[data-transcript-message]');status.hidden=false;status.textContent='Analyzing the saved transcript and authorized evidence. Stay here; no additional run is needed.';
    try{await portal.sb.rpc('relystra_workspace_snapshot',{p_company_id:owner,p_project_id:snapshot.project_id||null}).then(({data,error})=>{if(error)throw error;if(!data?.diagnosis?.access)throw new Error('Diagnosis access is not confirmed. Return to setup before running diagnosis.')});
      if(portal.state.companyId!==owner)return;
      if(!selected()&&snapshot.discovery_id){
        const {data,error}=await portal.sb.from('nexus_discovery_requests').select('discovery_transcript').eq('id',snapshot.discovery_id).eq('company_id',owner).single();
        if(error||!data?.discovery_transcript)throw new Error('Retained Discovery transcript could not be loaded.');
        const file=new File([data.discovery_transcript],'Original Discovery transcript.txt',{type:'text/plain'});
        const document=await persistEvidence(portal.sb,{file,companyId:owner,userId:portal.state.user.id,projectId:snapshot.project_id,category:'Discovery Transcript',sourceRole:'nexus'});
        if(portal.state.companyId!==owner)return;
        portal.state.docs=[document,...portal.state.docs.filter(d=>d.id!==document.id)];
        portal.runtime.storage.set(transcriptSelectionKey(owner,snapshot.project_id),document.id);
      }
      await window.NexusDiagnosisController.securedQueue();
      if(portal.state.companyId===owner){message='Diagnosis status updated. Continue to review its current state.';failed=false;await onChange();await navigate('diagnosis')}
    }catch(error){if(portal.state.companyId===owner){message=error.message||'Diagnosis failed. Your transcript is saved. Review status and retry the existing run.';failed=true;try{await onChange()}catch{}}}
    finally{if(company===owner){busy=false;render()}}
  }
  return {refresh(value){snapshot=value;if(company!==portal.state.companyId){company=portal.state.companyId;message='';failed=false;busy=false}if(!busy)render()},destroy(){root.replaceChildren()}};
}
