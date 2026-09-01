const portal=window.NexusPortal;
if(!portal?.state?.admin)throw new Error('Nexus Admin Command Center requires platform administrator access.');
if(!window.NexusStore)throw new Error('NexusStore must load before the Admin Command Center.');

const {sb,state,runtime,toast}=portal;
const {events,boundary}=runtime;
const store=window.NexusStore;
const $=id=>document.getElementById(id);
const arr=value=>Array.isArray(value)?value:[];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=cents=>Number.isFinite(Number(cents))?new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(cents)/100):'—';
const terminal=new Set(['complete','completed','done','closed','resolved','cancelled','canceled','archived']);
const scope=events.createScope('admin-command-center');
let portfolio=null;
let builderCompanyId=null;
let builderData=null;

function companyName(id){return arr(state.companies).find(company=>company.id===id)?.name||'Client workspace'}
function clamp(value,min,max){return Math.min(max,Math.max(min,Number(value)||min))}
function opportunityRows(result){return Array.isArray(result?.opportunity_backlog)?result.opportunity_backlog:[]}
function opportunityTitle(item,index){if(typeof item==='string')return item;return item?.title||item?.name||item?.opportunity||`Opportunity ${index+1}`}
function opportunitySummary(item){if(typeof item==='string')return item;return item?.summary||item?.description||item?.rationale||item?.recommendation||''}
function inferredHours(item){const explicit=Number(item?.monthly_hours_saved||item?.hours_saved||item?.estimated_hours_saved);if(Number.isFinite(explicit)&&explicit>0)return clamp(explicit,1,500);const impact=Number(item?.impact_score||item?.value_score||item?.priority_score||0);return impact>=8?40:impact>=5?20:10}
function inferredComplexity(item){return clamp(item?.implementation_complexity||item?.complexity||item?.effort_score||3,1,5)}
function statusLabel(value){return String(value||'unknown').replaceAll('_',' ')}

function ensureMaster(){
  let button=$('nexusAdminMasterButton');
  if(!button){
    button=document.createElement('button');
    button.id='nexusAdminMasterButton';
    button.type='button';
    button.className='btn primary nac-master-button';
    button.textContent='Admin Master View';
    document.querySelector('.topbar')?.insertBefore(button,$('signOutBtn')||null);
  }
  let overlay=$('nexusAdminMaster');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='nexusAdminMaster';
    overlay.className='nac-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="nac-shell"><header><div><div class="kicker">Nexus Intelligence</div><h1>Admin Master View</h1><p>Exceptions, client decisions, evidence gaps, and delivery status across every active workspace.</p></div><button id="nacClose" class="btn secondary" type="button">Close</button></header><nav class="nac-tabs" aria-label="Admin master navigation"><button class="active" type="button" data-admin-tab="portfolio">Portfolio</button><button type="button" data-admin-tab="builder">Diagnosis & ROI</button></nav><main><section id="nacPortfolio" class="active"></section><section id="nacBuilder"></section></main></div>';
    document.body.appendChild(overlay);
  }
  scope.bind(button,'click','master:open',openMaster);
  scope.bind($('nacClose'),'click','master:close',closeMaster);
  scope.delegate(overlay,'click','master:tabs','[data-admin-tab]',(_event,target)=>activateAdminTab(target.dataset.adminTab));
  scope.delegate(overlay,'click','master:actions','[data-admin-company],[data-builder-company],[data-open-builder]',(_event,target)=>{
    if(target.dataset.adminCompany)return switchCompany(target.dataset.adminCompany);
    if(target.hasAttribute('data-builder-company'))return target.dataset.builderCompany?openBuilderFor(target.dataset.builderCompany):resetBuilder();
    if(target.dataset.openBuilder)return openBuilderFor(target.dataset.openBuilder);
  });
}

function openMaster(){
  const overlay=$('nexusAdminMaster');
  if(!overlay)return;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden','false');
  document.body.classList.add('nac-master-open');
  activateAdminTab('portfolio');
  loadPortfolio();
}
function closeMaster(){
  const overlay=$('nexusAdminMaster');
  if(!overlay)return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden','true');
  document.body.classList.remove('nac-master-open');
  store.setModalState(null);
}
function activateAdminTab(tab){
  const next=tab==='builder'?'builder':'portfolio';
  document.querySelectorAll('.nac-tabs [data-admin-tab]').forEach(button=>button.classList.toggle('active',button.dataset.adminTab===next));
  document.querySelectorAll('#nexusAdminMaster main>section').forEach(section=>section.classList.toggle('active',section.id===(next==='builder'?'nacBuilder':'nacPortfolio')));
  store.setModalState(next==='builder'?'DIAGNOSIS_BUILDER':null);
  if(next==='builder')renderBuilderLanding();
}
function resetBuilder(){builderCompanyId=null;builderData=null;store.setModalState('DIAGNOSIS_BUILDER');renderBuilderLanding()}

async function loadPortfolio(){
  await boundary.run('admin portfolio load',async()=>{
    const results=await Promise.all([
      sb.from('nexus_tasks').select('id,company_id,title,status,assignee,due_date,updated_at').order('updated_at',{ascending:false}),
      sb.from('nexus_document_requests').select('id,company_id,title,status,due_date,owner_scope').order('created_at',{ascending:false}),
      sb.from('nexus_approval_chains').select('id,company_id,title,status,visibility,due_at,entity_type,entity_id').order('created_at',{ascending:false}),
      sb.from('nexus_diagnosis_runs').select('id,company_id,status,updated_at').order('updated_at',{ascending:false}),
      sb.from('nexus_client_intake').select('company_id,status,current_step,updated_at'),
      sb.from('nexus_roi_estimates').select('id,company_id,status,client_visible,title').order('created_at',{ascending:false})
    ]);
    const labels=['Tasks','Evidence requests','Approvals','Diagnosis','Intake','ROI'];
    results.forEach((result,index)=>{if(result.error)throw new Error(`${labels[index]}: ${result.error.message}`)});
    portfolio={tasks:results[0].data||[],requests:results[1].data||[],approvals:results[2].data||[],runs:results[3].data||[],intakes:results[4].data||[],roi:results[5].data||[]};
    renderPortfolio();
  });
}
function overdue(item){
  const raw=item?.due_date||item?.due_at;
  if(!raw)return false;
  const value=new Date(raw).getTime();
  return Number.isFinite(value)&&value<Date.now();
}
function companyStats(company){
  const tasks=portfolio.tasks.filter(row=>row.company_id===company.id&&!terminal.has(String(row.status||'').toLowerCase()));
  const requests=portfolio.requests.filter(row=>row.company_id===company.id&&String(row.status||'').toLowerCase()==='requested');
  const approvals=portfolio.approvals.filter(row=>row.company_id===company.id&&!terminal.has(String(row.status||'').toLowerCase())&&row.status!=='draft');
  const runs=portfolio.runs.filter(row=>row.company_id===company.id);
  const intake=portfolio.intakes.find(row=>row.company_id===company.id)||null;
  const roi=portfolio.roi.filter(row=>row.company_id===company.id);
  return {tasks,requests,approvals,runs,intake,roi,overdue:tasks.filter(overdue).length+requests.filter(overdue).length+approvals.filter(overdue).length};
}
function companyCard(row){
  const {company,tasks,requests,approvals,runs,intake,roi,overdue:overdueCount}=row;
  const latestRun=runs[0];
  const intakeText=intake?.status==='submitted'?'Intake submitted':intake?`Intake step ${intake.current_step}`:'Intake not started';
  return `<article><div class="nac-company-top"><div><b>${esc(company.name)}</b><small>${esc(company.industry||company.website||'Client')}</small></div>${overdueCount?`<span class="nac-alert">${overdueCount} overdue</span>`:'<span class="nac-ok">On track</span>'}</div><div class="nac-company-stats"><span><b>${requests.length}</b> evidence</span><span><b>${tasks.length}</b> tasks</span><span><b>${approvals.length}</b> approvals</span><span><b>${roi.length}</b> ROI cards</span></div><p>${esc(intakeText)} · Diagnosis ${esc(latestRun?.status||'not started')}</p><div class="actions"><button class="btn secondary" type="button" data-admin-company="${esc(company.id)}">Open workspace</button><button class="btn primary" type="button" data-open-builder="${esc(company.id)}">Diagnosis & ROI →</button></div></article>`;
}
function renderPortfolio(){
  const root=$('nacPortfolio');
  if(!root||!portfolio)return;
  const companies=arr(state.companies);
  const stats=companies.map(company=>({company,...companyStats(company)}));
  const pendingEvidence=portfolio.requests.filter(row=>String(row.status||'').toLowerCase()==='requested').length;
  const openTasks=portfolio.tasks.filter(row=>!terminal.has(String(row.status||'').toLowerCase())).length;
  const pendingApprovals=portfolio.approvals.filter(row=>!terminal.has(String(row.status||'').toLowerCase())&&row.status!=='draft').length;
  const overdueCount=stats.reduce((sum,row)=>sum+row.overdue,0);
  root.innerHTML=`<div class="nac-metrics"><article><span>Active workspaces</span><strong>${companies.length}</strong></article><article><span>Pending evidence</span><strong>${pendingEvidence}</strong></article><article><span>Open tasks</span><strong>${openTasks}</strong></article><article><span>Client approvals</span><strong>${pendingApprovals}</strong></article><article class="${overdueCount?'warn':''}"><span>Overdue</span><strong>${overdueCount}</strong></article></div><section class="nac-panel"><div class="nac-section-head"><div><div class="kicker">Client portfolio</div><h2>Workspaces requiring attention</h2></div></div><div class="nac-company-grid">${stats.map(companyCard).join('')}</div></section>`;
}
async function switchCompany(companyId){
  const select=$('companySelect');
  if(!select)return;
  closeMaster();
  if(select.value!==companyId){select.value=companyId;select.dispatchEvent(new Event('change',{bubbles:true}));}
}

function renderBuilderLanding(){
  const root=$('nacBuilder');
  if(!root)return;
  if(builderCompanyId&&builderData){renderBuilder();return;}
  const cards=arr(state.companies).map(company=>`<button type="button" data-builder-company="${esc(company.id)}"><b>${esc(company.name)}</b><span>Open builder →</span></button>`).join('');
  root.innerHTML=`<header class="nac-builder-head"><div><div class="kicker">Diagnosis & ROI Builder</div><h2>Select a client workspace.</h2><p>Use existing discovery evidence and diagnosis output to create reviewed implementation priorities.</p></div></header><div class="nac-builder-company-list">${cards}</div>`;
}
async function openBuilderFor(companyId){
  builderCompanyId=companyId;
  activateAdminTab('builder');
  await loadBuilder(companyId);
}
async function loadBuilder(companyId){
  const root=$('nacBuilder');
  if(root)root.innerHTML='<div class="nac-loading">Loading diagnosis and ROI context…</div>';
  await boundary.run('diagnosis builder load',async()=>{
    const results=await Promise.all([
      sb.from('nexus_diagnosis_runs').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(5),
      sb.from('nexus_client_intake').select('*').eq('company_id',companyId).maybeSingle(),
      sb.from('nexus_documents').select('id,file_name,category,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
      sb.from('nexus_roi_estimates').select('*').eq('company_id',companyId).order('sort_order').order('created_at'),
      sb.from('nexus_diagnosis_report_releases').select('*').eq('company_id',companyId).order('created_at',{ascending:false})
    ]);
    const labels=['Diagnosis','Intake','Documents','ROI','Releases'];
    results.forEach((result,index)=>{if(result.error)throw new Error(`${labels[index]}: ${result.error.message}`)});
    builderData={runs:results[0].data||[],intake:results[1].data||null,docs:results[2].data||[],roi:results[3].data||[],releases:results[4].data||[]};
    renderBuilder();
  });
}
function diagnosisPanel(run,result,opps,released){
  if(!run)return '<section class="nac-panel"><div class="nac-empty"><b>No diagnosis run yet.</b><span>Complete discovery and evidence intake before building implementation priorities.</span></div></section>';
  const canRelease=['approved','complete','completed'].includes(String(run.status||'').toLowerCase())&&!released;
  const summary=result.executive_summary||run.review_notes||'Diagnosis output is available for admin review.';
  return `<section class="nac-panel"><div class="nac-section-head"><div><div class="kicker">Latest diagnosis</div><h3>${result.executive_summary?'Executive summary':'Diagnosis run'}</h3></div><span class="nac-status">${esc(statusLabel(run.status))}</span></div><p class="nac-summary">${esc(summary)}</p><div class="nac-diagnosis-meta"><span>${opps.length} opportunities</span><span>${arr(result.bottlenecks).length} bottlenecks</span><span>${builderData.docs.length} evidence files</span></div><div class="actions"><button id="nacGenerateRoi" class="btn primary" type="button" ${opps.length?'':'disabled'}>Generate ROI drafts →</button><button id="nacReleaseDiagnosis" class="btn secondary" type="button" ${canRelease?'':'disabled'}>${released?'Report released':'Release client report'}</button></div></section>`;
}
function roiEditorRows(){
  if(!builderData?.roi?.length)return '<div class="nac-empty"><b>No ROI rows yet.</b><span>Generate drafts from the latest diagnosis opportunity backlog, then review before publishing.</span></div>';
  return builderData.roi.map(row=>{
    const hourly=row.hourly_value_cents?Number(row.hourly_value_cents)/100:50;
    const publishLabel=row.status==='draft'?'Publish + request approval':'Refresh approval route';
    return `<article class="nac-roi-row" data-roi-row="${esc(row.id)}"><div class="nac-roi-title"><input data-roi-field="title" value="${esc(row.title)}"><span class="nac-status ${esc(row.status)}">${esc(statusLabel(row.status))}</span></div><textarea data-roi-field="summary" rows="2" placeholder="What this would improve">${esc(row.summary||'')}</textarea><div class="nac-roi-fields"><label>Hours saved / month<input data-roi-field="monthly_hours_saved" type="number" min="0" step="0.5" value="${row.monthly_hours_saved??''}"></label><label>Hourly value assumption ($)<input data-roi-field="hourly_value" type="number" min="0" step="1" value="${hourly}"></label><label>Complexity (1–5)<input data-roi-field="implementation_complexity" type="number" min="1" max="5" step="1" value="${row.implementation_complexity??3}"></label><label>Monthly value<strong data-roi-value>${money(row.monthly_value_cents)}</strong></label></div><div class="actions"><button class="btn secondary" type="button" data-roi-save="${esc(row.id)}">Save</button><button class="btn primary" type="button" data-roi-publish="${esc(row.id)}" ${row.status==='approved'?'disabled':''}>${publishLabel}</button></div></article>`;
  }).join('');
}
function renderBuilder(){
  const root=$('nacBuilder');
  if(!root||!builderData)return;
  const run=builderData.runs[0]||null;
  const result=run?.analysis_result||{};
  const opps=opportunityRows(result);
  const released=!!run&&builderData.releases.some(row=>row.diagnosis_run_id===run.id&&row.status==='released'&&!row.revoked_at);
  const header=`<header class="nac-builder-head"><div><div class="kicker">Diagnosis & ROI Builder</div><h2>${esc(companyName(builderCompanyId))}</h2><p>${builderData.docs.length} evidence files · Intake ${esc(builderData.intake?.status||'not started')} · Diagnosis ${esc(run?.status||'not started')}</p></div><button class="btn secondary" type="button" data-builder-company="">Change client</button></header>`;
  const diagnosis=diagnosisPanel(run,result,opps,released);
  const roi=`<section class="nac-panel"><div class="nac-section-head"><div><div class="kicker">ROI Estimation Matrix</div><h3>Admin-reviewed priorities</h3></div><span>${builderData.roi.length} rows</span></div><p class="nac-assumption-note">Auto-generated values are directional starting assumptions only. Review hours saved, hourly value, complexity, and evidence before publishing.</p><div id="nacRoiTable">${roiEditorRows()}</div></section>`;
  root.innerHTML=header+diagnosis+roi;
  const change=root.querySelector('[data-builder-company=""]');
  if(change)scope.bind(change,'click','builder:change',resetBuilder);
  if($('nacGenerateRoi'))scope.bind($('nacGenerateRoi'),'click','builder:generate-roi',boundary.wrap('ROI draft generation',generateRoiDrafts));
  if($('nacReleaseDiagnosis'))scope.bind($('nacReleaseDiagnosis'),'click','builder:release-diagnosis',boundary.wrap('diagnosis release',releaseDiagnosis));
  root.querySelectorAll('[data-roi-save]').forEach(button=>scope.bind(button,'click',`roi:save:${button.dataset.roiSave}`,boundary.wrap('ROI save',()=>saveRoi(button.dataset.roiSave))));
  root.querySelectorAll('[data-roi-publish]').forEach(button=>scope.bind(button,'click',`roi:publish:${button.dataset.roiPublish}`,boundary.wrap('ROI publish',()=>publishRoi(button.dataset.roiPublish))));
}

async function generateRoiDrafts(){
  const run=builderData?.runs?.[0];
  if(!run)return;
  const existing=new Set(builderData.roi.map(row=>String(row.title||'').trim().toLowerCase()));
  const rows=opportunityRows(run.analysis_result).map((item,index)=>{
    const title=opportunityTitle(item,index);
    const hours=inferredHours(item);
    const hourlyCents=5000;
    return {company_id:builderCompanyId,project_id:run.project_id||null,diagnosis_run_id:run.id,title,summary:opportunitySummary(item),monthly_hours_saved:hours,hourly_value_cents:hourlyCents,monthly_value_cents:Math.round(hours*hourlyCents),implementation_complexity:inferredComplexity(item),confidence:'directional',recommendation:'Directional estimate generated from diagnosis. Admin review required before client release.',status:'draft',client_visible:false,sort_order:index,created_by:state.user.id};
  }).filter(row=>!existing.has(row.title.trim().toLowerCase()));
  if(!rows.length){toast('ROI drafts already exist for the current opportunity backlog.');return;}
  const insert=await sb.from('nexus_roi_estimates').insert(rows).select();
  if(insert.error)throw insert.error;
  toast(`${rows.length} directional ROI draft${rows.length===1?'':'s'} generated for review.`);
  await loadBuilder(builderCompanyId);
}
function roiPayload(id){
  const row=$('nacRoiTable')?.querySelector(`[data-roi-row="${CSS.escape(id)}"]`);
  if(!row)return null;
  const value=name=>row.querySelector(`[data-roi-field="${name}"]`)?.value||'';
  const hours=Number(value('monthly_hours_saved')||0);
  const hourlyCents=Math.round(Number(value('hourly_value')||0)*100);
  return {title:value('title').trim(),summary:value('summary').trim()||null,monthly_hours_saved:hours||null,hourly_value_cents:hourlyCents||null,monthly_value_cents:hours&&hourlyCents?Math.round(hours*hourlyCents):null,implementation_complexity:clamp(value('implementation_complexity')||3,1,5)};
}
async function saveRoi(id,{reload=true}={}){
  const payload=roiPayload(id);
  if(!payload?.title){toast('ROI title is required.');return false;}
  const result=await sb.from('nexus_roi_estimates').update(payload).eq('id',id).select().single();
  if(result.error)throw result.error;
  if(reload){toast('ROI estimate saved.');await loadBuilder(builderCompanyId);}
  return true;
}
async function publishRoi(id){
  if(!await saveRoi(id,{reload:false}))return;
  const fresh=await sb.from('nexus_roi_estimates').select('*').eq('id',id).single();
  if(fresh.error)throw fresh.error;
  const update=await sb.from('nexus_roi_estimates').update({status:'published',client_visible:true}).eq('id',id);
  if(update.error)throw update.error;
  const existing=await sb.from('nexus_approval_chains').select('id,status').eq('entity_type','roi_estimate').eq('entity_id',id).neq('status','cancelled').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(existing.error)throw existing.error;
  if(!existing.data){
    const approval=await sb.rpc('nexus_request_entity_approval',{
      p_company_id:builderCompanyId,
      p_project_id:fresh.data.project_id||null,
      p_title:`Approve scope: ${fresh.data.title}`,
      p_description:'Review this Nexus implementation priority, ROI assumptions, and scope direction. Approve it or request changes.',
      p_approval_type:'scope_priority',
      p_entity_type:'roi_estimate',
      p_entity_id:id,
      p_visibility:'company',
      p_steps:[{step_name:'Client scope approval',approver_scope:'company_role',approver_role:'owner',instructions:'Approve the implementation priority or request changes with a note.'}],
      p_due_at:null
    });
    if(approval.error)throw approval.error;
  }
  toast('ROI priority published to the client and routed for approval.');
  await loadBuilder(builderCompanyId);
}
async function releaseDiagnosis(){
  const run=builderData?.runs?.[0];
  if(!run)return;
  const result=await sb.rpc('nexus_release_diagnosis_report',{p_run_id:run.id});
  if(result.error)throw result.error;
  toast('Client diagnosis released to the portal inbox.');
  await loadBuilder(builderCompanyId);
  window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed',{detail:{companyId:builderCompanyId}}));
}

ensureMaster();
window.NexusAdminCommandCenter=Object.freeze({open:openMaster,close:closeMaster,refresh:loadPortfolio,openBuilder:openBuilderFor,__qa:Object.freeze({opportunityRows,inferredHours,inferredComplexity})});
