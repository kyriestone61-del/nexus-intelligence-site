const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');

const {sb,state,toast}=portal;
const byId=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let queueBusy=false;
let journeyRefreshBusy=false;
let intakeObserver=null;
let journeyObserver=null;
let normalizeScheduled=false;
let journeyScheduled=false;

const company=()=>state.companies?.find(c=>c.id===state.companyId)||null;
const project=()=>state.projects?.[0]||null;
const transcriptDocs=()=>[...(state.docs||[])].filter(d=>d.category==='Discovery Transcript').sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
const selectedEvidence=()=>[...document.querySelectorAll('.diagnosis-supporting-doc:checked')].map(x=>x.value);
const hasResult=run=>{const r=run?.analysis_result;return !!r&&(typeof r==='string'?!!r.trim():Object.keys(r||{}).length>0)};
const providerMissing=run=>String(run?.execution_error||'').includes('AI_GATEWAY_NOT_CONFIGURED');

function resolveTranscriptId(){
  const selected=selectedEvidence();
  const docs=transcriptDocs();
  const explicit=byId('diagnosisTranscriptDoc')?.value||'';
  if(explicit&&docs.some(d=>d.id===explicit))return explicit;
  const selectedTranscript=selected.find(id=>docs.some(d=>d.id===id));
  return selectedTranscript||docs[0]?.id||null;
}

function syncTranscriptSelection(){
  const id=resolveTranscriptId();
  if(!id)return null;
  const select=byId('diagnosisTranscriptDoc');
  if(select&&!select.value&&[...select.options].some(o=>o.value===id))select.value=id;
  const box=document.querySelector(`.diagnosis-supporting-doc[value="${CSS.escape(id)}"]`);
  if(box&&!box.checked)box.checked=true;
  return id;
}

function setHTML(node,html){if(node&&node.innerHTML!==html)node.innerHTML=html}
function normalizeCards(){
  document.querySelectorAll('.diagnosis-run-card').forEach(card=>{
    const statusEl=card.querySelector('.diagnosis-status');if(!statusEl)return;
    const status=[...statusEl.classList].find(x=>['queued','analyzing','ready_for_review','revision_requested','blocked','approved','failed','archived','ready_for_analysis','in_review'].includes(x))||String(statusEl.textContent||'').trim().toLowerCase().replaceAll(' ','_');
    const select=card.querySelector('.diagnosis-status-select');
    const id=select?.dataset.id||card.querySelector('[data-id]')?.dataset.id;
    select?.remove();
    card.querySelectorAll('.copy-agent-packet').forEach(x=>x.remove());
    let action=card.querySelector('.diagnosis-secure-action');
    if(!action&&id){action=document.createElement('div');action.className='diagnosis-secure-action';card.querySelector('.diagnosis-run-actions')?.appendChild(action)}
    if(!action)return;
    let html='';
    if(status==='queued')html='<span class="small">Queued for diagnosis analysis.</span>';
    else if(status==='analyzing')html='<span class="small">Analyzing authorized evidence…</span>';
    else if(status==='ready_for_analysis')html=`<button class="btn primary diagnosis-retry-btn" data-id="${esc(id)}" type="button">Run diagnosis →</button>`;
    else if(['ready_for_review','in_review'].includes(status))html=`<button class="btn primary diagnosis-review-btn" data-id="${esc(id)}" type="button">Review diagnosis →</button>`;
    else if(status==='approved')html=`<button class="btn secondary diagnosis-review-btn" data-id="${esc(id)}" type="button">View diagnosis →</button>`;
    else if(['failed','blocked','revision_requested'].includes(status))html=`<button class="btn secondary diagnosis-review-btn" data-id="${esc(id)}" type="button">Resolve diagnosis issue →</button>`;
    else html='<span class="small">Archived</span>';
    setHTML(action,html);
  });
  const help=document.querySelector('.admin-intake-help');
  setHTML(help,'<b>Execution boundary:</b> Diagnosis reads only the evidence selected here. The result remains an internal draft until a Nexus admin reviews it. Approval never sends external communications or changes client systems automatically.');
}

function normalizeIntake(){
  syncTranscriptSelection();
  normalizeCards();
  attachScopedObservers();
}

function scheduleNormalize(){
  if(normalizeScheduled)return;
  normalizeScheduled=true;
  requestAnimationFrame(()=>{normalizeScheduled=false;normalizeIntake()});
}

async function latestRun(){
  if(!state.admin||!state.companyId)return null;
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,analysis_result,execution_error,transcript_document_id,created_at').eq('company_id',state.companyId).order('created_at',{ascending:false}).limit(1);
  if(error)throw error;
  return data?.[0]||null;
}

async function reusableProviderFailure(transcriptId){
  if(!transcriptId||!state.companyId)return null;
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,analysis_result,execution_error,transcript_document_id,created_at').eq('company_id',state.companyId).in('status',['failed','blocked']).order('created_at',{ascending:false}).limit(8);
  if(error)return null;
  return (data||[]).find(run=>run.transcript_document_id===transcriptId&&providerMissing(run))||null;
}

async function securedQueue(){
  if(queueBusy)return;
  if(!state.admin||!state.companyId)return toast?.('Select a client company first.');
  normalizeIntake();
  const transcriptId=resolveTranscriptId();
  const selected=selectedEvidence();
  if(transcriptId&&!selected.includes(transcriptId))selected.unshift(transcriptId);
  const notes=byId('intakeNotes')?.value?.trim()||'';
  const transcript=byId('intakeTranscriptText')?.value?.trim()||'';
  if(!transcriptId&&!transcript&&!notes)return toast?.('No diagnosis evidence was found. Add a transcript or discovery notes first.');

  const existing=await reusableProviderFailure(transcriptId);
  if(existing){
    toast?.('Transcript found. The automatic provider is still unavailable, so Nexus is opening the saved diagnosis issue instead of creating a duplicate run.');
    return openRun(existing);
  }

  const c=company(),p=project(),docs=(state.docs||[]).filter(d=>selected.includes(d.id));
  const packet={
    version:3,
    company:{id:c?.id||state.companyId,name:c?.name||'',industry:c?.industry||'',website:c?.website||''},
    project:{id:p?.id||null,name:p?.name||'',service_type:p?.service_type||''},
    agent:{code:'client_diagnosis',mode:'secured_execution',permission_level:'draft_only'},
    meeting:{date:byId('intakeMeetingDate')?.value||null,participants:byId('intakeParticipants')?.value?.trim()||null},
    discovery_notes:notes||null,
    transcript_text:transcript||null,
    evidence_manifest:docs.map(d=>({id:d.id,file_name:d.file_name,category:d.category,note:d.note||null,created_at:d.created_at})),
    required_output:['facts','client_statements','inferences','unknowns','process_map','bottlenecks','baseline_gaps','baseline_measurements','opportunity_backlog','risks','follow_up_questions','smallest_safe_pilot','nexus_actions','client_action_items','document_requests','decision_items'],
    prohibited_actions:['send emails','contact anyone','modify client systems','make purchases','publish content','change permissions','take external action without explicit approval']
  };
  const row={company_id:state.companyId,project_id:p?.id||null,agent_code:'client_diagnosis',status:'queued',queued_at:new Date().toISOString(),transcript_document_id:transcriptId,supporting_document_ids:selected,meeting_date:packet.meeting.date,participants:packet.meeting.participants,discovery_notes:notes||null,analysis_packet:packet,created_by:state.user.id,updated_at:new Date().toISOString()};
  const button=byId('queueDiagnosisBtn');
  queueBusy=true;if(button){button.disabled=true;button.textContent='Analyzing…'}
  let created=null;
  try{
    const {data:createdRow,error}=await sb.from('nexus_diagnosis_runs').insert(row).select('id').single();if(error)throw error;created=createdRow;
    toast?.('Diagnosis queued.');
    const result=await sb.functions.invoke('nexus-diagnosis-execute',{body:{run_id:created.id}});
    const invokeError=result.error;const invocationData=result.data;
    if(invokeError||invocationData?.ok===false)throw new Error(invocationData?.error||invokeError?.message||'Diagnosis execution failed.');
    sessionStorage.setItem('nexus_diagnosis_open_after_reload',created.id);
    window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));
    toast?.('Diagnosis ready for review.');
    setTimeout(()=>location.reload(),220);
  }catch(error){
    const message=String(error?.message||'Diagnosis could not be completed.');
    if(created?.id){sessionStorage.setItem('nexus_diagnosis_open_after_reload',created.id);window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'))}
    toast?.(message.includes('AI_GATEWAY_NOT_CONFIGURED')?'Transcript accepted and saved. Automatic diagnosis is not connected yet; opening the manual diagnosis path.':message);
    if(created?.id)setTimeout(()=>location.reload(),420);
  }finally{
    queueBusy=false;if(button?.isConnected){button.disabled=false;button.textContent='Queue diagnosis →'}
  }
}

async function openIntake(){
  const nav=document.querySelector('.side-nav button[data-section="intake"]');
  if(nav){nav.click();await delay(80);normalizeIntake();return true}
  const section=byId('section-intake');
  if(section){document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s===section));normalizeIntake();return true}
  toast?.('Discovery & Diagnosis is not available yet. Refresh once and try again.');
  return false;
}

async function loadRun(id){
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,analysis_result,execution_error,transcript_document_id,created_at').eq('id',id).single();
  if(error)throw error;return data;
}

async function openRun(run){
  if(!run)return openIntake();
  if(!await openIntake())return;
  normalizeIntake();
  const id=CSS.escape(run.id);
  for(let i=0;i<25;i++){
    normalizeIntake();
    if(run.status==='ready_for_analysis'){
      const retry=document.querySelector(`.diagnosis-retry-btn[data-id="${id}"]`);if(retry){retry.click();return}
    }
    if(['failed','blocked','revision_requested','ready_for_review','in_review','approved'].includes(run.status)||hasResult(run)){
      const review=document.querySelector(`.diagnosis-review-btn[data-id="${id}"]`);if(review){review.click();return}
    }
    const card=[...document.querySelectorAll('.diagnosis-run-card')].find(x=>x.querySelector(`[data-id="${id}"]`));
    if(card&&['queued','analyzing'].includes(run.status)){card.scrollIntoView({block:'center'});return}
    await delay(100);
  }
  toast?.('The diagnosis record is saved, but its review control did not finish loading. Refresh once and reopen Step 3.');
}

function diagnosisJourneyButton(button){
  if(!button?.closest?.('#adminJourneyRoot'))return false;
  const step=button.closest('.journey-step');
  if(step?.querySelector('h3')?.textContent?.trim()==='Diagnose')return true;
  const focus=button.closest('.journey-focus');
  return /Step\s*3\s*of\s*7/i.test(focus?.querySelector('.kicker')?.textContent||'');
}

function labelFor(run){
  if(!run)return 'Start Diagnosis →';
  if(run.status==='approved'&&hasResult(run))return 'View Diagnosis →';
  if(['queued','analyzing'].includes(run.status))return 'View Diagnosis Status →';
  if(run.status==='ready_for_analysis')return 'Run Diagnosis →';
  if(['failed','blocked','revision_requested'].includes(run.status))return 'Resolve Diagnosis Issue →';
  if(['ready_for_review','in_review'].includes(run.status)||hasResult(run))return 'Review Diagnosis →';
  return 'Open Diagnosis →';
}

function applyJourneyLabels(run){
  const root=byId('adminJourneyRoot');if(!root)return;
  const label=labelFor(run);
  const step=[...root.querySelectorAll('.journey-step')].find(x=>x.querySelector('h3')?.textContent?.trim()==='Diagnose');
  step?.querySelectorAll('button').forEach(button=>{if(!button.hasAttribute('data-current-records'))button.textContent=label});
  const focus=root.querySelector('.journey-focus');
  if(/Step\s*3\s*of\s*7/i.test(focus?.querySelector('.kicker')?.textContent||'')){
    const primary=focus.querySelector('button[data-primary-action]');if(primary)primary.textContent=label;
  }
}

async function refreshJourneyLabels(){
  if(journeyRefreshBusy)return;
  journeyRefreshBusy=true;
  try{applyJourneyLabels(await latestRun())}catch(error){console.error('Diagnosis journey refresh failed',error)}finally{journeyRefreshBusy=false}
}
function scheduleJourney(){
  if(journeyScheduled)return;
  journeyScheduled=true;
  requestAnimationFrame(()=>{journeyScheduled=false;refreshJourneyLabels()});
}

function attachScopedObservers(){
  const intake=byId('section-intake');
  if(intake&&intakeObserver?.target!==intake){
    intakeObserver?.observer?.disconnect();
    const observer=new MutationObserver(scheduleNormalize);observer.observe(intake,{childList:true,subtree:true});intakeObserver={observer,target:intake};
  }
  const journey=byId('adminJourneyRoot');
  if(journey&&journeyObserver?.target!==journey){
    journeyObserver?.observer?.disconnect();
    const observer=new MutationObserver(scheduleJourney);observer.observe(journey,{childList:true,subtree:true});journeyObserver={observer,target:journey};
  }
}

async function handlePendingOpen(){
  const id=sessionStorage.getItem('nexus_diagnosis_open_after_reload');if(!id)return;
  sessionStorage.removeItem('nexus_diagnosis_open_after_reload');
  try{await delay(350);await openRun(await loadRun(id))}catch(error){console.error('Could not reopen diagnosis after execution',error)}
}

document.addEventListener('click',event=>{
  const queue=event.target.closest?.('#queueDiagnosisBtn');
  if(queue){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();securedQueue();return}
  const button=event.target.closest?.('button');
  if(diagnosisJourneyButton(button)){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    latestRun().then(openRun).catch(error=>toast?.(error.message||'Diagnosis could not be opened.'));
    return;
  }
  if(button?.dataset?.section==='intake'||button?.closest?.('.side-nav'))setTimeout(scheduleNormalize,60);
},true);

byId('companySelect')?.addEventListener('change',()=>{setTimeout(()=>{normalizeIntake();refreshJourneyLabels()},220)});
window.addEventListener('nexus:diagnosis-changed',()=>{setTimeout(()=>{normalizeIntake();refreshJourneyLabels()},100)});
window.addEventListener('focus',()=>setTimeout(()=>{normalizeIntake();refreshJourneyLabels()},100));

for(const ms of [0,120,350,800])setTimeout(()=>{attachScopedObservers();normalizeIntake();refreshJourneyLabels()},ms);
setTimeout(handlePendingOpen,700);

window.NexusDiagnosisController={normalizeIntake,refreshJourneyLabels,latestRun,openRun,securedQueue};
