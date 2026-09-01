const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,$,toast,workspace}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=v=>v?new Date(v).toLocaleString():'—';
const terminal=new Set(['completed','complete','closed','archived','cancelled','canceled','done']);
let portfolio=[],portfolioLoading=false,filterText='',filterLifecycle='all';

function canonicalProject(){return window.NexusFoundationHardening?.activeProject?.()||null}
function lifecycleFor(project){
  if(!project)return {key:'intake',label:'Initiation / Intake'};
  const status=String(project.status||'').toLowerCase();
  if(terminal.has(status))return {key:'archived',label:'Complete / Archived'};
  const type=String(project.project_type||'').toLowerCase(),service=String(project.service_type||'').toLowerCase();
  if(type.includes('workspace')||type.includes('discovery')||type.includes('intake')||service.includes('opportunity assessment'))return {key:'intake',label:'Initiation / Intake'};
  return {key:'active',label:'In Progress / Active'};
}
function stageFor(project){
  if(!project)return 'Workspace setup';
  const type=String(project.project_type||'').replaceAll('_',' ').trim();
  const service=String(project.service_type||'').trim();
  return type||service||'Engagement';
}
function unresolved(t){return !terminal.has(String(t.status||'').toLowerCase())&&!['approved','not_applicable'].includes(String(t.status||'').toLowerCase())}
function taskWeight(t){const status=String(t.status||'').toLowerCase(),priority=String(t.priority||'').toLowerCase();const due=t.due_date?Date.parse(`${t.due_date}T23:59:59`):Infinity;const overdue=Number.isFinite(due)&&due<Date.now();if(status==='ready_for_review')return 0;if(status==='blocked'||overdue)return 1;if(priority==='critical'||priority==='high')return 2;return 3}
function nextAction(tasks){return [...tasks].filter(unresolved).sort((a,b)=>taskWeight(a)-taskWeight(b)||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))||String(a.created_at||'').localeCompare(String(b.created_at||'')))[0]||null}

function ensureCompaniesSection(){
  if(!state.admin)return;
  const nav=document.querySelector('.side-nav'),main=document.querySelector('.main');if(!nav||!main)return;
  let button=nav.querySelector('[data-section="companies"]');
  if(!button){button=document.createElement('button');button.type='button';button.dataset.section='companies';button.textContent='Companies';const anchor=nav.querySelector('[data-section="overview"]');anchor?.after(button);button.addEventListener('click',()=>activateCompanies())}
  let section=$('section-companies');
  if(!section){section=document.createElement('section');section.id='section-companies';section.className='section';section.innerHTML='<div class="toolbar"><div><div class="eyebrow">Portfolio operating view</div><h1 style="font-size:36px;margin:6px 0">Companies</h1><p class="small">One portfolio view for every client, active engagement, lifecycle status, and next action.</p></div></div><div id="nexusCompaniesRoot" class="nexus-companies-shell"><div class="empty">Loading companies…</div></div>';main.appendChild(section)}
}
function activateCompanies(){
  ensureCompaniesSection();document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b.dataset.section==='companies'));document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id==='section-companies'));window.scrollTo({top:0,left:0,behavior:'auto'});loadPortfolio(true)
}
async function loadPortfolio(force=false){
  if(!state.admin||portfolioLoading)return;if(portfolio.length&&!force){renderPortfolio();return}portfolioLoading=true;
  const root=$('nexusCompaniesRoot');if(root)root.innerHTML='<div class="empty">Loading companies…</div>';
  try{
    const [companiesQ,activeQ,projectsQ,tasksQ,activityQ]=await Promise.all([
      sb.from('nexus_companies').select('id,name,website,industry,created_at,updated_at').order('name'),
      sb.from('nexus_active_engagements').select('company_id,project_id,updated_at'),
      sb.from('nexus_projects').select('id,company_id,name,service_type,status,project_type,start_date,target_end_date,created_at,updated_at'),
      sb.from('nexus_tasks').select('id,company_id,project_id,title,status,priority,due_date,assignee,created_at,updated_at').order('created_at',{ascending:false}),
      sb.from('nexus_activity_log').select('company_id,created_at,summary').order('created_at',{ascending:false}).limit(1000)
    ]);
    for(const q of [companiesQ,activeQ,projectsQ,tasksQ,activityQ])if(q.error)throw q.error;
    const activeMap=new Map((activeQ.data||[]).map(x=>[x.company_id,x.project_id]));
    const projects=projectsQ.data||[],tasks=tasksQ.data||[],activity=activityQ.data||[];
    portfolio=(companiesQ.data||[]).map(company=>{
      const cp=projects.filter(p=>p.company_id===company.id),activeId=activeMap.get(company.id);let project=cp.find(p=>p.id===activeId)||null;
      if(!project){const open=cp.filter(p=>!terminal.has(String(p.status||'').toLowerCase()));if(open.length===1)project=open[0]}
      const companyTasks=tasks.filter(t=>t.company_id===company.id),next=nextAction(companyTasks),last=activity.find(a=>a.company_id===company.id)?.created_at||project?.updated_at||company.updated_at||company.created_at;
      return {company,project,lifecycle:lifecycleFor(project),stage:stageFor(project),next,last,openCount:companyTasks.filter(unresolved).length}
    });
    renderPortfolio();
  }catch(error){console.error('Nexus Companies failed',error);if(root)root.innerHTML=`<div class="note"><b>Companies could not load.</b><br>${esc(error.message||'Refresh and try again.')}</div>`}
  finally{portfolioLoading=false}
}
function filteredPortfolio(){const q=filterText.toLowerCase();return portfolio.filter(x=>(filterLifecycle==='all'||x.lifecycle.key===filterLifecycle)&&(!q||[x.company.name,x.company.industry,x.project?.name,x.stage,x.next?.title].some(v=>String(v||'').toLowerCase().includes(q))))}
function companyActions(x){return `<div class="nexus-company-actions"><a class="btn primary" href="/portal?view_mode=admin&company=${encodeURIComponent(x.company.id)}">Open workspace</a><a class="btn secondary" href="/portal?view_mode=client&company=${encodeURIComponent(x.company.id)}">Client View</a></div>`}
function renderPortfolio(){
  const root=$('nexusCompaniesRoot');if(!root)return;const rows=filteredPortfolio(),counts={intake:portfolio.filter(x=>x.lifecycle.key==='intake').length,active:portfolio.filter(x=>x.lifecycle.key==='active').length,archived:portfolio.filter(x=>x.lifecycle.key==='archived').length};
  root.innerHTML=`<div class="nexus-company-summary"><div><b>${counts.intake}</b><span>Initiation / Intake</span></div><div><b>${counts.active}</b><span>In Progress / Active</span></div><div><b>${counts.archived}</b><span>Complete / Archived</span></div></div><div class="nexus-companies-toolbar"><div class="field"><label for="nexusCompanySearch">Search companies</label><input id="nexusCompanySearch" placeholder="Company, engagement, stage, next action" value="${esc(filterText)}"></div><div class="field"><label for="nexusCompanyLifecycle">Lifecycle status</label><select id="nexusCompanyLifecycle"><option value="all">All statuses</option><option value="intake" ${filterLifecycle==='intake'?'selected':''}>Initiation / Intake</option><option value="active" ${filterLifecycle==='active'?'selected':''}>In Progress / Active</option><option value="archived" ${filterLifecycle==='archived'?'selected':''}>Complete / Archived</option></select></div><button class="btn secondary nexus-company-refresh" type="button">Refresh</button></div>${rows.length?`<div class="nexus-company-table-wrap"><table class="nexus-company-table"><thead><tr><th>Company</th><th>Engagement</th><th>Status</th><th>Current stage</th><th>Next action</th><th>Last activity</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td><h3>${esc(x.company.name)}</h3><span class="small">${esc(x.company.industry||'Industry not recorded')}</span></td><td><b>${esc(x.project?.name||'No active engagement')}</b><div class="small">${x.openCount} open action${x.openCount===1?'':'s'}</div></td><td><span class="nexus-lifecycle ${x.lifecycle.key}">${esc(x.lifecycle.label)}</span></td><td>${esc(x.stage)}<div class="small">${esc(x.project?.status||'workspace setup')}</div></td><td>${x.next?`<b>${esc(x.next.title)}</b><div class="small">${x.next.status==='ready_for_review'?'Ready for Nexus review':x.next.assignee==='client'?'Waiting on client':'Nexus owned'}</div>`:'<span class="small">No open action</span>'}</td><td>${esc(dt(x.last))}</td><td>${companyActions(x)}</td></tr>`).join('')}</tbody></table></div><div class="nexus-company-cards">${rows.map(x=>`<article class="nexus-company-card"><div class="nexus-company-card-head"><div><h3>${esc(x.company.name)}</h3><span class="small">${esc(x.company.industry||'Industry not recorded')}</span></div><span class="nexus-lifecycle ${x.lifecycle.key}">${esc(x.lifecycle.label)}</span></div><div class="nexus-company-card-grid"><div><b>Engagement</b><span>${esc(x.project?.name||'No active engagement')}</span></div><div><b>Stage</b><span>${esc(x.stage)}</span></div><div><b>Next action</b><span>${esc(x.next?.title||'No open action')}</span></div><div><b>Last activity</b><span>${esc(dt(x.last))}</span></div></div>${companyActions(x)}</article>`).join('')}</div>`:'<div class="empty">No companies match these filters.</div>'}`;
  $('nexusCompanySearch')?.addEventListener('input',e=>{filterText=e.target.value;renderPortfolio()});$('nexusCompanyLifecycle')?.addEventListener('change',e=>{filterLifecycle=e.target.value;renderPortfolio()});root.querySelector('.nexus-company-refresh')?.addEventListener('click',()=>loadPortfolio(true));
}

function ensureMobileNav(){
  const sidebar=document.querySelector('.sidebar'),nav=document.querySelector('.side-nav');if(!sidebar||!nav)return;let toggle=$('nexusMobileNavToggle');
  if(!toggle){toggle=document.createElement('button');toggle.id='nexusMobileNavToggle';toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<span>Workspace menu</span><small>Show</small>';nav.before(toggle);toggle.addEventListener('click',()=>{const collapsed=sidebar.classList.toggle('nexus-mobile-nav-collapsed');toggle.setAttribute('aria-expanded',String(!collapsed));toggle.querySelector('small').textContent=collapsed?'Show':'Hide'})}
  const mobile=matchMedia('(max-width:760px)').matches;if(mobile&&!sidebar.dataset.mobileNavInitialized){sidebar.dataset.mobileNavInitialized='1';sidebar.classList.add('nexus-mobile-nav-collapsed');toggle.setAttribute('aria-expanded','false')}
  if(!mobile){sidebar.classList.remove('nexus-mobile-nav-collapsed');toggle.setAttribute('aria-expanded','true')}
  if(!$('nexusMobileCompanyLabel')){const select=$('companySelect');if(select){const label=document.createElement('span');label.id='nexusMobileCompanyLabel';label.className='nexus-mobile-company-label';label.textContent='Client company';select.before(label)}}
  nav.querySelectorAll('button').forEach(b=>{if(b.dataset.mobileCollapseBound)return;b.dataset.mobileCollapseBound='1';b.addEventListener('click',()=>{if(matchMedia('(max-width:760px)').matches){sidebar.classList.add('nexus-mobile-nav-collapsed');toggle.setAttribute('aria-expanded','false');toggle.querySelector('span').textContent=b.textContent.trim();toggle.querySelector('small').textContent='Show'}})});
}

function ensureInboxAdvanced(){
  const controls=document.querySelector('.nexus-inbox-controls'),root=$('nexusInboxRoot');if(!controls||!root||$('nexusInboxAdvancedFilters'))return;
  const box=document.createElement('div');box.id='nexusInboxAdvancedFilters';box.className='nexus-inbox-advanced';box.innerHTML=`<div class="field"><label for="nexusInboxSearch">Search Inbox</label><input id="nexusInboxSearch" placeholder="Company, summary, action"></div>${state.admin?`<div class="field"><label for="nexusInboxCompany">Company</label><select id="nexusInboxCompany"><option value="all">All companies</option>${(state.companies||[]).map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>`:''}<div class="field"><label for="nexusInboxType">Type</label><select id="nexusInboxType"><option value="all">All types</option><option>Approval</option><option>Action item</option><option>Evidence request</option><option>Client question</option><option>Founder decision</option><option>Update</option></select></div><div class="field"><label for="nexusInboxStatus">Status</label><select id="nexusInboxStatus"><option value="all">All statuses</option><option value="ready for review">Ready for review</option><option value="pending">Pending</option><option value="waiting on client">Waiting on client</option><option value="changes requested">Changes requested</option><option value="open">Open</option><option value="unread">Unread</option></select></div>`;
  controls.after(box);box.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',applyInboxAdvanced));new MutationObserver(applyInboxAdvanced).observe(root,{childList:true,subtree:true});applyInboxAdvanced();
}
function applyInboxAdvanced(){
  const root=$('nexusInboxRoot');if(!root)return;const search=String($('nexusInboxSearch')?.value||'').trim().toLowerCase(),company=$('nexusInboxCompany')?.value||'all',type=$('nexusInboxType')?.value||'all',status=$('nexusInboxStatus')?.value||'all';
  root.querySelectorAll('.nexus-inbox-card').forEach(card=>{const pills=[...card.querySelectorAll('.pill')].map(x=>x.textContent.trim().toLowerCase()),text=card.textContent.toLowerCase();const okSearch=!search||text.includes(search),okCompany=company==='all'||text.includes(company.toLowerCase()),okType=type==='all'||pills[0]===type.toLowerCase(),okStatus=status==='all'||pills.some(p=>p.includes(status));card.classList.toggle('nexus-inbox-hidden',!(okSearch&&okCompany&&okType&&okStatus))});
}

function guidance(task){
  const type=String(task.task_type||'').toLowerCase(),phase=String(task.phase||'').toLowerCase();let why='Nexus needs this to keep the engagement moving without making assumptions.',provide=task.instructions||task.description||'Complete the action described above.',next='Submit it to Nexus. Nexus will review it, approve it, or tell you exactly what needs revision.';
  if(type==='workflow_evidence'||type==='upload'){why='This evidence verifies how the work actually happens and reduces diagnosis assumptions.';provide=task.instructions||'Upload the requested current-state file or representative example in the Secure Data Room.';next='After the file is uploaded, submit this action to Nexus for review. Uploading alone does not mark the action complete.'}
  else if(type==='approval'){why='This decision requires human authority before Nexus can move to the next controlled step.';next='Submit your decision. Nexus records it in the approval trail and advances only after the required review.'}
  else if(type==='access'){why='The implementation cannot proceed safely until the required access boundary is confirmed.';provide=task.instructions||'Follow the secure access instructions. Never put passwords, MFA codes, API keys, or secrets in Nexus comments.'}
  else if(type==='decision'){why='Nexus needs an explicit business decision rather than inferring one from incomplete evidence.'}
  else if(phase==='diagnosis'||type==='diagnosis_action'){why='This closes an evidence, ownership, metric, or decision gap found during diagnosis.'}
  return {why,provide,next};
}
function enhanceActionCards(){
  const root=$('taskList');if(!root)return;root.querySelectorAll('.action-v2-card').forEach(card=>{if(card.querySelector('.nexus-action-guidance'))return;const task=(state.tasks||[]).find(t=>t.id===card.dataset.taskId);if(!task)return;const g=guidance(task),box=document.createElement('div');box.className='nexus-action-guidance';box.innerHTML=`<div><b>Why this matters</b><span>${esc(g.why)}</span></div><div><b>What to provide / do</b><span>${esc(g.provide)}</span></div><div><b>What happens next</b><span>${esc(g.next)}</span></div>`;card.querySelector('.action-v2-actions')?.before(box);if(!state.admin&&['workflow_evidence','upload'].includes(String(task.task_type||'').toLowerCase())){const submit=card.querySelector('.client-submit-task');if(submit)submit.textContent='Submit evidence for review →'}})
}
async function submitEvidenceTask(task,card,button){
  const projectDocs=(state.docs||[]).filter(d=>d.project_id===task.project_id&&d.source_role==='client');if(!projectDocs.length)return toast?.('Upload at least one relevant file for this engagement before submitting this evidence action.');
  const note=card.querySelector(`[data-client-note="${CSS.escape(task.id)}"]`)?.value.trim()||'';const response={...(task.response_data||{}),client_note:note,evidence_submission:{document_ids:projectDocs.map(d=>d.id),submitted_at:new Date().toISOString()}};button.disabled=true;const original=button.textContent;button.textContent='Submitting…';
  try{const {error}=await sb.rpc('nexus_submit_task_for_review',{p_task_id:task.id,p_response_data:response});if(error)throw error;toast?.('Evidence submitted to Nexus for review.');await workspace();setTimeout(enhanceActionCards,80)}catch(error){toast?.(error.message||'Evidence action could not be submitted.')}finally{if(button.isConnected){button.disabled=false;button.textContent=original}}
}
function installEvidenceSubmitOverride(){
  if(document.documentElement.dataset.nexusEvidenceSubmitOverride==='1')return;document.documentElement.dataset.nexusEvidenceSubmitOverride='1';document.addEventListener('click',event=>{const button=event.target.closest?.('.client-submit-task');if(!button||state.admin||state.platformAdmin||state.previewReadOnly)return;const card=button.closest('.action-v2-card'),task=(state.tasks||[]).find(t=>t.id===card?.dataset.taskId);if(!task||!['workflow_evidence','upload'].includes(String(task.task_type||'').toLowerCase()))return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();submitEvidenceTask(task,card,button)},true)
}
function installActiveEngagementUploadGuard(){
  if(document.documentElement.dataset.nexusUploadProjectGuard==='1')return;document.documentElement.dataset.nexusUploadProjectGuard='1';document.addEventListener('change',event=>{const input=event.target;if(!input.matches?.('input[type="file"]'))return;const scoped=input.matches('.vnext-evidence-upload input[type="file"],#adminTranscriptFile,#adminEvidenceFile,#docFile');if(!scoped||!input.files?.length)return;if(canonicalProject()?.id)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();input.value='';toast?.('Select or resolve one active engagement before uploading. Nexus will not attach evidence to an arbitrary project.')},true)
}

async function flagChangedDiscovery(event){
  if(!state.admin||event.detail?.companyId!==state.companyId)return;try{const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,created_at').eq('company_id',event.detail.companyId).eq('project_id',event.detail.projectId).neq('id',event.detail.runId).in('status',['approved','ready_for_review']).order('created_at',{ascending:false}).limit(1);if(error||!data?.length)return;const {data:existing}=await sb.from('nexus_notifications').select('id').eq('user_id',state.user.id).eq('notification_type','discovery_context_changed').eq('related_id',event.detail.runId).is('read_at',null).limit(1);if(existing?.length)return;await sb.from('nexus_notifications').insert({company_id:event.detail.companyId,user_id:state.user.id,notification_type:'discovery_context_changed',title:'New discovery context may change the diagnosis',message:'Discovery context was captured after an existing diagnosis. Review the new evidence and rerun/update the diagnosis before relying on the prior recommendation.',related_type:'diagnosis_run',related_id:event.detail.runId,created_by:state.user.id,action_url:'/portal?view=intake'})}catch(error){console.warn('Discovery freshness notice failed',error?.message||error)}
}
function improvePdfLabels(){document.querySelectorAll('.vnext-full-pdf').forEach(b=>{if(!/Internal/i.test(b.textContent))b.textContent='Download Internal PDF'});document.querySelectorAll('.vnext-client-pdf').forEach(b=>{if(!/Client/i.test(b.textContent))b.textContent='Download Client PDF'})}

function reconcile(){ensureMobileNav();ensureCompaniesSection();ensureInboxAdvanced();enhanceActionCards();improvePdfLabels()}
installEvidenceSubmitOverride();installActiveEngagementUploadGuard();window.addEventListener('nexus:discovery-context-captured',flagChangedDiscovery);window.addEventListener('resize',ensureMobileNav,{passive:true});
const observer=new MutationObserver(()=>requestAnimationFrame(reconcile));observer.observe(document.body,{childList:true,subtree:true});
reconcile();if(new URLSearchParams(location.search).get('view')==='companies'&&state.admin)setTimeout(activateCompanies,100);
window.NexusOperatingModel={activateCompanies,loadPortfolio,reconcile};
