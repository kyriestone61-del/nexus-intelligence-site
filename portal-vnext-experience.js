const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');
const {sb,state,$,toast,workspace,downloadDocument}=portal;
const FUNCTIONS='https://dmdgkjksouhhsuojthav.supabase.co/functions/v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const dt=v=>v?new Date(v).toLocaleString():'—';
let selectedReleaseId=null,currentRunId=null,reportBusy=false,enhanceQueued=false;

function ensureCss(){if(document.getElementById('nexusVnextCss'))return;const link=document.createElement('link');link.id='nexusVnextCss';link.rel='stylesheet';link.href='/portal-vnext-experience.css?v=20260831-vnext1';document.head.appendChild(link)}
ensureCss();

const requestHelp={
  automation:'Use this for a new automation, a workflow improvement, or a repetitive process you want Relystra to simplify.',
  issue:'Use this when something is broken, unreliable, confusing, or creating avoidable manual work.',
  reporting:'Use this for dashboards, recurring reports, KPI visibility, data interpretation, or decision support.',
  training:'Use this when a team needs enablement, an SOP, adoption support, or guidance using an implemented system.',
  other:'Use this for strategy, process questions, new ideas, or anything that does not fit the other categories.'
};
function simplifyRequests(){
  const root=$('opsRequestsRoot'),select=$('opsRequestCategory'),form=$('opsRequestForm');if(!root||!select||!form)return;
  root.classList.add('vnext-request-shell');
  if(select.dataset.vnext!=='1'){
    const prior=select.value;
    select.innerHTML='<option value="automation">Automation / workflow improvement</option><option value="issue">Fix a problem</option><option value="reporting">Reporting / dashboard</option><option value="training">Training / enablement</option><option value="other">Strategy / other</option>';
    select.value=['automation','issue','reporting','training','other'].includes(prior)?prior:(prior==='workflow_change'?'automation':'other');
    select.dataset.vnext='1';
  }
  let help=form.querySelector('.vnext-category-help');if(!help){help=document.createElement('div');help.className='vnext-category-help';select.closest('.field')?.after(help)}
  const sync=()=>{help.textContent=requestHelp[select.value]||requestHelp.other};sync();
  if(select.dataset.vnextBound!=='1'){select.addEventListener('change',sync);select.dataset.vnextBound='1'}
  const head=root.querySelector('.ops-toolbar .ops-section-copy');if(head)head.textContent='Submit one clear request. Pick the category, explain the business need, and Relystra will route it from there.';
  const button=$('toggleRequestForm');if(button)button.textContent='+ New request';
}

function activeProject(){return window.NexusFoundationHardening?.activeProject?.()||state.projects?.[0]||null}
function requirementDocs(id){return (state.docs||[]).filter(d=>d.data_requirement_id===id)}
async function uploadRequirement(req,file){
  if(!file||!state.companyId)return;
  if(file.size>26214400)return toast?.('File exceeds the 25 MB limit.');
  const blocked=/\.(exe|dmg|pkg|bat|cmd|sh)$/i.test(file.name);if(blocked)return toast?.('That file type is not accepted.');
  const policyOk=window.confirm('Upload this file as evidence for this preparation item?\n\nConfirm it is relevant to Relystra work and does not contain passwords, API keys, MFA codes, full payment-card data, SSNs, medical records, crypto private keys, or other restricted information Relystra has not expressly approved.');
  if(!policyOk)return;
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${state.companyId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  toast?.(`Uploading ${file.name}…`);
  const {error:u}=await sb.storage.from('nexus-client-documents').upload(path,file,{contentType:file.type||undefined});if(u)return toast?.(u.message);
  const project=activeProject(),catalog=req.catalog||{};
  const row={company_id:state.companyId,project_id:project?.id||null,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category:catalog.category||'Client Source',status:'shared',note:`Evidence for ${catalog.title||'preparation item'}`,uploaded_by:state.user.id,sensitivity:catalog.sensitivity||'standard',request_id:null,data_requirement_id:req.id,document_area:'client_submission',source_role:state.admin?'nexus':'client'};
  const {data,error}=await sb.from('nexus_documents').insert(row).select().single();
  if(error){await sb.storage.from('nexus-client-documents').remove([path]);return toast?.(error.message)}
  await sb.from('nexus_project_data_requirements').update({status:'uploaded',updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('id',req.id);
  try{await portal.log?.('requirement_evidence_uploaded','document',data.id,`${state.admin?'Relystra':'Client'} uploaded evidence for ${catalog.title||'preparation item'}`)}catch{}
  toast?.('Evidence uploaded and linked to this item.');await workspace();setTimeout(enhanceRequirements,80);
}
function evidenceFilesMarkup(req){
  const docs=requirementDocs(req.id);if(!docs.length)return '<div class="small">No file linked to this item yet.</div>';
  return docs.map(d=>`<div class="vnext-evidence-file"><div><b>${esc(d.file_name)}</b><div class="small">${d.source_role==='nexus'?'Relystra':'Client'} · ${esc(dt(d.created_at))}</div></div><button class="btn secondary vnext-evidence-download" data-doc="${esc(d.id)}" type="button">Download</button></div>`).join('');
}
function enhanceRequirements(){
  const root=$('dataRoomRequirements');if(!root)return;
  const cards=[...root.querySelectorAll('.requirement-card')];
  cards.forEach((card,index)=>{
    const req=state.dataRequirements?.[index];if(!req)return;
    card.classList.add('vnext-evidence-card');card.dataset.requirementId=req.id;
    const details=[...card.querySelectorAll(':scope > .req-detail')];
    if(details[0])details[0].classList.add('vnext-primary-detail');
    if(details.length>1&&!card.querySelector('.vnext-evidence-more')){
      const more=document.createElement('details');more.className='vnext-evidence-more';more.innerHTML='<summary>Examples, where to find it & privacy guidance</summary>';
      details.slice(1).forEach(x=>more.appendChild(x));
      const action=card.querySelector('.req-actions');if(action)action.before(more);else card.appendChild(more);
    }
    let files=card.querySelector('.vnext-evidence-files');if(!files){files=document.createElement('div');files.className='vnext-evidence-files';const actions=card.querySelector('.req-actions');if(actions)actions.before(files);else card.appendChild(files)}
    files.innerHTML=evidenceFilesMarkup(req);
    let tools=card.querySelector('.vnext-evidence-actions');if(!tools){tools=document.createElement('div');tools.className='vnext-evidence-actions';tools.innerHTML='<label class="btn primary vnext-evidence-upload">Upload file<input type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.srt,.vtt,.json,.png,.jpg,.jpeg"></label><span class="vnext-evidence-policy">Uploads are linked directly to this evidence item.</span>';const actions=card.querySelector('.req-actions');if(actions)actions.prepend(tools);else card.appendChild(tools)}
    const input=tools.querySelector('input[type=file]');if(input&&!input.dataset.bound){input.dataset.bound='1';input.addEventListener('change',async()=>{const f=input.files?.[0];input.value='';if(f)await uploadRequirement(req,f)})}
    card.querySelectorAll('.vnext-evidence-download').forEach(b=>{if(!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',()=>downloadDocument?.(b.dataset.doc))}});
    const h3=card.querySelector('h3');if(h3&&h3.dataset.vnext!=='1'){h3.dataset.vnext='1';const c=req.catalog||{};h3.title=c.why_needed||''}
  });
  const title=root.closest('.secure-doc-section')?.querySelector('h2')||root.parentElement?.querySelector('h2');if(title&&/Recommended evidence/i.test(title.textContent||''))title.textContent='Evidence that helps Relystra understand the work';
}

function improveDiscoveryBrief(){
  const section=$('section-intake');if(!section)return;
  const card=[...section.querySelectorAll('.intake-card')].find(x=>/Capture the discovery context/i.test(x.querySelector('h2')?.textContent||''));if(!card)return;
  card.classList.add('vnext-discovery-brief');
  const kicker=card.querySelector('.kicker');if(kicker)kicker.textContent='Discovery Brief · useful context the files may not show';
  const h2=card.querySelector('h2');if(h2)h2.textContent='Add context that improves the diagnosis';
  if(!card.querySelector('.vnext-discovery-purpose')){
    const p=document.createElement('div');p.className='vnext-discovery-purpose';p.innerHTML='<b>Purpose:</b> Capture decisions, priorities, constraints, exceptions, ownership, and context that may not be obvious from a transcript or uploaded files. Relystra uses this to reduce assumptions and improve the diagnosis. The brief is saved into the same evidence lineage as the diagnosis—not treated as a separate project.';h2?.after(p)
  }
  const notes=card.querySelector('label[for="intakeNotes"]');if(notes)notes.textContent='What should Relystra know that the transcript/files may not show?';
  const button=$('captureDiscoveryContextBtn');if(button){button.textContent=button.textContent.includes('Update')?'Update brief':'Save brief';button.classList.remove('primary');button.classList.add('secondary')}
  const status=$('discoveryCaptureStatus');if(status&&!status.dataset.vnext){status.dataset.vnext='1';status.title='Queueing diagnosis also persists the current Discovery Brief before secured analysis begins.'}
}

function ensureReportsSection(){
  let section=$('section-diagnosis-reports');
  if(!section){section=document.createElement('section');section.id='section-diagnosis-reports';section.className='section';section.innerHTML='<div class="toolbar"><div><div class="eyebrow">Reports & Q&A</div><h1 style="font-size:36px;margin:6px 0">Diagnosis Reports</h1><p class="small">Review released Relystra findings in one place and keep questions attached to the report.</p></div></div><div id="vnextReportsRoot" class="vnext-reports-shell"><div class="vnext-report-list"><div class="empty">Loading reports…</div></div><div class="vnext-report-detail"><div class="empty">Select a report to review.</div></div></div>';document.querySelector('.main')?.appendChild(section)}
  const nav=document.querySelector('.side-nav');if(nav&&!nav.querySelector('[data-section="diagnosis-reports"]')){
    const b=document.createElement('button');b.type='button';b.dataset.section='diagnosis-reports';b.textContent='Reports & Q&A';
    const marker=[...nav.querySelectorAll('.ops-nav-group')].find(x=>/Updates|Record|Client Work/i.test(x.textContent||''));if(marker?.nextSibling)nav.insertBefore(b,marker.nextSibling);else nav.appendChild(b);
    b.addEventListener('click',()=>activateReports(b));
  }
  return section;
}
function activateReports(button=null){ensureReportsSection();document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id==='section-diagnosis-reports'));document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b===button||b.dataset.section==='diagnosis-reports'));window.scrollTo(0,0);loadReports(true)}
function clientReportSections(r){
  const list=(items,get)=>arr(items).map(get).filter(Boolean);
  const facts=list(r.facts,x=>x.statement),statements=list(r.client_statements,x=>x.statement),process=list(r.process_map,x=>`${x.name||'Process step'} — ${x.current_state||''}`),bottlenecks=list(r.bottlenecks,x=>`${x.title||''}${x.description?` — ${x.description}`:''}`),opps=list(r.opportunity_backlog,x=>`#${x.rank||'—'} ${x.title||''}${x.recommendation?` — ${x.recommendation}`:''}`),questions=list(r.follow_up_questions,x=>`${x.question||''}${x.reason?` — ${x.reason}`:''}`),actions=list(r.client_action_items,x=>`${x.title||''}${x.description?` — ${x.description}`:''}`);
  const pilot=r.smallest_safe_pilot||{};
  return [
    ['Confirmed current-state information',[...facts,...statements]],['Current process',process],['Key bottlenecks',bottlenecks],['Priority opportunities',opps],['Recommended first move',pilot.title?[`${pilot.title}${pilot.summary?` — ${pilot.summary}`:''}`]:[]],['Follow-up questions',questions],['Your action items',actions]
  ].filter(([,items])=>items.length);
}
function reportMarkup(release,questions){
  const r=release.client_report||{};
  const sections=clientReportSections(r).map(([title,items])=>`<section class="vnext-report-section"><h3>${esc(title)}</h3><ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`).join('');
  const q=questions.filter(x=>x.release_id===release.id);
  const qa=q.length?q.map(x=>`<div class="vnext-question"><b>${esc(x.question)}</b><div class="small">Asked ${esc(dt(x.created_at))}</div>${x.answer?`<div class="answer"><div class="kicker">Relystra answer</div>${esc(x.answer)}</div>`:state.admin?`<div class="vnext-admin-answer"><textarea data-answer-for="${esc(x.id)}" placeholder="Answer this client question clearly and directly."></textarea><button class="btn primary vnext-answer-question" data-id="${esc(x.id)}" type="button">Send answer</button></div>`:'<div class="small" style="margin-top:7px">Relystra is reviewing this question.</div>'}</div>`).join(''):'<div class="empty">No questions have been submitted for this report.</div>';
  return `<div class="vnext-report-head"><div><div class="kicker">Released ${esc(dt(release.released_at))}</div><h2 style="margin:5px 0">Relystra Diagnosis Report</h2></div><div class="actions"><button class="btn secondary vnext-client-pdf" data-release="${esc(release.id)}" type="button">Download PDF</button></div></div><div class="vnext-report-summary"><div class="kicker">Executive summary</div><p>${esc(r.executive_summary||'Relystra has released the reviewed findings for this engagement.')}</p></div>${sections}<div class="vnext-qa"><div class="kicker">Questions for Relystra</div><h3 style="margin:5px 0">Ask about this report</h3>${!state.admin?`<form class="vnext-question-form" data-release="${esc(release.id)}"><textarea required maxlength="6000" placeholder="Ask about a finding, recommendation, next step, or anything that is unclear."></textarea><div class="actions" style="margin-top:8px"><button class="btn primary" type="submit">Submit question</button></div></form>`:''}<div style="height:10px"></div>${qa}</div>`;
}
async function loadReports(force=false){
  if(reportBusy||!state.companyId)return;reportBusy=true;
  try{
    const section=ensureReportsSection(),root=section.querySelector('#vnextReportsRoot');
    const [rr,qq]=await Promise.all([
      sb.from('nexus_diagnosis_report_releases').select('*').eq('company_id',state.companyId).eq('status','released').order('released_at',{ascending:false}),
      sb.from('nexus_diagnosis_report_questions').select('*').eq('company_id',state.companyId).order('created_at',{ascending:true})
    ]);
    if(rr.error){if(/does not exist|schema cache/i.test(rr.error.message||'')){root.innerHTML='<div class="vnext-report-list"><div class="empty">Report delivery will appear here after the vNext database migration is applied.</div></div><div class="vnext-report-detail"><div class="empty">No report release data is available yet.</div></div>';return}throw rr.error}
    if(qq.error)throw qq.error;
    const releases=rr.data||[],questions=qq.data||[];
    if(!releases.some(x=>x.id===selectedReleaseId))selectedReleaseId=releases[0]?.id||null;
    const selected=releases.find(x=>x.id===selectedReleaseId)||null;
    root.innerHTML=`<div class="vnext-report-list">${releases.length?releases.map(x=>`<button class="vnext-report-link ${x.id===selectedReleaseId?'active':''}" data-release="${esc(x.id)}" type="button"><b>Diagnosis report</b><span>Released ${esc(dt(x.released_at))} · v${esc(x.report_version)}</span></button>`).join(''):'<div class="empty">No client report has been released yet.</div>'}</div><div class="vnext-report-detail">${selected?reportMarkup(selected,questions):'<div class="empty">When Relystra releases a report, it will appear here.</div>'}</div>`;
    root.querySelectorAll('.vnext-report-link').forEach(b=>b.onclick=()=>{selectedReleaseId=b.dataset.release;loadReports(true)});
    root.querySelectorAll('.vnext-question-form').forEach(form=>form.onsubmit=submitQuestion);
    root.querySelectorAll('.vnext-answer-question').forEach(b=>b.onclick=()=>answerQuestion(b.dataset.id));
    root.querySelectorAll('.vnext-client-pdf').forEach(b=>b.onclick=()=>downloadPdf({release_id:b.dataset.release},b));
  }catch(error){console.error('Relystra report workspace failed',error);toast?.(error.message||'Reports could not be loaded.')}finally{reportBusy=false}
}
async function submitQuestion(event){event.preventDefault();const form=event.currentTarget,release=form.dataset.release,textarea=form.querySelector('textarea'),question=textarea.value.trim();if(!question)return;const button=form.querySelector('button');button.disabled=true;try{const {error}=await sb.rpc('nexus_submit_diagnosis_question',{p_release_id:release,p_question:question});if(error)throw error;textarea.value='';toast?.('Question sent to Relystra.');await loadReports(true)}catch(e){toast?.(e.message||'Question could not be sent.')}finally{button.disabled=false}}
async function answerQuestion(id){const textarea=document.querySelector(`[data-answer-for="${CSS.escape(id)}"]`),answer=textarea?.value?.trim();if(!answer)return toast?.('Enter an answer first.');const button=document.querySelector(`.vnext-answer-question[data-id="${CSS.escape(id)}"]`);if(button)button.disabled=true;try{const {error}=await sb.rpc('nexus_answer_diagnosis_question',{p_question_id:id,p_answer:answer});if(error)throw error;toast?.('Answer sent to the client workspace.');await flushSms();await loadReports(true);await workspace()}catch(e){toast?.(e.message||'Answer could not be sent.')}finally{if(button)button.disabled=false}}

async function accessToken(){return (await sb.auth.getSession()).data.session?.access_token||''}
async function downloadPdf(payload,button){const token=await accessToken();if(!token)return toast?.('Sign in again before downloading.');const original=button?.textContent;if(button){button.disabled=true;button.textContent='Preparing PDF…'}try{const r=await fetch(`${FUNCTIONS}/nexus-diagnosis-report-pdf`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok){const p=await r.json().catch(()=>({}));throw new Error(p.error||'PDF could not be generated.')}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;const cd=r.headers.get('content-disposition')||'';a.download=(cd.match(/filename="([^"]+)"/)||[])[1]||'Relystra-Diagnosis-Report.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}catch(e){toast?.(e.message||'PDF could not be generated.')}finally{if(button){button.disabled=false;button.textContent=original}}}
async function flushSms(){if(!state.admin)return;try{const token=await accessToken();if(!token)return;await fetch(`${FUNCTIONS}/nexus-sms-worker`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'})}catch{}}

function rememberDiagnosisRun(event){const target=event.target.closest?.('.diagnosis-review-btn,[data-diagnosis-action],.diagnosis-retry-btn');if(target?.dataset.id)currentRunId=target.dataset.id}
document.addEventListener('click',rememberDiagnosisRun,true);
function enhanceDiagnosisModal(){
  const body=$('diagnosisReviewBody');if(!body||!document.getElementById('diagnosisReviewModal')?.classList.contains('open'))return;
  if(body.querySelector('.vnext-diagnosis-tools')||!currentRunId)return;
  const hasResult=!!body.querySelector('.diagnosis-executive');if(!hasResult)return;
  const tools=document.createElement('div');tools.className='vnext-diagnosis-tools';tools.innerHTML=`<button class="btn secondary vnext-full-pdf" type="button">Download PDF</button><button class="btn primary vnext-release-report" type="button">Release client report →</button>`;
  const executive=body.querySelector('.diagnosis-executive');executive?.before(tools);
  tools.querySelector('.vnext-full-pdf').onclick=e=>downloadPdf({run_id:currentRunId},e.currentTarget);
  tools.querySelector('.vnext-release-report').onclick=async e=>{
    const button=e.currentTarget;if(!window.confirm('Release the reviewed client-safe diagnosis report to this client?\n\nThe full internal Relystra diagnosis remains private. The client will receive a reduced report in their workspace and notification channels according to their preferences.'))return;
    button.disabled=true;const original=button.textContent;button.textContent='Releasing…';
    try{const {data,error}=await sb.rpc('nexus_release_diagnosis_report',{p_run_id:currentRunId});if(error)throw error;selectedReleaseId=data;toast?.('Client report released.');await flushSms();await workspace();await loadReports(true)}catch(err){toast?.(err.message||'Client report could not be released.')}finally{button.disabled=false;button.textContent=original}
  };
}

function enhanceInbox(){
  const root=$('notificationList');if(!root)return;
  const rows=[...root.querySelectorAll(':scope > .row')];rows.forEach((row,i)=>{const note=state.notes?.[i];if(!note?.action_url||row.querySelector('.vnext-inbox-open'))return;const b=document.createElement('button');b.type='button';b.className='btn secondary vnext-inbox-open';b.textContent='Open';b.onclick=()=>routeActionUrl(note.action_url);row.appendChild(b)});
}
function routeActionUrl(url){
  try{const u=new URL(url,location.origin),view=u.searchParams.get('view');if(view==='diagnosis-report'){selectedReleaseId=u.searchParams.get('release');activateReports(document.querySelector('[data-section="diagnosis-reports"]'));return}if(view==='diagnosis'||view==='diagnosis-question'){const run=u.searchParams.get('run');if(run){currentRunId=run;window.NexusDiagnosisController?.openRun?.(run);return}activateReports(document.querySelector('[data-section="diagnosis-reports"]'));return}location.href=u.pathname+u.search}catch{}}

async function ensureChannelSettings(){
  const root=$('emailPreferencePanel');if(!root||root.querySelector('.vnext-channel-settings')||!state.user)return;
  const {data:profile}=await sb.from('nexus_profiles').select('phone').eq('user_id',state.user.id).maybeSingle();
  const p=state.notificationPrefs||{};
  const box=document.createElement('div');box.className='vnext-channel-settings';box.innerHTML=`<div class="kicker">Report & Q&A delivery</div><h3 style="margin:4px 0 8px">Choose how Relystra should notify you.</h3><div class="field"><label>Mobile number <span class="small">(optional)</span></label><input id="vnextPhone" type="tel" autocomplete="tel" placeholder="+1 302 555 0123" value="${esc(profile?.phone||'')}"><div class="small">SMS remains off until you explicitly enable it. Carrier messaging rates may apply.</div></div><div class="vnext-channel-grid"><label><input id="vnextReportEmail" type="checkbox" ${p.report_emails!==false?'checked':''}><span><b>Report emails</b><span class="small">Email when a diagnosis report is released.</span></span></label><label><input id="vnextQaEmail" type="checkbox" ${p.qa_emails!==false?'checked':''}><span><b>Q&A emails</b><span class="small">Email when Relystra answers your report question.</span></span></label><label><input id="vnextSms" type="checkbox" ${p.sms_enabled?'checked':''}><span><b>SMS notifications</b><span class="small">Master opt-in for report/Q&A texts when SMS delivery is configured.</span></span></label><label><input id="vnextReportSms" type="checkbox" ${p.report_sms!==false?'checked':''}><span><b>Report SMS</b><span class="small">Text when a report is released.</span></span></label></div><div class="actions" style="margin-top:10px"><button id="vnextSaveChannels" class="btn secondary" type="button">Save report notification settings</button></div>`;root.appendChild(box);
  $('#vnextSaveChannels').onclick=saveChannelSettings;
}
async function saveChannelSettings(){
  const phone=$('vnextPhone')?.value.trim()||null;
  const {error:pe}=await sb.from('nexus_profiles').update({phone,updated_at:new Date().toISOString()}).eq('user_id',state.user.id);if(pe)return toast?.(pe.message);
  const base=state.notificationPrefs||{};
  const row={company_id:state.companyId,user_id:state.user.id,email_enabled:base.email_enabled!==false,task_emails:base.task_emails!==false,approval_emails:base.approval_emails!==false,document_request_emails:base.document_request_emails!==false,digest_cadence:base.digest_cadence||'daily',report_emails:$('#vnextReportEmail').checked,qa_emails:$('#vnextQaEmail').checked,sms_enabled:$('#vnextSms').checked,report_sms:$('#vnextReportSms').checked,qa_sms:true,updated_at:new Date().toISOString()};
  const {error}=await sb.from('nexus_notification_preferences').upsert(row,{onConflict:'company_id,user_id'});if(error)return toast?.(error.message);toast?.('Report notification settings saved.');state.notificationPrefs={...base,...row};
}

async function routeInitial(){const p=new URLSearchParams(location.search),view=p.get('view');if(view==='diagnosis-report'){selectedReleaseId=p.get('release');setTimeout(()=>activateReports(document.querySelector('[data-section="diagnosis-reports"]')),350)}else if(view==='diagnosis'&&state.admin){const run=p.get('run');if(run){currentRunId=run;setTimeout(()=>window.NexusDiagnosisController?.openRun?.(run),500)}}}

function enhanceAll(){simplifyRequests();enhanceRequirements();improveDiscoveryBrief();ensureReportsSection();enhanceDiagnosisModal();enhanceInbox();ensureChannelSettings()}
function scheduleEnhance(){if(enhanceQueued)return;enhanceQueued=true;requestAnimationFrame(()=>{enhanceQueued=false;enhanceAll()})}
const observer=new MutationObserver(scheduleEnhance);observer.observe(document.body,{childList:true,subtree:true});
$('companySelect')?.addEventListener('change',()=>{selectedReleaseId=null;setTimeout(()=>{enhanceAll();loadReports(true)},350)});
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(()=>{enhanceDiagnosisModal();loadReports(true)},180));
setTimeout(()=>{enhanceAll();routeInitial()},180);
window.NexusVnextExperience={enhanceAll,loadReports,activateReports,downloadPdf};
