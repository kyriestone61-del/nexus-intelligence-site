const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');
const {sb,state,toast,workspace}=portal;
if(!state?.admin)throw new Error('Diagnosis Output Hub is admin-only.');

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const dt=v=>v?new Date(v).toLocaleString():'—';
const done=s=>['complete','completed','done','approved','implemented'].includes(String(s||'').toLowerCase());
const OUTPUT_ORDER=['metrics','projects','approvals','milestones','nexus_tasks','opportunities','client_actions','document_requests'];
const LABELS={metrics:'Metrics',projects:'Project',approvals:'Approvals',milestones:'Milestones',nexus_tasks:'Relystra Tasks',opportunities:'Opportunities',client_actions:'Client Actions',document_requests:'Document Requests'};
let currentRun=null,currentKind='opportunities',data={},loading=false,scheduled=false;

function ensureCss(){
  if(document.getElementById('nexusDiagnosisOutputHubCss'))return;
  const link=document.createElement('link');link.id='nexusDiagnosisOutputHubCss';link.rel='stylesheet';link.href='/portal-diagnosis-output-hub.css?v=20260901-step4';document.head.appendChild(link);
}
ensureCss();

async function syncActiveProject(){
  try{
    const project=await window.NexusFoundationHardening?.syncActiveEngagement?.();
    if(project&&state.projects?.[0]?.id!==project.id)await workspace?.();
    return project;
  }catch(error){console.error('Diagnosis output active-project sync failed',error);return null}
}

async function latestRun(){
  if(!state.companyId)return null;
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,company_id,project_id,status,orchestrated_at,orchestration_summary,approved_at,analysis_result').eq('company_id',state.companyId).eq('status','approved').not('orchestrated_at','is',null).order('approved_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;return data||null;
}
async function query(table,columns,runId,order='created_at',ascending=true){
  let q=sb.from(table).select(columns).eq('source_diagnosis_run_id',runId);
  if(order)q=q.order(order,{ascending});
  const {data,error}=await q;if(error)throw error;return data||[];
}
async function loadOutputs(runId=null){
  if(loading)return data;loading=true;
  try{
    currentRun=runId?await (async()=>{const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,company_id,project_id,status,orchestrated_at,orchestration_summary,approved_at,analysis_result').eq('id',runId).single();if(error)throw error;return data})():await latestRun();
    if(!currentRun){data={};return data}
    const id=currentRun.id;
    const [metrics,projects,approvals,milestones,tasks,opportunities,documents]=await Promise.all([
      query('nexus_metrics','id,name,unit,baseline_value,current_value,target_value,notes,evidence,confidence,created_at',id,'created_at',true),
      query('nexus_projects','id,name,summary,status,service_type,project_type,created_at',id,'created_at',true),
      query('nexus_approvals','id,title,description,status,approval_type,approval_chain_id,created_at',id,'created_at',true),
      query('nexus_milestones','id,title,description,status,sort_order,due_date,created_at',id,'sort_order',true),
      query('nexus_tasks','id,title,description,assignee,status,priority,due_date,notify_client,created_at,completed_at',id,'created_at',true),
      query('nexus_opportunities','id,title,problem,status,value_score,effort_score,readiness_score,recommendation,created_at',id,'value_score',false),
      query('nexus_document_requests','id,title,purpose,examples,redaction_guidance,sensitivity,status,owner_scope,due_date,created_at',id,'created_at',true)
    ]);
    const chainIds=approvals.map(x=>x.approval_chain_id).filter(Boolean);
    let chains=[];
    if(chainIds.length){const r=await sb.from('nexus_approval_chains').select('id,status,visibility,current_step,updated_at').in('id',chainIds);if(r.error)throw r.error;chains=r.data||[]}
    const chainById=Object.fromEntries(chains.map(x=>[x.id,x]));
    data={metrics,projects,approvals:approvals.map(x=>({...x,chain:chainById[x.approval_chain_id]||null})),milestones,nexus_tasks:tasks.filter(x=>x.assignee==='nexus'),client_actions:tasks.filter(x=>x.assignee==='client'),opportunities,document_requests:documents};
    return data;
  }finally{loading=false}
}

function ensureSection(){
  let section=document.getElementById('section-diagnosis-outputs');
  if(section)return section;
  section=document.createElement('section');section.id='section-diagnosis-outputs';section.className='section diagnosis-output-section';section.innerHTML='<div id="diagnosisOutputRoot"></div>';document.querySelector('.main')?.prepend(section);return section;
}
function activateSection(){
  const section=ensureSection();document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s===section));document.querySelectorAll('.side-nav button').forEach(b=>b.classList.remove('active'));window.scrollTo({top:0,left:0,behavior:'auto'});
}
function backToJourney(){
  document.querySelector('#diagnosisReviewModal #closeDiagnosisReview')?.click();
  const b=document.querySelector('.journey-primary');if(b)b.click();else toast?.('Client Journey is not available yet. Refresh the workspace once.');
}
function statusPill(status){return `<span class="output-status ${done(status)?'done':''}">${esc(String(status||'open').replaceAll('_',' '))}</span>`}
function metricValue(v,unit){return v==null||v===''?'—':`${esc(v)}${unit?` ${esc(unit)}`:''}`}

function renderMetrics(){return data.metrics?.length?`<div class="output-list">${data.metrics.map(x=>`<article class="output-card"><div class="output-card-top"><div><div class="kicker">${esc(x.confidence||'unrated')} confidence</div><h3>${esc(x.name)}</h3></div></div><div class="output-metric-row"><div><span>Baseline</span><b>${metricValue(x.baseline_value,x.unit)}</b></div><div><span>Current</span><b>${metricValue(x.current_value,x.unit)}</b></div><div><span>Target</span><b>${metricValue(x.target_value,x.unit)}</b></div></div>${x.notes?`<p>${esc(x.notes)}</p>`:''}${x.evidence?`<small>Evidence: ${esc(x.evidence)}</small>`:''}</article>`).join('')}</div>`:'<div class="empty">No diagnosis metrics were generated.</div>'}
function renderProjects(){return data.projects?.length?`<div class="output-list">${data.projects.map(x=>`<article class="output-card"><div class="output-card-top"><div><div class="kicker">${esc(x.service_type||'Implementation project')}</div><h3>${esc(x.name)}</h3></div>${statusPill(x.status)}</div><p>${esc(x.summary||'')}</p><div class="actions"><button class="btn primary" data-open-section="timeline" type="button">Open project & milestones →</button></div></article>`).join('')}</div>`:'<div class="empty">No generated implementation project was found.</div>'}
function renderApprovals(){return data.approvals?.length?`<div class="output-list">${data.approvals.map(x=>{const cs=x.chain?.status||x.status;return `<article class="output-card"><div class="output-card-top"><div><div class="kicker">Client decision</div><h3>${esc(x.title)}</h3></div>${statusPill(cs)}</div><p>${esc(x.description||'')}</p><div class="actions">${x.approval_chain_id&&cs==='draft'?`<button class="btn primary" data-send-approval="${esc(x.approval_chain_id)}" type="button">Send to client Inbox →</button>`:x.approval_chain_id&&['pending','changes_requested'].includes(cs)?`<button class="btn secondary" data-open-approval="${esc(x.approval_chain_id)}" type="button">Open in Inbox →</button>`:'<span class="small">This decision is not waiting for a send action.</span>'}</div></article>`}).join('')}</div>`:'<div class="empty">No diagnosis decisions were generated.</div>'}
function renderMilestones(){return data.milestones?.length?`<div class="output-list">${data.milestones.map((x,i)=>`<article class="output-card output-milestone"><div class="output-index">${done(x.status)?'✓':i+1}</div><div><div class="output-card-top"><h3>${esc(x.title)}</h3>${statusPill(x.status)}</div><p>${esc(x.description||'')}</p>${x.due_date?`<small>Due ${esc(dt(x.due_date))}</small>`:''}</div></article>`).join('')}</div>`:'<div class="empty">No milestones were generated.</div>'}
function renderNexusTasks(){return data.nexus_tasks?.length?`<div class="output-list">${data.nexus_tasks.map(x=>`<article class="output-card output-check-card ${done(x.status)?'complete':''}"><button class="output-check" data-complete-task="${esc(x.id)}" type="button" ${done(x.status)?'disabled':''} aria-label="${done(x.status)?'Completed':'Mark complete'}">${done(x.status)?'✓':''}</button><div><div class="output-card-top"><h3>${esc(x.title)}</h3>${statusPill(x.status)}</div><p>${esc(x.description||'')}</p><small>${esc(x.priority||'normal')} priority${x.due_date?` · due ${esc(x.due_date)}`:''}</small></div></article>`).join('')}</div>`:'<div class="empty">No Relystra-owned diagnosis tasks were generated.</div>'}
function renderClientActions(){return data.client_actions?.length?`<div class="output-list">${data.client_actions.map(x=>`<article class="output-card"><div class="output-card-top"><div><div class="kicker">Client action · routed to client Inbox</div><h3>${esc(x.title)}</h3></div>${statusPill(x.status)}</div><p>${esc(x.description||'')}</p><div class="actions"><button class="btn secondary" data-open-task="${esc(x.id)}" type="button">Open action record →</button></div></article>`).join('')}</div>`:'<div class="empty">No client actions were generated.</div>'}
function renderOpportunities(){return data.opportunities?.length?`<div class="output-list">${data.opportunities.map(x=>`<article class="output-card opportunity ${x.status==='approved'?'selected':''}"><div class="output-card-top"><div><div class="kicker">Value ${esc(x.value_score??'—')} · Effort ${esc(x.effort_score??'—')} · Readiness ${esc(x.readiness_score??'—')}</div><h3>${esc(x.title)}</h3></div>${statusPill(x.status)}</div><p>${esc(x.problem||'')}</p>${x.recommendation?`<div class="output-recommendation"><b>Relystra recommendation</b><span>${esc(x.recommendation)}</span></div>`:''}<div class="actions">${x.status==='approved'?'<span class="output-selected-label">✓ Selected to proceed</span>':`<button class="btn primary" data-opportunity-status="approved" data-id="${esc(x.id)}" type="button">Proceed with this →</button>`}${x.status!=='declined'?`<button class="btn secondary" data-opportunity-status="declined" data-id="${esc(x.id)}" type="button">Do not proceed</button>`:''}</div></article>`).join('')}</div>`:'<div class="empty">No opportunities were generated.</div>'}
function renderDocuments(){return data.document_requests?.length?`<div class="output-list">${data.document_requests.map(x=>`<article class="output-card"><div class="output-card-top"><div><div class="kicker">Evidence request</div><h3>${esc(x.title)}</h3></div>${statusPill(x.status)}</div><p>${esc(x.purpose||'')}</p>${x.examples?`<small>Example: ${esc(x.examples)}</small>`:''}<div class="output-owner"><label>Who must provide this?</label><select data-document-owner="${esc(x.id)}"><option value="client" ${x.owner_scope==='client'?'selected':''}>Client — show in client Inbox</option><option value="nexus" ${x.owner_scope==='nexus'?'selected':''}>Relystra — show in my Inbox</option></select></div></article>`).join('')}</div>`:'<div class="empty">No document requests were generated.</div>'}
function contentFor(kind){return ({metrics:renderMetrics,projects:renderProjects,approvals:renderApprovals,milestones:renderMilestones,nexus_tasks:renderNexusTasks,opportunities:renderOpportunities,client_actions:renderClientActions,document_requests:renderDocuments}[kind]||renderOpportunities)()}
function count(kind){return arr(data[kind]).length}

function render(){
  const root=document.getElementById('diagnosisOutputRoot');if(!root)return;
  const project=data.projects?.[0];
  root.innerHTML=`<div class="output-hero"><div><div class="eyebrow">Step 4 workspace · generated from approved diagnosis</div><h1>Choose what moves forward.</h1><p>Review the records created from the diagnosis. Opportunities stay internal. Client actions are already routed to the client. Decisions remain drafts until you send them.</p></div><button class="btn secondary" data-back-journey type="button">← Client Journey</button></div>
  <div class="output-step4-strip"><div><b>1</b><span>Select opportunities to proceed with.</span></div><div><b>2</b><span>Send only the decisions the client must approve.</span></div><div><b>3</b><span>Confirm actions, evidence ownership, and milestones.</span></div><button class="btn primary" data-start-step4 type="button">Start Step 4 plan →</button></div>
  ${project?`<div class="output-project-context"><span>Active implementation project</span><b>${esc(project.name)}</b>${statusPill(project.status)}</div>`:''}
  <div class="output-tabs">${OUTPUT_ORDER.map(k=>`<button class="${currentKind===k?'active':''}" data-output-tab="${k}" type="button"><b>${count(k)}</b><span>${esc(LABELS[k])}</span></button>`).join('')}</div>
  <section class="output-content"><div class="output-content-head"><div><div class="kicker">${esc(LABELS[currentKind])}</div><h2>${esc(LABELS[currentKind])}</h2></div></div>${contentFor(currentKind)}</section>`;
  bindRoot(root);
}

function openSupportSection(section,id=null){
  const b=document.querySelector(`.side-nav button[data-section="${section}"]`);if(b)b.click();else document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${section}`));
  if(id)setTimeout(()=>{const target=document.querySelector(`[data-task-id="${CSS.escape(id)}"]`);target?.scrollIntoView({behavior:'smooth',block:'center'})},250);
}
async function sendApproval(id,button){
  button.disabled=true;button.textContent='Sending…';
  const {error}=await sb.rpc('nexus_start_approval_chain',{p_chain_id:id});
  if(error){button.disabled=false;button.textContent='Send to client Inbox →';return toast?.(error.message)}
  toast?.('Decision sent to the client Inbox.');await loadOutputs(currentRun.id);render();
}
async function completeTask(id,button){
  button.disabled=true;const {error}=await sb.rpc('nexus_admin_set_task_status',{p_task_id:id,p_status:'completed',p_note:'Completed from diagnosis output workspace'});if(error){button.disabled=false;return toast?.(error.message)}
  toast?.('Relystra task completed.');await workspace?.();await loadOutputs(currentRun.id);render();
}
async function updateOpportunity(id,status,button){
  button.disabled=true;const {error}=await sb.from('nexus_opportunities').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error){button.disabled=false;return toast?.(error.message)}
  toast?.(status==='approved'?'Opportunity selected to proceed.':'Opportunity marked do not proceed.');await loadOutputs(currentRun.id);render();
}
async function updateDocumentOwner(id,owner,select){
  select.disabled=true;const {error}=await sb.from('nexus_document_requests').update({owner_scope:owner,updated_at:new Date().toISOString()}).eq('id',id);select.disabled=false;if(error)return toast?.(error.message);toast?.(owner==='client'?'Request routed to the client Inbox.':'Request routed to your Relystra Inbox.');await loadOutputs(currentRun.id);render();
}
function openApproval(id){location.href=`/portal?view=inbox&approval_chain=${encodeURIComponent(id)}`}
async function startStep4(){
  await syncActiveProject();backToJourney();setTimeout(()=>{const primary=document.getElementById('journeyPrimaryAction');if(primary)primary.click();else toast?.('Step 4 is ready. Open Client Journey and choose Start this step.')},450);
}
function bindRoot(root){
  root.querySelector('[data-back-journey]')?.addEventListener('click',backToJourney);
  root.querySelector('[data-start-step4]')?.addEventListener('click',startStep4);
  root.querySelectorAll('[data-output-tab]').forEach(b=>b.onclick=()=>{currentKind=b.dataset.outputTab;render()});
  root.querySelectorAll('[data-send-approval]').forEach(b=>b.onclick=()=>sendApproval(b.dataset.sendApproval,b));
  root.querySelectorAll('[data-open-approval]').forEach(b=>b.onclick=()=>openApproval(b.dataset.openApproval));
  root.querySelectorAll('[data-complete-task]').forEach(b=>b.onclick=()=>completeTask(b.dataset.completeTask,b));
  root.querySelectorAll('[data-opportunity-status]').forEach(b=>b.onclick=()=>updateOpportunity(b.dataset.id,b.dataset.opportunityStatus,b));
  root.querySelectorAll('[data-document-owner]').forEach(s=>s.onchange=()=>updateDocumentOwner(s.dataset.documentOwner,s.value,s));
  root.querySelectorAll('[data-open-task]').forEach(b=>b.onclick=()=>openSupportSection('tasks',b.dataset.openTask));
  root.querySelectorAll('[data-open-section]').forEach(b=>b.onclick=()=>openSupportSection(b.dataset.openSection));
}
async function open(kind='opportunities',runId=null){
  currentKind=OUTPUT_ORDER.includes(kind)?kind:'opportunities';activateSection();const root=document.getElementById('diagnosisOutputRoot');root.innerHTML='<div class="empty">Loading generated diagnosis records…</div>';
  try{await syncActiveProject();await loadOutputs(runId);render()}catch(error){console.error('Diagnosis outputs failed to load',error);root.innerHTML=`<div class="note error"><b>Generated records could not load.</b><br>${esc(error.message||'Refresh and try again.')}</div>`}
}

function kindFromLabel(label){const normalized=String(label||'').trim().toLowerCase().replaceAll(' ','_');if(normalized==='project'||normalized==='projects')return'projects';return OUTPUT_ORDER.find(k=>normalized===k)||null}
function enhanceGenerated(){
  const generated=document.querySelector('#diagnosisReviewModal .diagnosis-generated');if(!generated)return;
  generated.querySelectorAll('.diagnosis-counts > span').forEach(span=>{
    if(span.dataset.outputKind)return;const b=span.querySelector('b');const label=(span.textContent||'').replace(b?.textContent||'','').trim();const kind=kindFromLabel(label);if(!kind)return;span.dataset.outputKind=kind;span.setAttribute('role','button');span.setAttribute('tabindex','0');span.setAttribute('aria-label',`Open ${LABELS[kind]||label}`);
  });
  const actions=generated.querySelector('.actions');if(actions&&!actions.dataset.step4Enhanced){actions.dataset.step4Enhanced='1';actions.innerHTML='<button class="btn secondary" data-open-generated-workspace type="button">Open generated workspace →</button><button class="btn primary" data-continue-step4 type="button">Continue to Step 4 →</button>'}
}
function enhanceJourney(){
  const root=document.getElementById('adminJourneyRoot');if(!root||root.querySelector('.diagnosis-step4-guide'))return;
  const kicker=root.querySelector('.journey-focus .kicker')?.textContent||'';if(!/Step 4 of 7/i.test(kicker))return;
  const focus=root.querySelector('.journey-focus');if(!focus)return;const card=document.createElement('section');card.className='diagnosis-step4-guide';card.innerHTML='<div><div class="kicker">Step 4 made simple</div><h3>Review → choose → send → start the plan.</h3><p>The approved diagnosis already created the implementation project, opportunities, milestones, tasks, client actions, evidence requests, metrics, and draft decisions. Review those outputs first; then start the standard Step 4 planning actions.</p></div><div class="actions"><button class="btn primary" data-step4-workspace type="button">Open Step 4 workspace →</button><button class="btn secondary" data-step4-start type="button">Start Step 4 actions →</button></div>';focus.after(card);card.querySelector('[data-step4-workspace]').onclick=()=>open('opportunities');card.querySelector('[data-step4-start]').onclick=()=>document.getElementById('journeyPrimaryAction')?.click();
}
function scheduleEnhance(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhanceGenerated();enhanceJourney()})}

async function openFounderDecision(id,card){
  try{
    const {data:decision,error}=await sb.from('nexus_founder_decision_queue').select('id,title,source_ref').eq('id',id).single();if(error)throw error;
    await window.NexusRevenueEngine?.show?.();await window.NexusRevenueEngine?.refresh?.();
    let target=null;
    if(String(decision.source_ref||'').startsWith('outreach_packet:')){
      const packetId=decision.source_ref.split(':')[1];const p=await sb.from('nexus_outreach_packets').select('id,lead_id').eq('id',packetId).single();if(!p.error&&p.data?.lead_id){const l=await sb.from('nexus_revenue_leads').select('company_name').eq('id',p.data.lead_id).single();if(!l.error)target=[...document.querySelectorAll('.revenue-packet')].find(x=>(x.querySelector('h3')?.textContent||'').includes(l.data.company_name))}
    }
    if(!target)target=[...document.querySelectorAll('.revenue-decision')].find(x=>x.querySelector('b')?.textContent?.trim()===decision.title);
    setTimeout(()=>{target?.classList.add('diagnosis-output-focus');target?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>target?.classList.remove('diagnosis-output-focus'),1800)},80);
  }catch(error){console.error('Founder decision routing failed',error);toast?.(error.message||'Decision could not be opened.')}
}

document.addEventListener('click',event=>{
  const generated=event.target.closest?.('#diagnosisReviewModal .diagnosis-generated');
  const tile=event.target.closest?.('[data-output-kind]');if(generated&&tile){event.preventDefault();open(tile.dataset.outputKind);return}
  if(generated&&event.target.closest?.('[data-open-generated-workspace]')){event.preventDefault();open('opportunities');return}
  if(generated&&event.target.closest?.('[data-continue-step4]')){event.preventDefault();startStep4();return}
  const inboxButton=event.target.closest?.('[data-inbox-open]');const key=inboxButton?.dataset?.inboxOpen||'';if(key.startsWith('founder:')){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openFounderDecision(key.slice('founder:'.length),inboxButton.closest('.nexus-inbox-card'));return}
},true);
document.addEventListener('keydown',event=>{const tile=event.target.closest?.('[data-output-kind]');if(tile&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open(tile.dataset.outputKind)}});
window.addEventListener('nexus:diagnosis-changed',async()=>{await syncActiveProject();scheduleEnhance()});
const observer=new MutationObserver(scheduleEnhance);observer.observe(document.body,{childList:true,subtree:true});
for(const ms of [0,150,500,1200])setTimeout(scheduleEnhance,ms);
window.NexusDiagnosisOutputs={open,load:loadOutputs,syncActiveProject,startStep4};
