const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,$,toast,workspace,log}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const done=s=>['completed','approved','done','complete','not_applicable'].includes(String(s||'').toLowerCase());
const clientWaiting=t=>t.assignee==='client'&&!done(t.status)&&t.status!=='ready_for_review';
const nexusWaiting=t=>t.assignee==='nexus'&&!done(t.status)&&t.status!=='ready_for_review';
const reviewWaiting=t=>t.status==='ready_for_review';

const STAGES=[
 {n:1,key:'setup',title:'Set Up Client',desc:'Confirm the client workspace and engagement project. This is the only setup step.',section:'clients'},
 {n:2,key:'discovery',title:'Discovery & Diagnosis',desc:'Collect evidence, let Nexus identify material information gaps, request only what is still missing, add admin context, run the diagnosis, and approve the findings.',phase:'discovery'},
 {n:3,key:'plan',title:'Agree on the Plan',desc:'Turn the approved diagnosis into one practical implementation plan and get explicit approval before building.',phase:'solution_design',package:'solution_design'},
 {n:4,key:'implementation',title:'Build, Test & Launch',desc:'Build the approved solution, run functional testing and QA/QC, complete client acceptance testing, and approve launch.',phase:'implementation',package:'implementation_launch'},
 {n:5,key:'training',title:'Train & Handoff',desc:'Train the owner/team, confirm the SOP, and make sure the client knows how the system is controlled.',phase:'training',package:'training_handoff'},
 {n:6,key:'finish',title:'Measure, Optimize & Complete',desc:'Record what changed, review failures and feedback, decide what comes next, and explicitly close the engagement.',phase:'optimization',package:'monthly_optimization'}
];

let initialized=false,journeyButton=null,toolButtons={},diagnosisRuns=[],journeyNotice=null,renderedMove=null;

function company(){return state.companies?.find(c=>c.id===state.companyId)||null}
function project(){return window.NexusFoundationHardening?.activeProject?.()||state.projects?.[0]||null}
function tasksFor(stage){return stage.phase?(state.tasks||[]).filter(t=>t.phase===stage.phase):[]}
function packageExists(stage){return !!stage.package&&(state.tasks||[]).some(t=>t.package_code===stage.package)}
function latestDiagnosis(){return diagnosisRuns.find(run=>run.status!=='draft')||null}
function diagnosisHasResult(run=latestDiagnosis()){const r=run?.analysis_result;return !!r&&(typeof r==='string'?!!r.trim():Object.keys(r||{}).length>0)}
function diagnosisApproved(){const r=latestDiagnosis();return !!r&&r.status==='approved'&&diagnosisHasResult(r)}
function stageStatus(stage){
 if(stage.key==='setup')return project()?'complete':'not_started';
 if(stage.key==='discovery'){
   const r=latestDiagnosis();
   if(r){
     if(diagnosisApproved())return 'complete';
     if(r.status==='ready_for_review'&&diagnosisHasResult(r))return 'review';
     if(['queued','analyzing'].includes(r.status))return 'in_progress';
     if(['ready_for_analysis','revision_requested','blocked','failed'].includes(r.status))return 'nexus';
     if(diagnosisHasResult(r))return 'review';
   }
   const tasks=tasksFor(stage);
   if(tasks.some(reviewWaiting))return 'review';
   if(tasks.some(clientWaiting))return 'client';
   if(tasks.some(nexusWaiting)||tasks.length)return 'in_progress';
   return 'not_started';
 }
 if(stage.key==='finish'&&String(project()?.status||'').toLowerCase()==='complete')return 'complete';
 const tasks=tasksFor(stage);
 if(!tasks.length)return 'not_started';
 if(tasks.every(t=>done(t.status))){if(stage.key==='finish')return !(state.metrics||[]).length?'needs_measurement':'ready_to_finish';return 'complete'}
 if(tasks.some(reviewWaiting))return 'review';
 if(tasks.some(clientWaiting))return 'client';
 if(tasks.some(nexusWaiting))return 'nexus';
 return 'in_progress';
}
function firstIncomplete(){return STAGES.find(s=>stageStatus(s)!=='complete')||STAGES[STAGES.length-1]}
function priorComplete(stage){return STAGES.filter(s=>s.n<stage.n).every(s=>stageStatus(s)==='complete')}
function counts(){const tasks=state.tasks||[];return {client:tasks.filter(clientWaiting).length,nexus:tasks.filter(nexusWaiting).length,review:tasks.filter(reviewWaiting).length}}
function statusText(status){return ({complete:'Complete',not_started:'Not started',client:'Waiting on client',nexus:'Your work',review:'Ready for review',in_progress:'In progress',needs_measurement:'Record a result',ready_to_finish:'Ready to complete'}[status]||'In progress')}
function statusClass(status,current){if(status==='complete')return 'complete';if(['review','client','needs_measurement','ready_to_finish'].includes(status))return 'attention';return current?'current':''}
function stepCounts(stage){const tasks=tasksFor(stage);return {all:tasks.length,done:tasks.filter(t=>done(t.status)).length,client:tasks.filter(clientWaiting).length,nexus:tasks.filter(nexusWaiting).length,review:tasks.filter(reviewWaiting).length}}

async function loadJourneyData(){
 const activeProject=project();if(!state.admin||!state.companyId||!activeProject?.id){diagnosisRuns=[];return}
 const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,project_id,status,created_at,analysis_result,analysis_completed_at,execution_error').eq('company_id',state.companyId).eq('project_id',activeProject.id).neq('status','draft').order('created_at',{ascending:false}).limit(20);
 if(error){console.error('Journey diagnosis status load failed',error);diagnosisRuns=[];journeyNotice={message:'Nexus could not read Discovery & Diagnosis status. Refresh the workspace or open Discovery & Diagnosis.',type:'error'};return}
 diagnosisRuns=data||[];
}
function ensureSection(){const main=document.querySelector('.main');if(!main)return null;let section=$('section-journey');if(!section){section=document.createElement('section');section.id='section-journey';section.className='section admin-journey-section';section.innerHTML='<div id="adminJourneyRoot"></div>';main.prepend(section)}return section}
async function showJourney(){if(!state.admin)return;ensureSection();await loadJourneyData();document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id==='section-journey'));document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b===journeyButton));renderJourney();window.scrollTo(0,0)}
function activateSection(section){document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${section}`));document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b.dataset.section===section));window.scrollTo(0,0)}
function openTool(section,view){const b=toolButtons[section]||document.querySelector(`.side-nav button[data-section="${section}"]`);if(b)b.click();else if($(`section-${section}`))activateSection(section);else return toast('That tool is not available in this workspace.');if(section==='tasks'&&view)setTimeout(()=>document.querySelector(`#actionExecutionFilters button[data-view="${view}"]`)?.click(),120)}
function rebuildAdminNav(){
 if(!state.admin)return;const nav=document.querySelector('.side-nav');if(!nav)return;
 const existing=[...nav.querySelectorAll('button[data-section]')];existing.forEach(b=>toolButtons[b.dataset.section]=b);nav.innerHTML='';
 const head=document.createElement('div');head.className='ops-nav-group';head.textContent='Client Delivery';nav.appendChild(head);
 journeyButton=document.createElement('button');journeyButton.type='button';journeyButton.className='journey-primary active';journeyButton.textContent='Client Journey';journeyButton.onclick=showJourney;nav.appendChild(journeyButton);
 if(toolButtons.clients){toolButtons.clients.textContent='Clients';nav.appendChild(toolButtons.clients)}
 const note=document.createElement('div');note.className='admin-journey-only-note';note.textContent='Run the engagement from Client Journey. Open supporting tools only when the current step sends you there.';nav.appendChild(note);
 const drawer=document.createElement('details');drawer.className='admin-tool-drawer';drawer.innerHTML='<summary>Tools & records</summary><div class="admin-tool-buttons"></div>';const box=drawer.querySelector('.admin-tool-buttons');
 const order=[['intake','Discovery & Diagnosis'],['tasks','Action Items'],['documents','Files & Information'],['approvals','Approvals'],['automations','Automations'],['metrics','Improvements'],['timeline','Projects & Milestones'],['requests','Requests'],['activity','Activity'],['command','Command Center'],['overview','Client Snapshot']];
 order.forEach(([key,label])=>{const b=toolButtons[key];if(!b)return;b.textContent=label;box.appendChild(b)});nav.appendChild(drawer);
 const pill=document.querySelector('.topbar .pill');if(pill)pill.textContent='CLIENT DELIVERY';
}
function recordsTarget(stage){return ({setup:'clients',discovery:'intake',plan:'approvals',implementation:'automations',training:'tasks',finish:'metrics'}[stage.key]||'tasks')}
function stageAction(stage,status,locked){
 if(locked)return '<span class="journey-status">Locked</span>';
 if(stage.key==='setup')return project()?'<button class="btn secondary" data-open="clients" type="button">View client</button>':'<button class="btn primary" data-open="clients" type="button">Set up client →</button>';
 if(stage.key==='discovery'){
   const label=status==='complete'?'View approved diagnosis':status==='review'?'Review diagnosis':status==='client'?'Review Discovery & Diagnosis':status==='in_progress'?'View Discovery & Diagnosis':'Open Discovery & Diagnosis →';
   return `<button class="btn ${status==='complete'?'secondary':'primary'}" data-open="intake" type="button">${label}</button>`;
 }
 if(status==='complete')return `<button class="btn secondary" data-stage-records="${stage.key}" type="button">View records</button>`;
 if(status==='ready_to_finish')return '<button class="btn primary" data-finish-engagement type="button">Complete engagement →</button>';
 if(status==='review')return '<button class="btn primary" data-open="tasks" data-view="ready_review" type="button">Review submission →</button>';
 if(status==='client')return '<button class="btn primary" data-open="tasks" data-view="client_work" type="button">See what client owes →</button>';
 if(status==='nexus'||status==='in_progress')return '<button class="btn primary" data-open="tasks" data-view="my_work" type="button">Continue my work →</button>';
 if(status==='needs_measurement')return '<button class="btn primary" data-open="metrics" type="button">Record result →</button>';
 if(status==='not_started'&&stage.package)return `<button class="btn primary" data-start-package="${stage.package}" type="button">Start this step →</button>`;
 return '';
}
function nextMove(stage,status){
 if(stage.key==='setup'&&!project())return {title:'Set up this client first',copy:'Create or confirm the client engagement project. After that, Nexus can guide the work in order.',label:'Open Clients',open:'clients'};
 if(stage.key==='discovery'){
   const r=latestDiagnosis();
   if(!r){
     if(status==='client')return {title:'The client has requested discovery information to complete',copy:'Open Discovery & Diagnosis to see the outstanding information gaps and current evidence. Nexus will automatically incorporate the client response when it arrives.',label:'Open Discovery & Diagnosis',open:'intake'};
     if(status==='review')return {title:'New client discovery information is ready',copy:'Open Discovery & Diagnosis, review the new evidence, refresh the material-gap analysis, and run the diagnosis when the evidence is sufficient.',label:'Review Discovery Information',open:'intake'};
     return {title:'Build the evidence-backed diagnosis',copy:'Open Discovery & Diagnosis. Add relevant evidence, let Nexus identify material information gaps, request only what is still missing, add your context, then run the diagnosis.',label:'Open Discovery & Diagnosis',open:'intake'};
   }
   if(['queued','analyzing'].includes(r.status))return {title:'Diagnosis is running',copy:'Nexus is analyzing the authorized evidence, client responses, and admin context. Open Discovery & Diagnosis to view the current state.',label:'View Diagnosis Status',open:'intake'};
   if(['ready_for_analysis'].includes(r.status))return {title:'Run the diagnosis',copy:'The evidence is ready for analysis. Open Discovery & Diagnosis and run the existing diagnosis.',label:'Run Diagnosis',open:'intake'};
   if(['revision_requested','blocked','failed'].includes(r.status))return {title:'Resolve the diagnosis issue',copy:'Open Discovery & Diagnosis to review the failure or revision instruction, correct the issue, and retry without losing the evidence already collected.',label:'Resolve Diagnosis',open:'intake'};
   if(r.status==='ready_for_review'||diagnosisHasResult(r))return {title:'Review and approve the diagnosis',copy:'Analysis is complete. Review the evidence-backed current state, process map, bottlenecks, root causes, baselines, priorities, unknowns, and recommended first intervention, then approve when correct.',label:'Review Diagnosis',open:'intake'};
   return {title:'Continue Discovery & Diagnosis',copy:'Open Step 2 to continue from the current evidence and diagnosis state.',label:'Open Discovery & Diagnosis',open:'intake'};
 }
 if(stage.key==='finish'){
   if(!(state.metrics||[]).length)return {title:'Record what changed',copy:'Add at least one baseline/current result before closing the engagement. This becomes your proof of impact.',label:'Open Improvements',open:'metrics'};
   if(status==='not_started')return {title:'Run the final review',copy:'Create the optimization/closeout actions to review KPIs, failures, feedback, and the next recommendation.',label:'Start Final Review',package:stage.package};
   if(status==='ready_to_finish')return {title:'Complete the engagement',copy:'Delivery, handoff, optimization review, and a measured result are complete. Close the engagement when you are satisfied.',label:'Mark Engagement Complete',finish:true};
 }
 if(status==='not_started'&&stage.package)return {title:`Start Step ${stage.n}: ${stage.title}`,copy:'Nexus will create the standard actions for this stage in the correct order.',label:'Start This Step',package:stage.package};
 if(status==='review')return {title:'A submission is ready for you',copy:'Review what the client submitted. Approve it or send it back for revision.',label:'Review Now',open:'tasks',view:'ready_review'};
 if(status==='client')return {title:'The client has the next move',copy:'Check the client queue and follow up only on the outstanding action.',label:'View Client Work',open:'tasks',view:'client_work'};
 if(status==='nexus'||status==='in_progress')return {title:'You have the next move',copy:'Open your Nexus work and complete the next unblocked action.',label:'Continue My Work',open:'tasks',view:'my_work'};
 if(status==='needs_measurement')return {title:'Record the result before closing',copy:'Capture the baseline, current value, and measurement context so the impact is documented.',label:'Record Result',open:'metrics'};
 return {title:'Review this stage',copy:'Open the supporting records for this stage.',label:'Open Records',open:recordsTarget(stage)};
}
function renderJourney(){
 if(!state.admin)return;const root=$('adminJourneyRoot');if(!root)return;
 const current=firstIncomplete(),currentStatus=stageStatus(current),move=nextMove(current,currentStatus),c=counts(),co=company(),p=project(),completed=STAGES.filter(s=>stageStatus(s)==='complete').length;renderedMove={move,stage:current};
 root.innerHTML=`<div class="admin-journey-hero"><div><div class="eyebrow">Nexus admin · guided delivery</div><h1>Run this client one step at a time.</h1><p>Stay on this page. Nexus tells you the current stage, who has the next move, and which supporting tool to open.</p></div><div class="admin-journey-client"><span>Active client</span><b>${esc(co?.name||'No client selected')}</b><span style="margin-top:7px">${esc(p?.name||'No engagement project')}</span></div></div>
 <div class="journey-progress">${STAGES.map(s=>`<span class="${stageStatus(s)==='complete'?'complete':s.key===current.key?'current':''}"></span>`).join('')}</div>
 <section class="journey-focus"><div class="journey-focus-top"><div><div class="kicker">Your next move · Step ${current.n} of ${STAGES.length}</div><h2>${esc(move.title)}</h2><p>${esc(move.copy)}</p></div><span class="journey-status ${statusClass(currentStatus,true)}">${esc(statusText(currentStatus))}</span></div>${journeyNotice?`<div class="journey-inline-notice ${esc(journeyNotice.type)}">${esc(journeyNotice.message)}</div>`:''}<div class="journey-focus-actions"><button id="journeyPrimaryAction" class="btn primary" data-primary-action type="button">${esc(move.label)} →</button>${current.n>1?'<button class="btn secondary" data-current-records type="button">View step records</button>':''}</div></section>
 <div class="journey-summary-grid"><div class="journey-summary-card"><b>${completed}/${STAGES.length}</b><span>Stages complete</span></div><div class="journey-summary-card"><b>${c.client}</b><span>Waiting on client</span></div><div class="journey-summary-card"><b>${c.review+c.nexus}</b><span>Need your attention</span></div></div>
 <div class="journey-steps">${STAGES.map(stage=>{const status=stageStatus(stage),isCurrent=stage.key===current.key,locked=!priorComplete(stage),sc=stepCounts(stage);let meta='';if(stage.key==='discovery'){const r=latestDiagnosis();meta=diagnosisApproved()?'<span>Diagnosis approved</span>':r?.status==='ready_for_review'?'<span>Diagnosis ready for review</span>':['queued','analyzing'].includes(r?.status)?'<span>Diagnosis running</span>':['blocked','failed','revision_requested'].includes(r?.status)?'<span>Diagnosis needs attention</span>':r?.status==='ready_for_analysis'?'<span>Evidence ready for diagnosis</span>':diagnosisHasResult(r)?'<span>Diagnosis output ready</span>':sc.client?`<span>${sc.client} client request${sc.client===1?'':'s'} open</span>`:'<span>Evidence collection and diagnosis not yet approved</span>'}else if(stage.phase)meta=`<span>${sc.done}/${sc.all||0} actions complete</span>`;return `<article class="journey-step ${status==='complete'?'complete':''} ${isCurrent?'current':''} ${locked?'locked':''}"><div class="journey-step-number">${status==='complete'?'✓':stage.n}</div><div><h3>${stage.title}</h3><p>${stage.desc}</p><div class="journey-step-meta">${meta}${sc.client&&stage.key!=='discovery'?`<span>${sc.client} client</span>`:''}${sc.review?`<span>${sc.review} review</span>`:''}${sc.nexus?`<span>${sc.nexus} Nexus</span>`:''}</div></div><div class="journey-step-action">${stageAction(stage,status,locked)}</div></article>`}).join('')}</div>
 <details class="journey-help"><summary>What happened to the other Nexus tabs?</summary><p>Nothing was removed. Discovery & Diagnosis, Action Items, Files, Approvals, Automations, Improvements, Projects, Requests, and Activity remain supporting systems. Client Journey tells you when to use them.</p></details>`;
 root.onclick=handleJourneyClick;
}
async function handleJourneyClick(event){const b=event.target.closest('button');if(!b)return;if(b.matches('[data-primary-action]')){event.preventDefault();return runMove(renderedMove?.move,renderedMove?.stage,b)}if(b.dataset.open){event.preventDefault();return openTool(b.dataset.open,b.dataset.view||null)}if(b.dataset.startPackage){event.preventDefault();return startPackage(b.dataset.startPackage,b)}if(b.dataset.currentRecords!==undefined){event.preventDefault();return openTool(recordsTarget(renderedMove.stage))}if(b.dataset.stageRecords){event.preventDefault();const stage=STAGES.find(s=>s.key===b.dataset.stageRecords);return openTool(recordsTarget(stage))}if(b.hasAttribute('data-finish-engagement')){event.preventDefault();return finishEngagement()}}
async function runMove(move,stage,button){if(!move||!stage){journeyNotice={message:'Nexus could not resolve the current action. Reload the workspace and try again.',type:'error'};return renderJourney()}if(move.open)return openTool(move.open,move.view);if(move.package)return startPackage(move.package,button);if(move.finish)return finishEngagement();return openTool(recordsTarget(stage))}
async function startPackage(code,button){
 const stage=STAGES.find(s=>s.package===code);if(!stage){journeyNotice={message:'This workflow package is not recognized.',type:'error'};return renderJourney()}
 if(packageExists(stage))return openTool('tasks',stageStatus(stage)==='client'?'client_work':stageStatus(stage)==='review'?'ready_review':'my_work');
 const p=project();if(!p){journeyNotice={message:'Set up the client project first.',type:'error'};return renderJourney()}
 const original=button?.textContent;if(button){button.disabled=true;button.textContent='Starting…'}journeyNotice=null;
 try{const {data,error}=await sb.rpc('nexus_assign_action_package',{p_company_id:state.companyId,p_project_id:p.id,p_package_code:code,p_start_date:new Date().toISOString().slice(0,10)});if(error)throw error;try{if(log)await log('journey_stage_started','project',p.id,`Started guided client stage: ${stage.title}`)}catch{}await workspace();await loadJourneyData();if(!packageExists(stage))throw new Error('No action items were created. Nexus kept the stage unchanged so it can be retried safely.');journeyNotice={message:Number(data)>0?`${data} action item${Number(data)===1?'':'s'} created for ${stage.title}.`:`${stage.title} was already initialized. No duplicate work was created.`,type:'success'};renderJourney()}catch(error){console.error('Journey package start failed',error);journeyNotice={message:`${stage.title} could not start: ${error.message||'Unknown error'}.`,type:'error'};toast(journeyNotice.message);renderJourney()}finally{if(button&&button.isConnected){button.disabled=false;button.textContent=original||'Start this step →'}}
}
async function finishEngagement(){const p=project();if(!p)return;if(!confirm('Mark this client engagement complete? All records will remain available.'))return;const {error}=await sb.from('nexus_projects').update({status:'complete',updated_at:new Date().toISOString()}).eq('id',p.id);if(error){journeyNotice={message:error.message||'The engagement could not be completed.',type:'error'};return renderJourney()}try{if(log)await log('engagement_completed','project',p.id,`Engagement completed: ${p.name}`)}catch{}toast('Engagement marked complete.');await workspace();await showJourney()}
async function init(){if(initialized||!state.admin)return;initialized=true;ensureSection();rebuildAdminNav();await showJourney();$('companySelect')?.addEventListener('change',()=>setTimeout(async()=>{journeyNotice=null;rebuildAdminNav();await showJourney()},650));const refreshDiagnosisJourney=()=>setTimeout(showJourney,120);window.addEventListener('nexus:diagnosis-changed',refreshDiagnosisJourney);window.addEventListener('nexus:diagnosis-updated',refreshDiagnosisJourney)}
function tryInit(){if(state.admin&&state.user&&document.querySelector('.side-nav'))init()}
tryInit();sb.auth.onAuthStateChange(()=>setTimeout(tryInit,500));