import {buildDiscoveryPacket} from './portal-discovery-capture.js';

const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast,workspace}=portal;
const byId=id=>document.getElementById(id);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let queueBusy=false;
let journeyScheduled=false;
let latestCache={companyId:null,projectId:null,run:null,at:0};
const CACHE_MS=1800;

const company=()=>state.companies?.find(c=>c.id===state.companyId)||null;
const project=()=>window.NexusFoundationHardening?.activeProject?.()||state.projects?.[0]||null;
const evidenceDocs=()=>[...(state.docs||[])].filter(d=>!project()?.id||!d.project_id||d.project_id===project().id).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
const transcriptDocs=()=>evidenceDocs().filter(d=>d.category==='Discovery Transcript'||/\.(srt|vtt)$/i.test(d.file_name||''));
const hasClientDiscoveryResponse=()=>[...(state.tasks||[])].some(t=>t.task_type==='discovery_information_request'&&t.response_data&&Object.keys(t.response_data||{}).some(k=>k!=='client_note'&&String(t.response_data[k]??'').trim()));
const hasResult=run=>{const r=run?.analysis_result;return !!r&&(typeof r==='string'?!!r.trim():Object.keys(r||{}).length>0)};
const canOpenDirectly=run=>!!run&&(['queued','analyzing','ready_for_analysis','ready_for_review','in_review','revision_requested','blocked','failed','approved'].includes(run.status)||hasResult(run));

function invalidateLatest(){latestCache={companyId:null,projectId:null,run:null,at:0}}
async function latestRun({force=false}={}){
  if(!state.admin||!state.companyId)return null;const p=project();if(!p?.id)return null;
  if(!force&&latestCache.companyId===state.companyId&&latestCache.projectId===p.id&&Date.now()-latestCache.at<CACHE_MS)return latestCache.run;
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,analysis_result,execution_error,analysis_completed_at,queued_at,updated_at,created_at,project_id').eq('company_id',state.companyId).eq('project_id',p.id).neq('status','archived').neq('status','draft').order('created_at',{ascending:false}).limit(1);
  if(error)throw error;const run=data?.[0]||null;latestCache={companyId:state.companyId,projectId:p.id,run,at:Date.now()};return run;
}
async function loadRun(id){const {data,error}=await sb.from('nexus_diagnosis_runs').select('*').eq('id',id).single();if(error)throw error;return data}

async function ensureCurrentAdminContext(){
  const typed=byId('adminContextText')?.value?.trim()||'';
  const current=window.NexusAdminIntake?.latestAdminContext?.()||null;
  if(typed&&typed!==String(current?.content||'').trim())return await window.NexusAdminIntake?.captureDiscoveryContext?.({silent:true})||current;
  return current;
}
async function createQueuedRun(){
  const c=company(),p=project();if(!c?.id)throw new Error('Select a client company first.');if(!p?.id)throw new Error('Set the active client engagement before running diagnosis.');
  const docs=evidenceDocs(),adminContext=await ensureCurrentAdminContext();
  if(!docs.length&&!adminContext?.content&&!hasClientDiscoveryResponse())throw new Error('Add evidence, admin context, or a completed client discovery response before running diagnosis.');
  const transcript=transcriptDocs()[0]||null;
  const now=new Date().toISOString();
  const packet=buildDiscoveryPacket({
    draft:{notes:adminContext?.content||''},company:c,project:p,evidence:docs,mode:'secured_execution',capturedAt:now,adminContext
  });
  const row={
    company_id:c.id,project_id:p.id,agent_code:'client_diagnosis',status:'queued',queued_at:now,
    transcript_document_id:transcript?.id||null,supporting_document_ids:docs.map(d=>d.id),
    discovery_notes:adminContext?.content||null,analysis_packet:packet,created_by:state.user.id,updated_at:now
  };
  const {data,error}=await sb.from('nexus_diagnosis_runs').insert(row).select('id,status').single();if(error)throw error;return data;
}
async function executeExisting(id){
  if(!id)return;toast?.('Diagnosis analysis started.');
  const {data,error}=await sb.functions.invoke('nexus-diagnosis-execute',{body:{run_id:id}});
  if(error||data?.ok===false)throw new Error(data?.error||error?.message||'Diagnosis execution failed.');
  invalidateLatest();window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));await workspace?.();await window.NexusAdminIntake?.refresh?.({reload:true});
  toast?.('Diagnosis is ready for review.');const run=await loadRun(id);await openRun(run);return run;
}
async function securedQueue({forceNew=false}={}){
  if(queueBusy)return;if(!state.admin||!state.companyId)return toast?.('Select a client company first.');queueBusy=true;
  const button=byId('queueDiagnosisBtn');if(button){button.disabled=true;button.textContent='Analyzing…'}
  try{
    const current=await latestRun({force:true});
    if(!forceNew&&current){
      if(['queued','analyzing'].includes(current.status)){toast?.('A diagnosis is already running. Opening its status.');return await openRun(current)}
      if(['ready_for_review','in_review','approved'].includes(current.status)||hasResult(current)){toast?.('A diagnosis already exists. Opening the current result instead of creating a duplicate.');return await openRun(current)}
      if(['revision_requested','failed','blocked','ready_for_analysis'].includes(current.status)){toast?.('The existing diagnosis can be retried without creating a duplicate.');return await executeExisting(current.id)}
    }
    const created=await createQueuedRun();invalidateLatest();window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));await window.NexusAdminIntake?.refresh?.({reload:true});toast?.('Diagnosis queued. Nexus is analyzing all authorized evidence…');
    return await executeExisting(created.id);
  }catch(error){console.error('Diagnosis execution failed',error);toast?.(error.message||'Diagnosis could not be completed.');invalidateLatest();window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));await window.NexusAdminIntake?.refresh?.({reload:true});throw error}
  finally{queueBusy=false;if(button?.isConnected){button.disabled=false;button.textContent='Run Diagnosis'}}
}

async function openIntake(){
  const nav=document.querySelector('.side-nav button[data-section="intake"]');if(nav){nav.click();await delay(60);return true}
  const section=byId('section-intake');if(section){document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s===section));return true}
  toast?.('Discovery & Diagnosis is not available yet. Refresh once and try again.');return false;
}
async function openRun(run){
  if(!run)return openIntake();
  if(canOpenDirectly(run)&&window.NexusDiagnosisReviewRuntime?.openReview){await window.NexusDiagnosisReviewRuntime.openReview(run.id);return true}
  if(!await openIntake())return false;
  return true;
}
function diagnosisJourneyButton(button){if(!button?.closest?.('#adminJourneyRoot'))return false;const step=button.closest('.journey-step');if(step?.querySelector('h3')?.textContent?.trim()==='Discovery & Diagnosis')return true;const focus=button.closest('.journey-focus');return /Step\s*2\s*of\s*6/i.test(focus?.querySelector('.kicker')?.textContent||'')}
function labelFor(run){if(!run)return 'Open Discovery & Diagnosis →';if(run.status==='approved'&&hasResult(run))return 'View Approved Diagnosis →';if(['queued','analyzing'].includes(run.status))return 'View Diagnosis Status →';if(['failed','blocked','revision_requested','ready_for_analysis'].includes(run.status))return 'Resolve Diagnosis Issue →';if(['ready_for_review','in_review'].includes(run.status)||hasResult(run))return 'Review Diagnosis →';return 'Open Discovery & Diagnosis →'}
function applyJourneyLabels(run){
  const root=byId('adminJourneyRoot');if(!root)return;const label=labelFor(run);
  const step=[...root.querySelectorAll('.journey-step')].find(x=>x.querySelector('h3')?.textContent?.trim()==='Discovery & Diagnosis');step?.querySelectorAll('button').forEach(button=>{if(!button.hasAttribute('data-current-records'))button.textContent=label});
  const focus=root.querySelector('.journey-focus');if(/Step\s*2\s*of\s*6/i.test(focus?.querySelector('.kicker')?.textContent||'')){const primary=focus.querySelector('button[data-primary-action]');if(primary)primary.textContent=label}
}
async function refreshJourneyLabels({force=false}={}){try{applyJourneyLabels(await latestRun({force}))}catch(error){console.error('Diagnosis journey refresh failed',error)}}
function scheduleJourney(){if(journeyScheduled)return;journeyScheduled=true;setTimeout(async()=>{journeyScheduled=false;await refreshJourneyLabels()},160)}
function normalizeIntake(){const run=latestCache.run;const btn=byId('queueDiagnosisBtn');if(btn&&run&&['queued','analyzing'].includes(run.status)){btn.disabled=true;btn.textContent='Analyzing…'}}

document.addEventListener('click',event=>{
  const queue=event.target.closest?.('#queueDiagnosisBtn');if(queue){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();securedQueue().catch(()=>{});return}
  const button=event.target.closest?.('button');if(diagnosisJourneyButton(button)){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();latestRun({force:true}).then(run=>run?openRun(run):openIntake()).catch(error=>toast?.(error.message||'Diagnosis could not be opened.'));return}
  if(button?.dataset?.section==='intake'||button?.closest?.('.side-nav'))setTimeout(scheduleJourney,60);
},true);
byId('companySelect')?.addEventListener('change',()=>{invalidateLatest();setTimeout(()=>refreshJourneyLabels({force:true}),220)});
window.addEventListener('nexus:diagnosis-changed',()=>{invalidateLatest();setTimeout(()=>refreshJourneyLabels({force:true}),120)});
window.addEventListener('focus',()=>setTimeout(()=>refreshJourneyLabels(),160));
for(const ms of [0,180,600])setTimeout(()=>refreshJourneyLabels(),ms);

window.NexusDiagnosisController={normalizeIntake,refreshJourneyLabels,latestRun,openRun,securedQueue,executeExisting,invalidateLatest,existingRunForTranscript:async()=>null};
