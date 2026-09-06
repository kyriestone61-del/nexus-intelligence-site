import {serializeReleasedClientReport} from '/portal-client-core.js';

const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable for Experience V3.');
const {sb,state,runtime,toast,workspace}=portal;
const events=runtime?.events;
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const arr=value=>Array.isArray(value)?value:[];
const terminal=new Set(['complete','completed','done','closed','resolved','approved','released','implemented','not_applicable','cancelled','canceled','archived']);
const satisfiedEvidence=new Set(['uploaded','provided','approved','complete','completed','fulfilled','not_applicable','build_with_relystra','build_with_nexus']);
const PHASES=[
  {key:'discover',label:'Discovery',stages:['discovery','diagnosis']},
  {key:'plan',label:'Plan & Kickoff',stages:['commercial','onboarding']},
  {key:'build',label:'Build & Test',stages:['implementation','verification']},
  {key:'launch',label:'Launch & Results',stages:['measurement','acceptance','complete']}
];
let scheduled=false,adminBriefBusy=false,clientReleaseBusy=false;
let cachedReleasedReport=null,cachedReportCompany=null;

function ensureCss(){
  if(document.getElementById('relystraExperienceV3Css'))return;
  const link=document.createElement('link');
  link.id='relystraExperienceV3Css';link.rel='stylesheet';link.href='/portal-experience-v3.css?v=20260906-1';
  document.head.appendChild(link);
}
function phaseZeroStatus(){return window.RelystrPhaseZeroLifecycle?.status||null}
function clientMode(){return !state.admin||state.viewMode==='client'}
function currentProject(){
  const pointer=state.activeEngagement?.project_id||state.activeProjectId||null;
  if(pointer){const hit=arr(state.projects).find(project=>project.id===pointer);if(hit)return hit}
  return window.NexusFoundationHardening?.activeProject?.()||arr(state.projects).find(project=>!terminal.has(String(project.status||'').toLowerCase()))||arr(state.projects)[0]||null;
}
function currentPhaseIndex(stage){const index=PHASES.findIndex(phase=>phase.stages.includes(String(stage||'').toLowerCase()));return index<0?0:index}
function statusWord(index,current){if(index<current)return'Done';if(index===current)return'Now';return'Next'}
function textSummary(value,fallback='—'){
  if(value==null||value==='')return fallback;
  if(typeof value==='string')return value.trim()||fallback;
  if(Array.isArray(value))return value.length?textSummary(value[0],fallback):fallback;
  if(typeof value==='object'){
    for(const key of ['title','name','statement','summary','description','recommendation','problem','question','risk','text','label']){
      if(value[key])return textSummary(value[key],fallback);
    }
    for(const val of Object.values(value)){const result=textSummary(val,'');if(result)return result}
  }
  return String(value);
}
function firstOf(source,keys){for(const key of keys){if(source?.[key]!=null&&source[key]!=='')return textSummary(source[key])}return'—'}
function ownerForCurrentContext(){
  const actionable=document.querySelector('.nexus-client-primary-action .nexus-client-primary-cta');
  return actionable&&!actionable.disabled?'You':'Relystra';
}
function evidenceReadiness(){
  const requirements=arr(state.dataRequirements);
  if(!requirements.length)return {pct:null,done:0,total:0,open:0};
  const done=requirements.filter(item=>satisfiedEvidence.has(String(item.status||'').toLowerCase())).length;
  return {pct:Math.round((done/requirements.length)*100),done,total:requirements.length,open:requirements.length-done};
}
function bind(button,type,key,handler){if(!button)return;if(events?.bind)return events.bind(button,type,key,handler);button.addEventListener(type,handler)}

function renderFourPhaseJourney(){
  if(!clientMode())return;
  const lifecycle=$('relystraPhaseZeroClient');
  const original=lifecycle?.querySelector('.relystra-p0-stages');
  const card=lifecycle?.querySelector('.relystra-p0-card');
  const status=phaseZeroStatus();
  if(!original||!card||!status)return;
  let host=card.querySelector('.relystra-v3-four-phase');
  if(!host){
    host=document.createElement('div');host.className='relystra-v3-four-phase';
    original.before(host);
    const details=document.createElement('details');details.className='relystra-v3-lifecycle-details';details.innerHTML='<summary>View detailed delivery gates</summary>';
    original.parentNode.insertBefore(details,original);details.appendChild(original);
  }
  const rawStage=String(status.current_stage||'').toLowerCase();
  const current=rawStage==='complete'?PHASES.length:currentPhaseIndex(rawStage);
  host.innerHTML=PHASES.map((phase,index)=>`<div class="relystra-v3-phase ${index<current?'done':index===current?'current':'upcoming'}"><span>${index<current?'✓':index+1}</span><div><b>${esc(phase.label)}</b><small>${statusWord(index,current)}</small></div></div>`).join('');
  const head=card.querySelector('.relystra-p0-head h2');if(head)head.textContent='Your engagement in four clear phases.';
  const copy=card.querySelector('.relystra-p0-head p');if(copy)copy.textContent='Relystra keeps the detailed evidence gates underneath, while this view shows the four client-facing phases that matter most.';
}

function renderOwnerSignals(){
  if(!clientMode())return;
  const primaryTop=document.querySelector('.nexus-client-primary-action .nexus-client-primary-top');
  if(primaryTop&&!primaryTop.querySelector('.relystra-v3-owner-chip')){
    const chip=document.createElement('span');chip.className='relystra-v3-owner-chip client';chip.textContent='Owner: You';primaryTop.appendChild(chip);
  }
  const working=document.querySelector('.nexus-client-today-strip>div:first-child');
  if(working&&!working.querySelector('.relystra-v3-owner-inline')){
    const chip=document.createElement('small');chip.className='relystra-v3-owner-inline';chip.textContent='Owner: Relystra';working.appendChild(chip);
  }
  document.querySelectorAll('.nexus-client-progress-row.now').forEach(row=>{
    if(row.querySelector('.relystra-v3-owner-inline'))return;const chip=document.createElement('span');chip.className='relystra-v3-owner-inline';chip.textContent='Owner: You';row.querySelector('div')?.appendChild(chip);
  });
}

async function getClientInbox(){
  if(!state.companyId)return[];
  try{const {data,error}=await sb.rpc('nexus_get_inbox',{p_company_id:state.companyId});if(error)throw error;return arr(data)}
  catch(error){console.warn('Relystra V3 decision center could not read Inbox.',error);return[]}
}
async function renderDecisionCenter(){
  if(!clientMode()||!state.companyId)return;
  const primary=document.querySelector('.nexus-client-primary-action');if(!primary)return;
  let host=$('relystraV3DecisionCenter');if(!host){host=document.createElement('section');host.id='relystraV3DecisionCenter';host.className='relystra-v3-decision-center';primary.after(host)}
  const items=await getClientInbox();
  const decisions=items.filter(item=>item.kind==='approval'&&(item.can_approve||['pending','changes_requested'].includes(String(item.status||'').toLowerCase())));
  if(!decisions.length){host.innerHTML='<div><span class="kicker">Decisions</span><b>No decision is waiting on you.</b><small>Relystra will surface approvals here only when your decision is required.</small></div>';return}
  host.innerHTML=`<div><span class="kicker">Decision center</span><b>${decisions.length} ${decisions.length===1?'decision needs':'decisions need'} your review.</b><small>${esc(decisions[0].title||'Open the Inbox to review the decision and its consequences.')}</small></div><button class="btn secondary" type="button" data-v3-open-inbox>Review decisions</button>`;
  bind(host.querySelector('[data-v3-open-inbox]'),'click','v3:decision-center',()=>document.getElementById('nexusClientInboxButton')?.click());
}

function renderEvidenceReadiness(){
  if(!clientMode())return;
  const root=$('nexus-client-files');if(!root)return;
  const panel=root.querySelector('.nexus-client-files-panel');if(!panel)return;
  let host=$('relystraV3EvidenceReadiness');if(!host){host=document.createElement('section');host.id='relystraV3EvidenceReadiness';host.className='relystra-v3-readiness';panel.before(host)}
  const readiness=evidenceReadiness();
  const accept=document.getElementById('docFile')?.getAttribute('accept')||'.pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg';
  const openRequests=arr(state.docRequests).filter(request=>String(request.status||'').toLowerCase()==='requested').length;
  host.innerHTML=`<div><span class="kicker">Evidence readiness</span><b>${readiness.pct==null?'Start with requested evidence':`${readiness.pct}% of known requirements addressed`}</b><small>${readiness.total?`${readiness.done} of ${readiness.total} preparation requirements currently satisfied. `:''}${openRequests} explicit ${openRequests===1?'request':'requests'} open. This is evidence readiness—not project completion.</small></div><div class="relystra-v3-readiness-meta"><span>Accepted files</span><b>${esc(accept.replaceAll(',',' · ').replaceAll('.','').toUpperCase())}</b></div>`;
}

function discoveryGuideState(){
  const status=phaseZeroStatus();const stage=String(status?.current_stage||'discovery').toLowerCase();
  const stagePosition={discovery:0,diagnosis:1,commercial:2,onboarding:3,implementation:4,verification:5,measurement:6,acceptance:7,complete:8}[stage]??0;
  const hasCompany=!!state.companyId;
  const hasEvidence=arr(state.docs).length>0||evidenceReadiness().done>0;
  return [
    {label:'Company',done:hasCompany,where:'Workspace identity'},
    {label:'Goals',done:stagePosition>=1,where:'Today'},
    {label:'Workflow',done:stagePosition>=1,where:'Today'},
    {label:'Systems',done:stagePosition>=1,where:'Files'},
    {label:'Evidence',done:stagePosition>=1||hasEvidence,where:'Files'},
    {label:'Complete',done:stagePosition>=2,where:'Today'}
  ];
}
function renderOnboardingGuide(){
  if(!clientMode())return;
  const root=$('nexus-client-today');if(!root)return;
  const status=phaseZeroStatus();if(!status||['commercial','onboarding','implementation','verification','measurement','acceptance','complete'].includes(String(status.current_stage||'').toLowerCase())){$('relystraV3OnboardingGuide')?.remove();return}
  let host=$('relystraV3OnboardingGuide');if(!host){host=document.createElement('section');host.id='relystraV3OnboardingGuide';host.className='relystra-v3-onboarding';const anchor=root.querySelector('.relystra-p0-card')?.parentElement||root.querySelector('.nexus-client-primary-action');anchor?.after(host)}
  const steps=discoveryGuideState(),done=steps.filter(step=>step.done).length,pct=Math.round(done/steps.length*100);
  const currentStep=steps.findIndex(step=>!step.done);
  host.innerHTML=`<div class="relystra-v3-onboarding-head"><div><span class="kicker">First-run guide</span><h2>Set up the discovery foundation.</h2><p>Work through the six checkpoints in order. Relystra keeps the detailed tasks and evidence rules underneath.</p></div><strong>${pct}%</strong></div><div class="relystra-v3-onboarding-steps">${steps.map((step,index)=>`<div class="${step.done?'done':index===currentStep?'current':''}"><span>${step.done?'✓':index+1}</span><b>${esc(step.label)}</b><small>${step.done?'Complete':index===currentStep?'Current':'Upcoming'}</small></div>`).join('')}</div><div class="actions"><button class="btn secondary" type="button" data-v3-onboarding-today>Continue in Today</button><button class="btn secondary" type="button" data-v3-onboarding-files>Open Files</button></div>`;
  bind(host.querySelector('[data-v3-onboarding-today]'),'click','v3:onboarding-today',()=>document.querySelector('[data-client-view="today"]')?.click());
  bind(host.querySelector('[data-v3-onboarding-files]'),'click','v3:onboarding-files',()=>document.querySelector('[data-client-view="files"]')?.click());
}

function metricContext(metric){
  const measured=!!metric?.measured_at&&metric?.current_value!=null;
  const method=metric?.measurement_method||metric?.method||metric?.notes||'';
  const windowText=metric?.measurement_window||[metric?.measurement_window_start,metric?.measurement_window_end].filter(Boolean).join(' → ');
  const confidence=metric?.confidence||'';
  return {measured,method,windowText,confidence};
}
function enhanceMetrics(){
  if(!clientMode())return;
  const cards=[...document.querySelectorAll('#nexus-client-improvement .nexus-client-metric-grid article')];
  cards.forEach((card,index)=>{
    if(card.dataset.v3Metric==='1')return;card.dataset.v3Metric='1';
    const metric=arr(state.metrics)[index]||{},context=metricContext(metric),labels=card.querySelectorAll('span');
    if(labels[0])labels[0].childNodes[0].nodeValue='Baseline';
    if(labels[1])labels[1].childNodes[0].nodeValue=context.measured?'Observed current':'Current (not yet verified)';
    if(labels[2])labels[2].childNodes[0].nodeValue='Target (not observed)';
    const meta=document.createElement('div');meta.className='relystra-v3-metric-meta';
    meta.innerHTML=`${context.method?`<span><b>Method</b>${esc(context.method)}</span>`:''}${context.windowText?`<span><b>Window</b>${esc(context.windowText)}</span>`:''}${context.confidence?`<span><b>Confidence</b>${esc(context.confidence)}</span>`:''}${metric?.evidence?`<span><b>Evidence</b>${esc(metric.evidence)}</span>`:''}`;
    if(meta.childElementCount)card.appendChild(meta);
  });
}

function renderProjectSummary(){
  if(!clientMode())return;
  const root=$('nexus-client-improvement');if(!root)return;
  const project=currentProject(),status=phaseZeroStatus(),metrics=arr(state.metrics),targetMetric=metrics.find(metric=>metric.target_value!=null)||metrics[0]||null;
  if(!project)return;
  let host=$('relystraV3ProjectSummary');if(!host){host=document.createElement('section');host.id='relystraV3ProjectSummary';host.className='relystra-v3-project-summary';const grid=root.querySelector('.nexus-client-record-grid');grid?.before(host)}
  const owner=ownerForCurrentContext();
  host.innerHTML=`<div class="relystra-v3-summary-head"><div><span class="kicker">Project summary</span><h2>${esc(project.name||'Relystra engagement')}</h2></div><span class="relystra-v3-owner-chip ${owner==='You'?'client':'relystra'}">Owner now: ${esc(owner)}</span></div><div class="relystra-v3-summary-grid"><div><span>Problem</span><b>${esc(project.summary||project.problem_statement||'Defined in the approved engagement record.')}</b></div><div><span>Solution</span><b>${esc(project.service_type||project.project_type||'Controlled implementation')}</b></div><div><span>Stage</span><b>${esc(status?.current_stage||project.engagement_stage||project.status||'Active')}</b></div><div><span>Next action</span><b>${esc(status?.next_required||project.client_status_update||'Review the current workspace action.')}</b></div><div><span>Target metric</span><b>${targetMetric?`${esc(targetMetric.name||'Measurement')}: ${esc(targetMetric.target_value??'—')} ${esc(targetMetric.unit||'')}`:'Not established yet'}</b></div><div><span>Latest update</span><b>${esc(project.client_status_update||'See the project plan below for the latest recorded state.')}</b></div></div>`;
}

async function loadReleasedReport(){
  if(!clientMode()||!state.companyId)return null;
  if(cachedReportCompany===state.companyId)return cachedReleasedReport;
  if(clientReleaseBusy)return cachedReleasedReport;clientReleaseBusy=true;
  try{
    const {data,error}=await sb.from('nexus_diagnosis_report_releases').select('id,status,released_at,report_version,client_report,revoked_at').eq('company_id',state.companyId).eq('status','released').order('released_at',{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;cachedReportCompany=state.companyId;cachedReleasedReport=serializeReleasedClientReport(data);return cachedReleasedReport;
  }catch(error){console.warn('Relystra V3 client report summary unavailable.',error);return null}
  finally{clientReleaseBusy=false}
}
async function renderDiagnosisAtGlance(){
  if(!clientMode())return;
  const report=await loadReleasedReport();if(!report){$('relystraV3DiagnosisAtGlance')?.remove();return}
  const root=$('nexus-client-reports');if(!root)return;
  let host=$('relystraV3DiagnosisAtGlance');if(!host){host=document.createElement('section');host.id='relystraV3DiagnosisAtGlance';host.className='relystra-v3-diagnosis-glance';const stack=root.querySelector('.nexus-client-report-stack');stack?.before(host)}
  const cards=[
    ['Primary finding',firstOf(report,['findings','priorities','summary'])],
    ['Recommended first move',firstOf(report,['recommendations','next_steps','implementation_plan'])],
    ['Risk / constraint',firstOf(report,['risks','limitations'])],
    ['Success measure',firstOf(report,['metrics','expected_outcomes','baseline'])]
  ].filter(([,value])=>value&&value!=='—');
  host.innerHTML=`<div><span class="kicker">Diagnosis at a glance</span><h2>${esc(report.title||'Released Relystra diagnosis')}</h2><p>${esc(report.executive_summary||report.summary||'Reviewed findings are available below.')}</p></div><div class="relystra-v3-glance-grid">${cards.map(([label,value])=>`<article><span>${esc(label)}</span><b>${esc(value)}</b></article>`).join('')}</div>`;
}

function openAdminSection(name){document.querySelector(`.side-nav button[data-section="${CSS.escape(name)}"]`)?.click()}
function renderAdminControls(){
  if(!state.admin||state.viewMode==='client')return;
  const card=$('relystraPhaseZeroAdmin')?.querySelector('.relystra-p0-card');if(!card)return;
  let host=$('relystraV3AdminControls');if(!host){host=document.createElement('details');host.id='relystraV3AdminControls';host.className='relystra-v3-admin-controls';host.innerHTML='<summary>Recovery & control</summary><div class="relystra-v3-admin-control-body"></div>';card.appendChild(host)}
  const body=host.querySelector('.relystra-v3-admin-control-body');
  body.innerHTML='<p>Use controlled recovery paths instead of skipping lifecycle gates. Relystra intentionally does not expose an arbitrary “force stage forward” control.</p><div class="actions"><button class="btn secondary" type="button" data-v3-refresh>Refresh authoritative state</button><button class="btn secondary" type="button" data-v3-decisions>Open Decisions</button><button class="btn secondary" type="button" data-v3-work>Open Work</button><button class="btn secondary" type="button" data-v3-files>Open Files</button></div><small>Existing gate controls can record a failed/reopened gate with evidence. Consequential stage changes remain server-validated and auditable.</small>';
  bind(body.querySelector('[data-v3-refresh]'),'click','v3:admin-refresh',async()=>{await window.RelystrPhaseZeroLifecycle?.refresh?.({reloadWorkspace:true});toast?.('Authoritative lifecycle state refreshed.');schedule()});
  bind(body.querySelector('[data-v3-decisions]'),'click','v3:admin-decisions',()=>openAdminSection('notifications'));
  bind(body.querySelector('[data-v3-work]'),'click','v3:admin-work',()=>openAdminSection('tasks'));
  bind(body.querySelector('[data-v3-files]'),'click','v3:admin-files',()=>openAdminSection('documents'));
}

function analysisResult(run){const value=run?.analysis_result;if(!value)return{};if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return{summary:String(value)}}}
async function renderAdminIntelligence(){
  if(!state.admin||state.viewMode==='client'||!state.companyId||adminBriefBusy)return;
  const root=$('adminJourneyRoot');if(!root)return;adminBriefBusy=true;
  try{
    const project=currentProject();
    let query=sb.from('nexus_diagnosis_runs').select('id,status,analysis_result,created_at').eq('company_id',state.companyId).neq('status','draft').order('created_at',{ascending:false}).limit(1);
    if(project?.id)query=query.eq('project_id',project.id);
    const {data,error}=await query.maybeSingle();if(error)throw error;
    const result=analysisResult(data);
    const missing=arr(state.dataRequirements).filter(item=>!satisfiedEvidence.has(String(item.status||'').toLowerCase()));
    let host=$('relystraV3AdminBrief');if(!host){host=document.createElement('section');host.id='relystraV3AdminBrief';host.className='relystra-v3-admin-brief';const lifecycle=$('relystraPhaseZeroAdmin');lifecycle?.after(host)}
    const cards=[
      ['Top bottleneck',firstOf(result,['bottlenecks','root_causes','findings'])],
      ['Automation candidate',firstOf(result,['opportunity_backlog','opportunities','recommended_automation','recommendations'])],
      ['Follow-up question',firstOf(result,['follow_up_questions','questions','unknowns'])],
      ['Risk flag',firstOf(result,['risks','risk_flags','constraints'])],
      ['Missing evidence',missing.length?`${missing.length} known requirement${missing.length===1?'':'s'} still unresolved`:'No unresolved requirement is visible in the current workspace']
    ];
    host.innerHTML=`<div class="relystra-v3-admin-brief-head"><div><span class="kicker">AI-assisted operator brief</span><h2>What deserves attention before the next move?</h2><p>${data?'Derived from the latest saved diagnosis plus current evidence state.':'No saved diagnosis is available yet; evidence state is shown without inventing findings.'}</p></div><span>Operator review required</span></div><div class="relystra-v3-admin-brief-grid">${cards.map(([label,value])=>`<article><span>${esc(label)}</span><b>${esc(value)}</b></article>`).join('')}</div><small>Relystra AI assists with synthesis. It does not approve scope, client commitments, launch, access, or other consequential decisions.</small>`;
  }catch(error){console.warn('Relystra V3 operator brief unavailable.',error)}
  finally{adminBriefBusy=false}
}

async function applyClient(){
  renderFourPhaseJourney();renderOwnerSignals();renderEvidenceReadiness();renderOnboardingGuide();enhanceMetrics();renderProjectSummary();
  await Promise.all([renderDecisionCenter(),renderDiagnosisAtGlance()]);
}
async function applyAdmin(){renderAdminControls();await renderAdminIntelligence()}
async function apply(){if(clientMode())await applyClient();else await applyAdmin()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply().catch(error=>console.warn('Relystra Experience V3 refresh failed.',error))})}

ensureCss();
for(const name of ['nexus:workspace-ready','nexus:workspace-updated','nexus:task-changed','nexus:diagnosis-changed','nexus:diagnosis-updated','nexus:resolution-plan-confirmed'])window.addEventListener(name,()=>{cachedReportCompany=null;schedule()});
document.addEventListener('click',()=>setTimeout(schedule,80),false);
document.addEventListener('change',()=>setTimeout(schedule,80),false);
await apply();setTimeout(schedule,250);setTimeout(schedule,900);
window.RelystrExperienceV3={apply,renderFourPhaseJourney,renderProjectSummary,renderAdminIntelligence};
