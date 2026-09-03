import {buildDiscoveryPacket} from './portal-discovery-capture.js';

const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,$,toast,workspace,log,downloadDocument}=portal;
const BUCKET='nexus-client-documents';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const dt=v=>v?new Date(v).toLocaleString():'—';
const safeName=name=>String(name||'file').replace(/[^a-zA-Z0-9._-]/g,'_');
const formatBytes=v=>{const n=Number(v||0);if(!n)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`};
const complete=s=>['completed','approved','done','not_applicable'].includes(String(s||''));
let diagnosisRuns=[];
let gapAnalyses=[];
let contextEntries=[];
let discoveryTasks=[];
let lastCompanyId=null;
let loading=false;

const company=()=>state.companies?.find(c=>c.id===state.companyId)||null;
const project=()=>window.NexusFoundationHardening?.activeProject?.()||state.projects?.[0]||null;
const evidenceDocs=()=>[...(state.docs||[])].filter(d=>!project()?.id||!d.project_id||d.project_id===project().id).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
const latestContext=()=>contextEntries.find(x=>x.is_current)||contextEntries[0]||null;
const latestGap=()=>gapAnalyses[0]||null;
const latestRun=()=>diagnosisRuns.find(r=>!['draft','archived'].includes(r.status))||null;
const latestResponseAt=()=>Math.max(0,...discoveryTasks.filter(t=>t.response_data&&Object.keys(t.response_data||{}).length).map(t=>Date.parse(t.updated_at||t.created_at||'')||0));
const latestInputAt=()=>Math.max(0,...evidenceDocs().map(d=>Date.parse(d.evidence_ingested_at||d.created_at||'')||0),...contextEntries.map(c=>Date.parse(c.created_at||'')||0),latestResponseAt());
const gapIsStale=()=>!!latestGap()&&latestInputAt()>(Date.parse(latestGap().created_at||'')||0);
const diagnosisIsStale=()=>!!latestRun()?.analysis_completed_at&&latestInputAt()>(Date.parse(latestRun().analysis_completed_at||'')||0);

function ensureModeChrome(){
  const topbar=document.querySelector('.topbar');if(!topbar)return;
  let badge=$('accountModeBadge');
  if(!badge){badge=document.createElement('span');badge.id='accountModeBadge';badge.className='account-mode-badge';topbar.querySelector('.pill')?.after(badge)}
  badge.textContent=state.admin?'NEXUS ADMIN ACCOUNT':'CLIENT ACCOUNT';badge.classList.toggle('admin',!!state.admin);badge.classList.toggle('client',!state.admin);
  let link=$('adminConsoleLink');
  if(state.admin){if(!link){link=document.createElement('a');link.id='adminConsoleLink';link.className='btn secondary admin-console-link';link.href='/operations';link.textContent='Admin Console →';$('companySelect')?.after(link)}link.style.display='inline-flex';document.title='Nexus Admin Client Workspace | Nexus Intelligence'}
  else{if(link)link.style.display='none';document.title='Client Control Room | Nexus Intelligence'}
}
function openSection(name){
  document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${name}`));window.scrollTo(0,0);
}
function ensureAdminIntake(){
  const nav=document.querySelector('.side-nav'),main=document.querySelector('.main');if(!nav||!main)return;
  let button=document.querySelector('.side-nav button[data-section="intake"]'),section=$('section-intake');
  if(!state.admin){button?.remove();section?.remove();return}
  if(!button){button=document.createElement('button');button.type='button';button.dataset.section='intake';button.textContent='Discovery & Diagnosis';document.querySelector('.side-nav button[data-section="overview"]')?.after(button);button.addEventListener('click',()=>openSection('intake'))}
  else button.textContent='Discovery & Diagnosis';
  if(!section){section=document.createElement('section');section.id='section-intake';section.className='section admin-intake-section nexus-step2-v2';$('section-overview')?.after(section)}
}

async function loadStep2Data(){
  if(!state.admin||!state.companyId||loading)return;loading=true;
  try{
    const p=project();
    const contexts=sb.from('nexus_discovery_context_entries').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}).limit(30);
    const gaps=sb.from('nexus_discovery_gap_analyses').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}).limit(10);
    const runs=sb.from('nexus_diagnosis_runs').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}).limit(30);
    const tasks=sb.from('nexus_tasks').select('id,title,status,form_schema,response_data,created_at,updated_at,project_id,source_gap_analysis_id').eq('company_id',state.companyId).eq('task_type','discovery_information_request').order('created_at',{ascending:false}).limit(30);
    if(p?.id){contexts.eq('project_id',p.id);gaps.eq('project_id',p.id);runs.eq('project_id',p.id)}
    const [cr,gr,rr,tr]=await Promise.all([contexts,gaps,runs,tasks]);
    if(cr.error)throw cr.error;if(gr.error)throw gr.error;if(rr.error)throw rr.error;if(tr.error)throw tr.error;
    contextEntries=cr.data||[];gapAnalyses=gr.data||[];diagnosisRuns=rr.data||[];discoveryTasks=(tr.data||[]).filter(t=>!p?.id||!t.project_id||t.project_id===p.id);
  }catch(error){console.error('Step 2 data load failed',error);toast?.(error.message||'Discovery & Diagnosis data could not be loaded.')}
  finally{loading=false}
}

function evidenceMarkup(){
  const docs=evidenceDocs();
  if(!docs.length)return '<div class="step2-empty"><b>No evidence added yet.</b><span>Add the materials that best show how this client actually operates. A transcript is optional.</span></div>';
  return `<div class="step2-evidence-list">${docs.map(d=>{
    const summary=d.evidence_summary?`<div class="step2-evidence-summary">${esc(d.evidence_summary)}</div>`:'';
    const parser=d.evidence_parser?` · ${esc(d.evidence_parser)}`:'';
    return `<article class="step2-evidence-row"><div class="step2-evidence-icon">${/image/i.test(d.mime_type||'')?'IMG':'DOC'}</div><div class="step2-evidence-copy"><b>${esc(d.file_name)}</b><small>${esc(d.category||'Evidence')} · ${esc(dt(d.created_at))}${d.size_bytes?' · '+esc(formatBytes(d.size_bytes)):''}${parser}</small>${summary}</div><button class="btn secondary step2-download" data-doc="${esc(d.id)}" type="button">Open</button></article>`
  }).join('')}</div>`;
}
function gapMarkup(){
  const gap=latestGap(),result=gap?.result||{},gaps=arr(result.gaps),stale=gapIsStale();
  if(!gap)return `<div class="step2-inline-state"><b>Ready to check coverage.</b><span>Nexus will compare the evidence already collected against the reusable Discovery Framework and surface only material information that is still missing.</span></div><button id="runGapAnalysisBtn" class="btn primary" type="button">Analyze Missing Information</button>`;
  if(!gaps.length)return `<div class="step2-inline-state success"><b>No material discovery gaps found.</b><span>${esc(result.summary||'The current evidence is sufficient for a bounded diagnosis.')}</span></div><div class="step2-actions"><button id="runGapAnalysisBtn" class="btn secondary" type="button">${stale?'Refresh Gap Analysis':'Recheck Coverage'}</button></div>`;
  return `<div class="step2-gap-summary"><div><b>${gaps.length}</b><span>material gap${gaps.length===1?'':'s'}</span></div><p>${esc(result.summary||'Nexus found information that could materially improve diagnosis confidence.')}${stale?' <b>New evidence has been added since this analysis.</b>':''}</p></div><div class="step2-actions"><button id="reviewGapsBtn" class="btn primary" type="button">Review Missing Information</button><button id="runGapAnalysisBtn" class="btn secondary" type="button">${stale?'Refresh Gap Analysis':'Recheck Coverage'}</button></div><div id="gapRequestEditor" class="step2-gap-editor" hidden>${gapEditorMarkup(gaps)}</div>`;
}
function gapEditorMarkup(gaps){
  return `<div class="step2-editor-head"><div><div class="kicker">Client request</div><h3>Send only what is still needed</h3><p class="small">Nexus generated these from the evidence gaps. Edit the wording, deselect anything unnecessary, then send.</p></div></div>${gaps.map((g,i)=>`<label class="step2-gap-item"><input class="step2-gap-check" type="checkbox" data-index="${i}" checked><span><b>${esc(g.domain||'Discovery gap')}</b><textarea class="step2-gap-question" data-index="${i}">${esc(g.question||'')}</textarea><small>${esc(g.reason||'')}${g.desired_evidence?` · Useful evidence: ${esc(g.desired_evidence)}`:''}</small></span></label>`).join('')}<div class="step2-actions"><button id="sendGapRequestBtn" class="btn primary" type="button">Send Request</button><button id="cancelGapRequestBtn" class="btn secondary" type="button">Cancel</button></div>`;
}
function contextMarkup(){
  const ctx=latestContext(),run=latestRun();
  return `<div class="field"><label for="adminContextText">What should Nexus know that the files or client answers may not show?</label><textarea id="adminContextText" class="step2-context" placeholder="Add observations, priorities, constraints, exceptions, ownership details, or other context. Nexus will treat this as ADMIN CONTEXT—not as a verified fact.">${esc(ctx?.content||'')}</textarea></div><div class="step2-actions"><button id="saveAdminContextBtn" class="btn secondary" type="button">Save Brief</button>${run?'<button id="runUpdatedDiagnosisBtn" class="btn secondary" type="button">Run Updated Diagnosis</button>':''}</div><div id="contextStatus" class="step2-save-status">${ctx?`Saved ${esc(dt(ctx.created_at))}. This context will be included in the next diagnosis run.`:'Not saved yet.'}</div>`;
}
function executionMarkup(){
  const docs=evidenceDocs(),gap=latestGap(),gapResult=gap?.result||{},run=latestRun();
  const responseCount=discoveryTasks.filter(t=>t.response_data&&Object.keys(t.response_data||{}).length).length;
  const contextCount=latestContext()?1:0;
  const sourceCount=docs.length+responseCount+contextCount;
  const sufficient=gap?gapResult.sufficient_for_diagnosis===true:sourceCount>0;
  const stale=diagnosisIsStale();
  if(run&&['queued','analyzing'].includes(run.status))return `<div class="step2-diagnosis-ready"><b>${run.status==='queued'?'Diagnosis queued.':'Analyzing authorized evidence…'}</b><span>Nexus is processing ${sourceCount} available source${sourceCount===1?'':'s'}. The state will move to Ready for Review when analysis finishes.</span></div>`;
  if(run?.status==='ready_for_review')return `<div class="step2-diagnosis-ready success"><b>Diagnosis ready for review.</b><span>${stale?'New information has arrived since this run. Review it, or run an updated diagnosis.':'Review the evidence-backed findings before approval.'}</span></div><div class="step2-actions"><button id="reviewDiagnosisBtn" class="btn primary" type="button">Review Diagnosis</button>${stale?'<button id="runUpdatedDiagnosisBtn" class="btn secondary" type="button">Run Updated Diagnosis</button>':''}</div>`;
  if(run?.status==='approved')return `<div class="step2-diagnosis-ready success"><b>Diagnosis approved.</b><span>${stale?'New information has arrived since approval. Run an updated diagnosis if it materially changes the current state.':'The approved diagnosis is now the root record for downstream work.'}</span></div><div class="step2-actions"><button id="reviewDiagnosisBtn" class="btn secondary" type="button">View Diagnosis</button>${stale?'<button id="runUpdatedDiagnosisBtn" class="btn primary" type="button">Run Updated Diagnosis</button>':''}</div>`;
  if(run&&['failed','blocked','revision_requested','ready_for_analysis'].includes(run.status))return `<div class="step2-diagnosis-ready warning"><b>Diagnosis needs attention.</b><span>${esc(run.execution_error||'The run can be retried without losing the evidence already collected.')}</span></div><div class="step2-actions"><button id="retryDiagnosisBtn" class="btn primary" type="button">Retry Diagnosis</button><button id="reviewDiagnosisBtn" class="btn secondary" type="button">Review Status</button></div>`;
  return `<div class="step2-diagnosis-ready ${sufficient?'success':''}"><b>Evidence ready: ${sourceCount} source${sourceCount===1?'':'s'}.</b><span>${gap?(sufficient?'Nexus has sufficient information to perform a bounded diagnosis.':`Nexus still sees ${arr(gapResult.gaps).length} material gap${arr(gapResult.gaps).length===1?'':'s'}. You can close them first or run a diagnosis that preserves those unknowns.`):'Run Information Gaps first for the strongest diagnosis coverage.'}</span></div><div class="step2-actions"><button id="queueDiagnosisBtn" class="btn primary" type="button" ${sourceCount?'':'disabled'}>Run Diagnosis</button></div>`;
}
function score(v){return v===null||v===undefined||v===''?'—':esc(v)}
function diagnosisMarkup(run){
  const r=run?.analysis_result||{};if(!run||!Object.keys(r).length)return '<div class="step2-empty"><b>No diagnosis has been run yet.</b><span>Add evidence and run the diagnosis to create structured findings.</span></div>';
  const claims=arr(r.claims).slice(0,18).map(c=>`<div class="step2-claim"><span class="claim-type claim-${esc(String(c.type||'unknown').toLowerCase().replaceAll(' ','-'))}">${esc(c.type||'UNKNOWN')}</span><p>${esc(c.statement||'')}</p>${arr(c.evidence_refs).length?`<small>Evidence: ${arr(c.evidence_refs).map(esc).join(' · ')}</small>`:''}</div>`).join('');
  const process=arr(r.process_map).map((p,i)=>`<article class="step2-process"><div class="kicker">${esc(p.name||`Process ${i+1}`)}</div><div class="step2-process-grid"><div><b>Trigger</b><span>${esc(p.trigger||'Unknown')}</span></div><div><b>Owner</b><span>${esc(p.owner||'Unknown')}</span></div><div><b>Inputs</b><span>${esc(arr(p.inputs).join(' · ')||'Unknown')}</span></div><div><b>Systems</b><span>${esc(arr(p.systems).join(' · ')||'Unknown')}</span></div><div><b>Handoffs</b><span>${esc(arr(p.handoffs).join(' · ')||'None confirmed')}</span></div><div><b>Delays</b><span>${esc(arr(p.delays).join(' · ')||'None confirmed')}</span></div><div><b>Exceptions</b><span>${esc(arr(p.exceptions).join(' · ')||'None confirmed')}</span></div><div><b>Output</b><span>${esc(p.output||'Unknown')}</span></div></div>${arr(p.steps).length?`<ol>${arr(p.steps).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}</article>`).join('');
  const bottlenecks=arr(r.bottlenecks).map(b=>`<article class="step2-finding"><b>${esc(b.title||'Bottleneck')}</b><p>${esc(b.description||'')}</p>${b.root_cause?`<small><b>Root cause:</b> ${esc(b.root_cause)}</small>`:''}<small>${esc(b.impact||'')}</small></article>`).join('');
  const roots=arr(r.root_causes).map(x=>`<article class="step2-finding"><b>${esc(x.title||'Root cause')}</b><p>${esc(x.description||'')}</p></article>`).join('');
  const baselines=arr(r.baseline_measurements).map(x=>`<article class="step2-finding"><b>${esc(x.name||'Baseline')}</b><p>${x.baseline_value===null||x.baseline_value===undefined||x.baseline_value===''?'Unknown':`${esc(x.baseline_value)} ${esc(x.unit||'')}`}</p><small>${esc(x.measurement_method||x.notes||'')}</small></article>`).join('');
  const opps=arr(r.opportunity_backlog).map(o=>`<article class="step2-opportunity"><div class="step2-opportunity-head"><div><div class="kicker">Priority ${esc(o.rank||'—')}</div><b>${esc(o.title||'Opportunity')}</b></div><div class="step2-score"><span>Impact ${score(o.impact_score||o.value_score)}</span><span>Feasibility ${score(o.feasibility_score||o.readiness_score)}</span><span>Cost ${score(o.cost_score||o.effort_score)}</span><span>Time ${score(o.time_to_value_score)}</span><span>Risk ${score(o.risk_score)}</span></div></div><p>${esc(o.problem||'')}</p><small>${esc(o.recommendation||'')}</small></article>`).join('');
  const unknowns=arr(r.unknowns).map(u=>`<article class="step2-finding"><b>${esc(u.question||'Unknown')}</b><p>${esc(u.why_it_matters||'')}</p></article>`).join('');
  const evidence=arr(r.evidence).map(e=>`<article class="step2-finding"><b>${esc(e.source_name||e.evidence_ref||'Evidence')}</b><p>${esc(arr(e.supports).join(' · '))}</p><small>${esc(e.evidence_ref||'')}</small></article>`).join('');
  const first=r.recommended_first_intervention||r.smallest_safe_pilot||{};
  return `<div class="step2-diagnosis-summary"><div class="kicker">Executive summary</div><p>${esc(r.executive_summary||r.current_state?.summary||'')}</p></div>
  <details class="step2-findings" open><summary>Current State</summary><div class="step2-findings-body"><p>${esc(r.current_state?.summary||'')}</p>${r.current_state?.operating_model?`<p><b>Operating model:</b> ${esc(r.current_state.operating_model)}</p>`:''}</div></details>
  <details class="step2-findings"><summary>Evidence & Claim Ledger</summary><div class="step2-findings-body"><div class="step2-claims">${claims||'<div class="empty">No claim ledger returned.</div>'}</div><div class="step2-finding-grid">${evidence}</div></div></details>
  <details class="step2-findings" open><summary>Process Map</summary><div class="step2-findings-body">${process||'<div class="empty">No process map returned.</div>'}</div></details>
  <details class="step2-findings" open><summary>Bottlenecks & Root Causes</summary><div class="step2-findings-body"><div class="step2-finding-grid">${bottlenecks}${roots}</div></div></details>
  <details class="step2-findings"><summary>Baseline</summary><div class="step2-findings-body"><div class="step2-finding-grid">${baselines||'<div class="empty">No defensible baseline was available.</div>'}</div></div></details>
  <details class="step2-findings" open><summary>Opportunities & Priorities</summary><div class="step2-findings-body">${opps||'<div class="empty">No opportunities returned.</div>'}</div></details>
  <details class="step2-findings"><summary>Unknowns</summary><div class="step2-findings-body"><div class="step2-finding-grid">${unknowns||'<div class="empty">No material unknowns returned.</div>'}</div></div></details>
  <section class="step2-first-intervention"><div class="kicker">Recommended First Intervention</div><h3>${esc(first.title||'Not defined')}</h3><p>${esc(first.summary||first.why_first||'')}</p>${first.success_metric?`<small><b>Success metric:</b> ${esc(first.success_metric)}</small>`:''}</section>`;
}
function reviewMarkup(){
  const run=latestRun();
  if(!run||!run.analysis_result)return '<div class="step2-empty"><b>No diagnosis is ready for review.</b><span>Run Diagnosis after evidence collection to populate this section.</span></div>';
  const actions=run.status==='ready_for_review'?`<div class="step2-review-actions"><button id="editDiagnosisBtn" class="btn secondary" type="button">Edit</button><button id="requestFurtherAnalysisBtn" class="btn secondary" type="button">Request Further Analysis</button><button id="approveDiagnosisBtn" class="btn primary" type="button">Approve Diagnosis</button></div><div id="furtherAnalysisPanel" class="step2-revision-panel" hidden><div class="field"><label for="furtherAnalysisNote">What should Nexus reconsider or analyze more deeply?</label><textarea id="furtherAnalysisNote" placeholder="Point to the finding, evidence, assumption, or missing angle that should be revisited."></textarea></div><button id="submitFurtherAnalysisBtn" class="btn primary" type="button">Run Further Analysis</button></div>`:`<div class="step2-review-actions"><button id="editDiagnosisBtn" class="btn secondary" type="button">View Full Diagnosis</button>${diagnosisIsStale()?'<button id="runUpdatedDiagnosisBtn" class="btn primary" type="button">Run Updated Diagnosis</button>':''}</div>`;
  return `${diagnosisMarkup(run)}${actions}`;
}
function historyMarkup(){
  const items=[];
  evidenceDocs().slice(0,12).forEach(d=>items.push({at:d.created_at,label:'Evidence added',text:d.file_name}));
  contextEntries.slice(0,8).forEach(c=>items.push({at:c.created_at,label:'Admin context saved',text:c.content.slice(0,120)+(c.content.length>120?'…':'')}));
  gapAnalyses.slice(0,5).forEach(g=>items.push({at:g.created_at,label:'Information gaps analyzed',text:`${arr(g.result?.gaps).length} material gap${arr(g.result?.gaps).length===1?'':'s'} identified`}));
  discoveryTasks.slice(0,8).forEach(t=>items.push({at:t.updated_at||t.created_at,label:'Client information request',text:complete(t.status)?'Client response completed':String(t.status||'sent').replaceAll('_',' ')}));
  diagnosisRuns.filter(r=>r.status!=='draft').slice(0,8).forEach(r=>items.push({at:r.updated_at||r.created_at,label:'Diagnosis',text:String(r.status||'').replaceAll('_',' ')}));
  items.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
  return items.length?`<div class="step2-history-list">${items.slice(0,20).map(x=>`<div><small>${esc(dt(x.at))}</small><b>${esc(x.label)}</b><span>${esc(x.text)}</span></div>`).join('')}</div>`:'<div class="empty">History begins when evidence, context, or a diagnosis run is added.</div>';
}
function renderAdminIntake(){
  const root=$('section-intake');if(!root||!state.admin)return;
  const c=company(),p=project();
  root.innerHTML=`<div class="admin-intake-banner step2-hero"><div><div class="eyebrow">STEP 2 · DISCOVERY & DIAGNOSIS</div><h1>Turn evidence into an approved diagnosis.</h1><p>Nexus handles the framework, provenance, gap detection, and agent orchestration behind the scenes. Your job is to review what is known, close material gaps, add context, run the diagnosis, and approve the result.</p></div><div class="step2-client"><span>Client</span><b>${esc(c?.name||'No company selected')}</b><small>${esc(p?.name||'No active engagement')}</small></div></div>
  <div class="intake-flow step2-flow"><span><b>1</b> Evidence</span><span><b>2</b> Gaps</span><span><b>3</b> Request</span><span><b>4</b> Context</span><span><b>5</b> Diagnose</span><span><b>6</b> Approve</span></div>
  <section class="box intake-card step2-module" data-module="evidence"><div class="step2-module-head"><div><div class="kicker">01 · Evidence Collected</div><h2>What Nexus already knows</h2><p class="small">Transcripts are optional. Upload any relevant current-state evidence that helps explain the company, workflow, systems, volume, performance, or constraints.</p></div><button id="toggleEvidenceUploadBtn" class="btn primary" type="button">+ Add Evidence</button></div><div id="evidenceUploadPanel" class="step2-upload-panel" hidden><form id="adminEvidenceForm"><div class="form-grid"><div class="field"><label>Evidence file</label><input id="adminEvidenceFile" type="file" required accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md,.json,.xml,.srt,.vtt,.png,.jpg,.jpeg,.webp,.gif"></div><div class="field"><label>Type</label><select id="adminEvidenceCategory"><option>Client Source</option><option>Process Document</option><option>Measurement</option><option>Report</option><option>SOP</option><option>Screenshot</option><option>General</option></select></div></div><div class="field"><label>Context note <span class="small">(optional)</span></label><input id="adminEvidenceNote" placeholder="What is this, and what does it help Nexus understand?"></div><div class="step2-actions"><button class="btn primary" type="submit">Upload Evidence</button><button id="cancelEvidenceUploadBtn" class="btn secondary" type="button">Cancel</button></div><p class="small">PDF, DOCX, PPTX, spreadsheets, CSV, text, JSON/XML, transcripts, and common images · Maximum 25 MB.</p></form></div>${evidenceMarkup()}<details class="step2-history"><summary>Discovery history & audit trail</summary>${historyMarkup()}</details></section>
  <section class="box intake-card step2-module" data-module="gaps"><div class="step2-module-head"><div><div class="kicker">02–03 · Information Gaps & Requests</div><h2>Ask only for what is still missing</h2><p class="small">The Master Discovery Framework stays in the backend. Nexus compares it against current evidence and client answers, then surfaces only material gaps.</p></div></div>${gapMarkup()}</section>
  <section class="box intake-card step2-module" data-module="context"><div class="step2-module-head"><div><div class="kicker">04 · Admin Context</div><h2>Add what the files may not show</h2><p class="small">Your observations directly influence the next diagnosis, but remain explicitly labeled as ADMIN CONTEXT until independently supported.</p></div></div>${contextMarkup()}</section>
  <section class="box intake-card step2-module" data-module="diagnosis"><div class="step2-module-head"><div><div class="kicker">05 · Diagnosis Execution</div><h2>Run Diagnosis</h2><p class="small">Nexus analyzes all authorized evidence, current admin context, and completed client discovery answers. Evidence is selected automatically.</p></div></div>${executionMarkup()}</section>
  <section class="box intake-card step2-module" data-module="review"><div class="step2-module-head"><div><div class="kicker">06 · Review & Approve</div><h2>Approve the diagnosis that drives the engagement</h2><p class="small">Approval makes this diagnosis the root record for downstream opportunities, action items, requests, measurements, and the recommended first intervention.</p></div></div>${reviewMarkup()}</section>`;
  bindStep2();
}

async function uploadEvidence(event){
  event.preventDefault();const file=$('adminEvidenceFile')?.files?.[0];if(!file)return;if(file.size>26214400)return toast?.('File exceeds the 25 MB limit.');
  const allowed=/\.(pdf|docx|pptx|xlsx|xls|csv|txt|md|json|xml|srt|vtt|png|jpg|jpeg|webp|gif)$/i;if(!allowed.test(file.name))return toast?.('Use a supported evidence file type.');
  const button=event.submitter;button.disabled=true;button.textContent='Uploading…';
  const path=`${state.companyId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
  try{
    const {error:u}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(u)throw u;
    const row={company_id:state.companyId,project_id:project()?.id||null,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category:$('adminEvidenceCategory')?.value||'Client Source',status:'shared',note:$('adminEvidenceNote')?.value?.trim()||null,uploaded_by:state.user.id,sensitivity:'standard',request_id:null,data_requirement_id:null,document_area:'client_submission',source_role:'client'};
    const {data,error}=await sb.from('nexus_documents').insert(row).select().single();if(error){await sb.storage.from(BUCKET).remove([path]);throw error}
    try{await log?.('step2_evidence_uploaded','document',data.id,`Evidence added for ${company()?.name||'client'}: ${file.name}`)}catch{}
    toast?.('Evidence uploaded. Nexus is classifying what it contributes…');
    try{const r=await sb.functions.invoke('nexus-diagnosis-execute',{body:{operation:'ingest_evidence',document_id:data.id}});if(r.error||r.data?.ok===false)throw new Error(r.data?.error||r.error?.message)}catch(err){console.warn('Evidence classification deferred',err);toast?.('Evidence is saved. Automated classification will be retried during analysis.')}
    event.target.reset();await workspace?.();await refresh({reload:true});
  }catch(error){toast?.(error.message||'Evidence upload failed.')}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Upload Evidence'}}
}
async function runGapAnalysis(){
  const button=$('runGapAnalysisBtn');if(button){button.disabled=true;button.textContent='Analyzing…'}
  try{
    const p=project();const {data,error}=await sb.functions.invoke('nexus-diagnosis-execute',{body:{operation:'gap_analysis',company_id:state.companyId,project_id:p?.id||null}});
    if(error||data?.ok===false)throw new Error(data?.error||error?.message||'Gap analysis failed.');
    toast?.(`Information coverage analyzed. ${arr(data.result?.gaps).length} material gap${arr(data.result?.gaps).length===1?'':'s'} remain.`);await refresh({reload:true});
  }catch(error){toast?.(error.message||'Information gaps could not be analyzed.')}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Recheck Coverage'}}
}
async function sendGapRequest(){
  const gap=latestGap(),gaps=arr(gap?.result?.gaps);if(!gap||!gaps.length)return;
  const selected=[...document.querySelectorAll('.step2-gap-check:checked')].map(box=>Number(box.dataset.index)).filter(Number.isFinite);
  if(!selected.length)return toast?.('Select at least one item to request.');
  const items=selected.map(i=>{const g=gaps[i]||{},q=document.querySelector(`.step2-gap-question[data-index="${i}"]`)?.value?.trim()||g.question;return {...g,question:q,required:true}}).filter(x=>x.question);
  const button=$('sendGapRequestBtn');button.disabled=true;button.textContent='Sending…';
  try{
    const {data,error}=await sb.rpc('nexus_send_discovery_information_request',{p_company_id:state.companyId,p_project_id:project()?.id||null,p_gap_analysis_id:gap.id,p_items:items});if(error)throw error;
    toast?.('Request sent to the client workspace. No separate approval chain is required.');try{await log?.('discovery_information_requested','task',data?.task_id||null,`Requested ${items.length} remaining discovery item${items.length===1?'':'s'} from ${company()?.name||'client'}.`)}catch{}await workspace?.();await refresh({reload:true});
  }catch(error){toast?.(error.message||'The client request could not be sent.')}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Send Request'}}
}
async function saveAdminContext({silent=false}={}){
  const content=$('adminContextText')?.value?.trim()||latestContext()?.content||'';if(!content){if(!silent)toast?.('Add context before saving.');return null}
  const button=$('saveAdminContextBtn');if(button){button.disabled=true;button.textContent='Saving…'}
  try{
    const {data,error}=await sb.rpc('nexus_save_discovery_admin_context',{p_company_id:state.companyId,p_project_id:project()?.id||null,p_content:content});if(error)throw error;
    if(!silent)toast?.('Brief saved. This context will be included in the next diagnosis run.');try{await log?.('discovery_admin_context_saved','discovery_context',data,`Admin context saved for ${company()?.name||'client'}.`)}catch{}await refresh({reload:true});return {id:data,content,created_at:new Date().toISOString()};
  }catch(error){if(!silent)toast?.(error.message||'Admin context could not be saved.');throw error}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Save Brief'}}
}
async function openDiagnosis(){const run=latestRun();if(!run)return;try{if(window.NexusDiagnosisReviewRuntime?.openReview)return await window.NexusDiagnosisReviewRuntime.openReview(run.id);return await window.NexusDiagnosisController?.openRun?.(run)}catch(error){toast?.(error.message||'Diagnosis could not be opened.')}}
async function approveDiagnosis(){
  const run=latestRun();if(!run||run.status!=='ready_for_review')return;const button=$('approveDiagnosisBtn');button.disabled=true;button.textContent='Approving…';
  try{const {error}=await sb.rpc('nexus_approve_diagnosis',{p_run_id:run.id,p_note:null});if(error)throw error;toast?.('Diagnosis approved. Nexus generated the downstream engagement records and mapped reusable action templates where applicable.');window.NexusDiagnosisController?.invalidateLatest?.();window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));await workspace?.();await refresh({reload:true})}
  catch(error){toast?.(error.message||'Diagnosis could not be approved.')}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Approve Diagnosis'}}
}
async function requestFurtherAnalysis(){
  const run=latestRun(),note=$('furtherAnalysisNote')?.value?.trim()||'';if(!run||run.status!=='ready_for_review')return;if(!note)return toast?.('Describe what Nexus should reconsider or analyze more deeply.');
  const button=$('submitFurtherAnalysisBtn');button.disabled=true;button.textContent='Running…';
  try{const {error}=await sb.rpc('nexus_request_diagnosis_revision',{p_run_id:run.id,p_note:note});if(error)throw error;toast?.('Further analysis requested. Nexus is re-running the diagnosis with your review instruction.');const result=await sb.functions.invoke('nexus-diagnosis-execute',{body:{run_id:run.id}});if(result.error||result.data?.ok===false)throw new Error(result.data?.error||result.error?.message||'Further analysis failed.');window.NexusDiagnosisController?.invalidateLatest?.();window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));await refresh({reload:true})}
  catch(error){toast?.(error.message||'Further analysis could not be completed.')}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Run Further Analysis'}}
}
async function runUpdatedDiagnosis(){
  try{const text=$('adminContextText')?.value?.trim();if(text&&text!==latestContext()?.content)await saveAdminContext({silent:true});await window.NexusDiagnosisController?.securedQueue?.({forceNew:true})}catch(error){toast?.(error.message||'Updated diagnosis could not be started.')}
}
function bindStep2(){
  $('toggleEvidenceUploadBtn')?.addEventListener('click',()=>{$('evidenceUploadPanel').hidden=false;$('adminEvidenceFile')?.focus()});
  $('cancelEvidenceUploadBtn')?.addEventListener('click',()=>{$('evidenceUploadPanel').hidden=true});
  $('adminEvidenceForm')?.addEventListener('submit',uploadEvidence);
  document.querySelectorAll('.step2-download').forEach(b=>b.addEventListener('click',()=>downloadDocument?.(b.dataset.doc)));
  $('runGapAnalysisBtn')?.addEventListener('click',runGapAnalysis);
  $('reviewGapsBtn')?.addEventListener('click',()=>{$('gapRequestEditor').hidden=false;$('reviewGapsBtn').scrollIntoView({behavior:'smooth',block:'start'})});
  $('cancelGapRequestBtn')?.addEventListener('click',()=>{$('gapRequestEditor').hidden=true});
  $('sendGapRequestBtn')?.addEventListener('click',sendGapRequest);
  $('saveAdminContextBtn')?.addEventListener('click',()=>saveAdminContext());
  document.querySelectorAll('#runUpdatedDiagnosisBtn').forEach(b=>b.addEventListener('click',runUpdatedDiagnosis));
  $('reviewDiagnosisBtn')?.addEventListener('click',openDiagnosis);$('editDiagnosisBtn')?.addEventListener('click',openDiagnosis);
  $('approveDiagnosisBtn')?.addEventListener('click',approveDiagnosis);
  $('requestFurtherAnalysisBtn')?.addEventListener('click',()=>{$('furtherAnalysisPanel').hidden=false;$('furtherAnalysisNote')?.focus()});
  $('submitFurtherAnalysisBtn')?.addEventListener('click',requestFurtherAnalysis);
  $('retryDiagnosisBtn')?.addEventListener('click',()=>window.NexusDiagnosisController?.executeExisting?.(latestRun()?.id));
}

async function captureDiscoveryContext({silent=false}={}){const ctx=await saveAdminContext({silent});return ctx||latestContext()}
function getDraft(){return {meeting_date:'',participants:'',notes:latestContext()?.content||'',transcript:'',updated_at:latestContext()?.created_at||''}}
function clearDraft(){}
async function loadRuns(){await loadStep2Data();renderAdminIntake();return diagnosisRuns}
async function refresh({reload=false}={}){if(reload)await loadStep2Data();renderAdminIntake()}

async function reconcile(force=false){
  ensureModeChrome();ensureAdminIntake();
  if(state.admin&&state.companyId&&(force||state.companyId!==lastCompanyId)){lastCompanyId=state.companyId;await loadStep2Data();renderAdminIntake()}
  else if(state.admin&&state.companyId&&!$('section-intake')?.innerHTML)renderAdminIntake();
}
window.NexusAdminIntake={captureDiscoveryContext,getCapturedRun:()=>null,getDraft,clearDraft,loadRuns,refresh,latestAdminContext:latestContext,latestGapAnalysis:latestGap,latestDiagnosisRun:latestRun,buildDiscoveryPacket};
$('companySelect')?.addEventListener('change',()=>setTimeout(()=>reconcile(true),160));
sb.auth.onAuthStateChange(()=>setTimeout(()=>reconcile(true),160));
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(()=>reconcile(true),120));
await reconcile(true);
