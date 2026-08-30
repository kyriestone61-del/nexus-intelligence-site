const portal=window.NexusPortal;
if(!portal) throw new Error('Nexus portal context is unavailable.');

const {sb,state,$,toast,workspace}=portal;
const BUCKET='nexus-client-documents';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=v=>v?new Date(v).toLocaleString():'—';
let diagnosisRuns=[];
let lastCompanyId=null;

const discoverySections=[
  ['Business basics',[
    'What does the company sell or provide?',
    'Who is the ideal customer?',
    'What are the best-selling or highest-value products/services?',
    'How does the company make money today?',
    'What are the top three business goals for the next 6–12 months?'
  ]],
  ['Customer journey & sales',[
    'How do new customers usually find the business?',
    'What happens from first inquiry to completed sale?',
    'Where do leads or opportunities get tracked?',
    'What questions do customers ask repeatedly?',
    'Where do leads, sales, or follow-ups fall through the cracks?'
  ]],
  ['Marketing & content',[
    'Which marketing channels are used today?',
    'How is content planned, created, approved, and published?',
    'What marketing activity appears to work best?',
    'What marketing work is inconsistent because there is not enough time?',
    'What customer or campaign data is available but underused?'
  ]],
  ['Operations',[
    'Walk me through how the core work gets done from start to finish.',
    'Which tasks are repeated every day or every week?',
    'Which tasks require copying information between systems?',
    'Where do delays, mistakes, rework, or confusion happen most often?',
    'What depends too heavily on one person remembering what to do?'
  ]],
  ['Systems & information',[
    'What software, spreadsheets, inboxes, calendars, or paper systems are used?',
    'Where is customer, order, project, or operational information stored?',
    'Which systems do not communicate with each other?',
    'Are there SOPs, templates, checklists, reports, or dashboards today?',
    'What information is difficult to find when someone needs it?'
  ]],
  ['Time, pain points & constraints',[
    'What takes the most time each week?',
    'What work is the most frustrating or mentally draining?',
    'What important work keeps getting postponed?',
    'What cannot be automated because it requires judgment, approval, or a human relationship?',
    'Are there privacy, security, compliance, budget, or technology constraints Nexus should know about?'
  ]],
  ['Measurement & desired state',[
    'What would a noticeably better operation look like 90 days from now?',
    'Which metrics matter most: time saved, response time, sales, errors, throughput, customer experience, or something else?',
    'What baseline numbers can we measure before making changes?',
    'If AI or automation could remove one burden immediately, what should it be?',
    'What would make this engagement unquestionably valuable to the business?'
  ]]
];

const allQuestionsText=()=>discoverySections.map(([section,questions])=>`${section}\n${questions.map((q,i)=>`${i+1}. ${q}`).join('\n')}`).join('\n\n');
const company=()=>state.companies.find(c=>c.id===state.companyId)||null;
const project=()=>state.projects?.[0]||null;
const safeName=name=>String(name||'file').replace(/[^a-zA-Z0-9._-]/g,'_');
const formatBytes=v=>{const n=Number(v||0);if(!n)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`};
const draftKey=()=>`nexus_admin_intake_draft_${state.companyId||'none'}`;

function getDraft(){try{return JSON.parse(localStorage.getItem(draftKey())||'{}')}catch{return {}}}
function saveDraft(){
  if(!state.admin||!state.companyId)return;
  const draft={meeting_date:$('intakeMeetingDate')?.value||'',participants:$('intakeParticipants')?.value||'',notes:$('intakeNotes')?.value||'',transcript:$('intakeTranscriptText')?.value?.slice(0,120000)||''};
  localStorage.setItem(draftKey(),JSON.stringify(draft));
}
function clearDraft(){localStorage.removeItem(draftKey())}

function ensureModeChrome(){
  const topbar=document.querySelector('.topbar');if(!topbar)return;
  let badge=$('accountModeBadge');
  if(!badge){badge=document.createElement('span');badge.id='accountModeBadge';badge.className='account-mode-badge';topbar.querySelector('.pill')?.after(badge)}
  badge.textContent=state.admin?'NEXUS ADMIN ACCOUNT':'CLIENT ACCOUNT';
  badge.classList.toggle('admin',!!state.admin);badge.classList.toggle('client',!state.admin);
  let link=$('adminConsoleLink');
  if(state.admin){
    if(!link){link=document.createElement('a');link.id='adminConsoleLink';link.className='btn secondary admin-console-link';link.href='/operations';link.textContent='Admin Console →';$('companySelect')?.after(link)}
    link.style.display='inline-flex';document.title='Nexus Admin Client Workspace | Nexus Intelligence';
  }else{
    if(link)link.style.display='none';document.title='Client Control Room | Nexus Intelligence';
  }
}

function openSection(name){
  document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${name}`));
  window.scrollTo(0,0);
}

function ensureAdminIntake(){
  const nav=document.querySelector('.side-nav'),main=document.querySelector('.main');if(!nav||!main)return;
  let button=document.querySelector('.side-nav button[data-section="intake"]'),section=$('section-intake');
  if(!state.admin){button?.remove();section?.remove();return}
  if(!button){
    button=document.createElement('button');button.type='button';button.dataset.section='intake';button.textContent='Client Intake & Diagnosis';
    document.querySelector('.side-nav button[data-section="overview"]')?.after(button);
    button.addEventListener('click',()=>openSection('intake'));
  }
  if(!section){
    section=document.createElement('section');section.id='section-intake';section.className='section admin-intake-section';
    $('section-overview')?.after(section);renderAdminIntake();
  }
}

function questionsMarkup(){return discoverySections.map(([section,questions])=>`<div class="intake-question-group"><h4>${esc(section)}</h4><ol>${questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol></div>`).join('')}
function evidenceOptions(){
  const docs=(state.docs||[]).filter(d=>d.source_role==='client'||d.category==='Discovery Transcript');
  if(!docs.length)return '<div class="empty">No client-source evidence has been uploaded for this company yet.</div>';
  return docs.map(d=>`<label class="intake-evidence-row"><input class="diagnosis-supporting-doc" type="checkbox" value="${d.id}"><span><b>${esc(d.file_name)}</b><small>${esc(d.category)} · ${dt(d.created_at)}${d.size_bytes?' · '+formatBytes(d.size_bytes):''}</small></span></label>`).join('');
}
function transcriptOptions(){
  const docs=(state.docs||[]).filter(d=>d.category==='Discovery Transcript');
  return `<option value="">${docs.length?'Select transcript file':'No transcript file uploaded yet'}</option>`+docs.map(d=>`<option value="${d.id}">${esc(d.file_name)} · ${dt(d.created_at)}</option>`).join('');
}
function runMarkup(run){
  const manifest=Array.isArray(run.analysis_packet?.evidence_manifest)?run.analysis_packet.evidence_manifest:[];
  const result=run.analysis_result&&Object.keys(run.analysis_result).length?'<span class="pill">Result stored</span>':'';
  return `<article class="diagnosis-run-card"><div class="diagnosis-run-head"><div><span class="pill">Client Diagnosis Agent</span> ${result}<h3>${esc(company()?.name||'Client')} · ${dt(run.created_at)}</h3></div><span class="diagnosis-status ${esc(run.status)}">${esc(String(run.status||'ready_for_analysis').replaceAll('_',' '))}</span></div><p class="small">${run.meeting_date?`Meeting ${esc(run.meeting_date)} · `:''}${esc(run.participants||'Participants not recorded')}</p><p>${esc(run.discovery_notes||'No separate discovery notes were saved.')}</p><div class="diagnosis-manifest">${manifest.slice(0,6).map(x=>`<span>${esc(x.file_name||'Evidence')}</span>`).join('')}${manifest.length>6?`<span>+${manifest.length-6} more</span>`:''}</div><div class="diagnosis-run-actions"><button class="btn secondary copy-agent-packet" type="button" data-id="${run.id}">Copy agent packet</button><select class="diagnosis-status-select" data-id="${run.id}">${[['ready_for_analysis','Ready for analysis'],['in_review','In review'],['blocked','Blocked'],['approved','Approved'],['archived','Archived']].map(([v,l])=>`<option value="${v}" ${run.status===v?'selected':''}>${l}</option>`).join('')}</select></div></article>`;
}

function renderAdminIntake(){
  const root=$('section-intake');if(!root||!state.admin)return;
  const c=company(),draft=getDraft();
  root.innerHTML=`
    <div class="admin-intake-banner"><div><div class="eyebrow">ADMIN ONLY · INTERNAL WORKSPACE</div><h1>Discovery Intake & Diagnosis</h1><p>This is where you put the Teams transcript, your meeting notes, and client-provided evidence after discovery. Client accounts cannot see diagnosis-run records or this page.</p></div><a class="btn secondary" href="/operations">Open Admin Console →</a></div>
    <div class="intake-flow"><span><b>1</b> Run discovery</span><span><b>2</b> Add transcript</span><span><b>3</b> Add evidence</span><span><b>4</b> Queue diagnosis</span><span><b>5</b> Review output</span></div>
    <div class="intake-grid">
      <section class="box intake-card"><div class="kicker">Selected client</div><h2>${esc(c?.name||'No company selected')}</h2><p class="small">The company selector in the top bar controls which client record receives the transcript, documents, and diagnosis run.</p><div class="note"><b>Role boundary:</b> Admin intake is internal Nexus work. The client portal remains for client actions, requested information, approvals, delivery plan, and results.</div></section>
      <section class="box intake-card"><div class="toolbar"><div><div class="kicker">Reusable template</div><h2>General Discovery Questions</h2></div><button id="copyDiscoveryQuestions" class="btn secondary" type="button">Copy questions</button></div><details class="intake-questions"><summary>Open the discovery guide</summary><div class="intake-question-grid">${questionsMarkup()}</div></details></section>
    </div>
    <section class="box intake-card"><div class="kicker">Step 1 · Meeting record</div><h2>Capture the discovery context</h2><div class="form-grid"><div class="field"><label>Meeting date</label><input id="intakeMeetingDate" type="date" value="${esc(draft.meeting_date||'')}"></div><div class="field"><label>Participants</label><input id="intakeParticipants" placeholder="Names / roles" value="${esc(draft.participants||'')}"></div></div><div class="field"><label>Admin notes</label><textarea id="intakeNotes" placeholder="Key goals, pain points, constraints, follow-ups, observations, or anything that may not be obvious from the transcript.">${esc(draft.notes||'')}</textarea></div><div class="field"><label>Paste transcript text <span class="small">(optional if you upload a file)</span></label><textarea id="intakeTranscriptText" class="transcript-text" placeholder="Paste the Teams transcript here for a self-contained diagnosis packet. You can also upload TXT, SRT, VTT, PDF, or DOCX below.">${esc(draft.transcript||'')}</textarea></div><p class="small">This draft is saved locally in your browser for the selected client until you queue the diagnosis.</p></section>
    <div class="intake-grid">
      <section class="box intake-card"><div class="kicker">Step 2 · Transcript</div><h2>Upload the meeting transcript</h2><form id="adminTranscriptForm"><div class="field"><label>Transcript file</label><input id="adminTranscriptFile" type="file" required accept=".txt,.srt,.vtt,.pdf,.docx"></div><div class="field"><label>Context note</label><input id="adminTranscriptNote" placeholder="Example: Initial discovery call, 45 minutes"></div><div class="actions"><button class="btn primary" type="submit">Upload transcript →</button></div></form><p class="small">TXT, SRT, and VTT files are also read into the internal diagnosis packet. PDF and DOCX are stored securely and referenced as evidence.</p></section>
      <section class="box intake-card"><div class="kicker">Step 3 · Supporting evidence</div><h2>Add client documents</h2><form id="adminEvidenceForm"><div class="field"><label>Client-provided file</label><input id="adminEvidenceFile" type="file" required accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg"></div><div class="field"><label>Type</label><select id="adminEvidenceCategory"><option>Client Source</option><option>Process Document</option><option>Measurement</option><option>Report</option><option>General</option></select></div><div class="field"><label>Context note</label><input id="adminEvidenceNote" placeholder="What is it and what does it help explain?"></div><div class="actions"><button class="btn primary" type="submit">Upload evidence →</button></div></form></section>
    </div>
    <section class="box intake-card"><div class="kicker">Step 4 · Diagnosis packet</div><h2>Choose the evidence and queue the Client Diagnosis Agent</h2><p class="small">This creates an internal, auditable diagnosis run in <b>shadow / draft-only mode</b>. It prepares the evidence packet and analysis instruction. It does not send emails, modify client systems, or take external action.</p><div class="field"><label>Primary transcript file</label><select id="diagnosisTranscriptDoc">${transcriptOptions()}</select></div><div class="field"><label>Supporting documents</label><div id="diagnosisEvidenceList" class="intake-evidence-list">${evidenceOptions()}</div></div><div class="actions"><button id="queueDiagnosisBtn" class="btn primary" type="button">Queue diagnosis →</button></div><div class="note admin-intake-help"><b>Current execution boundary:</b> Nexus stores and structures the source packet here. “Copy agent packet” gives you the exact Client Diagnosis Agent instruction for the current shadow-mode workflow. Automated model execution is not shown as live until a secured model endpoint is connected.</div></section>
    <section class="box intake-card"><div class="toolbar"><div><div class="kicker">Step 5 · Internal queue</div><h2>Diagnosis runs</h2></div><a class="btn secondary" href="/operations">Admin Console →</a></div><div id="diagnosisRunList" class="diagnosis-run-list">${diagnosisRuns.length?diagnosisRuns.map(runMarkup).join(''):'<div class="empty">No diagnosis run has been queued for this company yet.</div>'}</div></section>`;

  ['intakeMeetingDate','intakeParticipants','intakeNotes','intakeTranscriptText'].forEach(id=>$(id)?.addEventListener('input',saveDraft));
  $('copyDiscoveryQuestions')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(allQuestionsText());toast('Discovery questions copied.')}catch{toast('Copy failed. Select and copy the questions manually.')}});
  $('adminTranscriptForm')?.addEventListener('submit',uploadTranscript);
  $('adminEvidenceForm')?.addEventListener('submit',uploadSupportingEvidence);
  $('queueDiagnosisBtn')?.addEventListener('click',queueDiagnosis);
  root.querySelectorAll('.copy-agent-packet').forEach(b=>b.addEventListener('click',()=>copyAgentPacket(b.dataset.id)));
  root.querySelectorAll('.diagnosis-status-select').forEach(s=>s.addEventListener('change',()=>updateRunStatus(s.dataset.id,s.value)));
}

async function uploadDocument(file,category,note,{readText=false}={}){
  if(!state.admin||!state.companyId)throw new Error('Select a client company before uploading.');
  if(file.size>26214400)throw new Error('File exceeds the 25 MB limit.');
  const path=`${state.companyId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
  const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(uploadError)throw uploadError;
  const row={company_id:state.companyId,project_id:project()?.id||null,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category,status:'shared',note:note||null,uploaded_by:state.user.id,sensitivity:'standard',request_id:null,data_requirement_id:null,document_area:'client_submission',source_role:'client'};
  const {data,error}=await sb.from('nexus_documents').insert(row).select().single();
  if(error){await sb.storage.from(BUCKET).remove([path]);throw error}
  let text='';if(readText&&/\.(txt|srt|vtt)$/i.test(file.name)){try{text=(await file.text()).slice(0,120000)}catch{}}
  return {document:data,text};
}

async function uploadTranscript(e){
  e.preventDefault();saveDraft();const file=$('adminTranscriptFile')?.files?.[0];if(!file)return;
  if(!/\.(txt|srt|vtt|pdf|docx)$/i.test(file.name))return toast('Use TXT, SRT, VTT, PDF, or DOCX for the meeting transcript.');
  const button=e.submitter;button.disabled=true;button.textContent='Uploading…';
  try{
    const {text}=await uploadDocument(file,'Discovery Transcript',$('adminTranscriptNote').value.trim()||'Discovery meeting transcript',{readText:true});
    if(text){const draft=getDraft();draft.transcript=text;localStorage.setItem(draftKey(),JSON.stringify(draft))}
    toast(text?'Transcript uploaded and added to the diagnosis draft.':'Transcript uploaded securely.');e.target.reset();await workspace();await loadRuns();renderAdminIntake();
  }catch(error){toast(error.message||'Transcript upload failed.')}
  finally{button.disabled=false;button.textContent='Upload transcript →'}
}

async function uploadSupportingEvidence(e){
  e.preventDefault();saveDraft();const file=$('adminEvidenceFile')?.files?.[0];if(!file)return;const button=e.submitter;button.disabled=true;button.textContent='Uploading…';
  try{await uploadDocument(file,$('adminEvidenceCategory').value,$('adminEvidenceNote').value.trim());toast('Client evidence uploaded securely.');e.target.reset();await workspace();await loadRuns();renderAdminIntake()}
  catch(error){toast(error.message||'Evidence upload failed.')}
  finally{button.disabled=false;button.textContent='Upload evidence →'}
}

async function queueDiagnosis(){
  if(!state.admin||!state.companyId)return;saveDraft();const draft=getDraft();
  const transcriptId=$('diagnosisTranscriptDoc')?.value||null;
  const selected=[...document.querySelectorAll('.diagnosis-supporting-doc:checked')].map(x=>x.value);if(transcriptId&&!selected.includes(transcriptId))selected.unshift(transcriptId);
  if(!transcriptId&&!draft.transcript&&!draft.notes)return toast('Add a transcript, paste transcript text, or enter discovery notes before queueing a diagnosis.');
  const c=company(),p=project(),docs=(state.docs||[]).filter(d=>selected.includes(d.id));
  const packet={version:1,company:{id:c?.id||state.companyId,name:c?.name||'',industry:c?.industry||'',website:c?.website||''},project:{id:p?.id||null,name:p?.name||'',service_type:p?.service_type||''},agent:{code:'client_diagnosis',mode:'shadow',permission_level:'draft_only'},meeting:{date:draft.meeting_date||null,participants:draft.participants||null},discovery_notes:draft.notes||null,transcript_text:draft.transcript||null,evidence_manifest:docs.map(d=>({id:d.id,file_name:d.file_name,category:d.category,note:d.note||null,created_at:d.created_at})),required_output:['facts','client_statements','inferences','unknowns','process_map','baseline_gaps','opportunity_backlog','smallest_pilot'],prohibited_actions:['send emails','contact anyone','modify client systems','make purchases','publish content','change permissions','take external action without explicit approval']};
  const row={company_id:state.companyId,project_id:p?.id||null,agent_code:'client_diagnosis',status:'ready_for_analysis',transcript_document_id:transcriptId,supporting_document_ids:selected,meeting_date:draft.meeting_date||null,participants:draft.participants||null,discovery_notes:draft.notes||null,analysis_packet:packet,created_by:state.user.id,updated_at:new Date().toISOString()};
  const button=$('queueDiagnosisBtn');button.disabled=true;button.textContent='Queueing…';
  try{const {error}=await sb.from('nexus_diagnosis_runs').insert(row);if(error)throw error;clearDraft();toast('Diagnosis packet queued for internal review.');await loadRuns();renderAdminIntake()}
  catch(error){toast(error.message||'Diagnosis could not be queued.')}
}

async function loadRuns(){
  if(!state.admin||!state.companyId){diagnosisRuns=[];return}
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}).limit(50);
  if(error){console.error('Diagnosis queue load failed',error);diagnosisRuns=[];return}diagnosisRuns=data||[];
}

function buildAgentPrompt(run){
  const p=run.analysis_packet||{},manifest=Array.isArray(p.evidence_manifest)?p.evidence_manifest:[];
  return `NEXUS INTELLIGENCE — CLIENT DIAGNOSIS AGENT\n\nMODE\nShadow / draft-only. Analyze only. Do not send emails, contact anyone, modify systems, publish, purchase, or take external action.\n\nMISSION\nConvert authorized discovery evidence into a grounded current-state diagnosis. Separate facts, client statements, inferences, and unknowns. Do not invent missing information.\n\nCLIENT\nCompany: ${p.company?.name||company()?.name||''}\nIndustry: ${p.company?.industry||''}\nWebsite: ${p.company?.website||''}\nProject: ${p.project?.name||''}\nMeeting date: ${p.meeting?.date||run.meeting_date||''}\nParticipants: ${p.meeting?.participants||run.participants||''}\n\nADMIN DISCOVERY NOTES\n${p.discovery_notes||run.discovery_notes||'None provided.'}\n\nTRANSCRIPT TEXT\n${p.transcript_text||'[Transcript is stored as an uploaded file. Review the selected evidence file before analysis.]'}\n\nAUTHORIZED EVIDENCE MANIFEST\n${manifest.length?manifest.map((x,i)=>`${i+1}. ${x.file_name} | ${x.category}${x.note?' | '+x.note:''}`).join('\n'):'No supporting files selected.'}\n\nREQUIRED OUTPUT\n1. Facts — directly supported by evidence.\n2. Client statements — important claims or preferences stated by the client.\n3. Inferences — clearly labeled hypotheses, with supporting evidence.\n4. Unknowns — missing information that materially affects the diagnosis.\n5. Current-state process map — people, steps, systems, handoffs, inputs, outputs.\n6. Bottlenecks and failure points — ranked by operational impact and confidence.\n7. Baseline gaps — what must be measured before claiming improvement.\n8. AI / automation opportunity backlog — rank each opportunity by value, feasibility, risk, evidence quality, and required human approval.\n9. Smallest safe pilot — one narrow, measurable starting implementation with success metric, guardrails, owner, inputs, outputs, and rollback.\n10. Follow-up questions — only questions that would materially change the recommendation.\n\nQUALITY RULES\n- Quote or paraphrase evidence conservatively.\n- Distinguish process problems from technology problems.\n- Prefer simple process fixes or deterministic automation when AI is unnecessary.\n- Do not make ROI, time-savings, or revenue claims without a defensible baseline.\n- Flag privacy, security, permissions, customer-impact, and change-management risks.\n- Keep all recommendations inside the evidence and stated business goals.\n`;
}

async function copyAgentPacket(id){const run=diagnosisRuns.find(r=>r.id===id);if(!run)return;try{await navigator.clipboard.writeText(buildAgentPrompt(run));toast('Client Diagnosis Agent packet copied.')}catch{toast('Could not copy the agent packet.')}}
async function updateRunStatus(id,status){const {error}=await sb.from('nexus_diagnosis_runs').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message||'Diagnosis status could not be updated.');toast('Diagnosis status updated.');await loadRuns();renderAdminIntake()}

async function reconcile(force=false){
  ensureModeChrome();ensureAdminIntake();
  if(state.admin&&state.companyId&&(force||state.companyId!==lastCompanyId)){lastCompanyId=state.companyId;await loadRuns();renderAdminIntake()}
}

$('companySelect')?.addEventListener('change',()=>setTimeout(()=>reconcile(true),160));
sb.auth.onAuthStateChange(()=>setTimeout(()=>reconcile(true),160));
new MutationObserver(()=>{ensureModeChrome();ensureAdminIntake()}).observe(document.body,{childList:true,subtree:true,characterData:true});
await reconcile(true);
setTimeout(()=>reconcile(false),600);
