const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,$,toast,workspace,log}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const done=s=>['completed','approved','done','complete'].includes(String(s||'').toLowerCase());
const clientWaiting=t=>t.assignee==='client'&&!done(t.status)&&t.status!=='ready_for_review';
const nexusWaiting=t=>t.assignee==='nexus'&&!done(t.status)&&t.status!=='ready_for_review';
const reviewWaiting=t=>t.status==='ready_for_review';

const STAGES=[
 {n:1,key:'setup',title:'Set Up Client',desc:'Make sure the client workspace and engagement project exist. This is the only setup step.',section:'clients'},
 {n:2,key:'discovery',title:'Collect Information',desc:'Gather the discovery answers, transcript, files, goals, systems, and baseline information Nexus needs.',phase:'discovery',package:'client_discovery'},
 {n:3,key:'diagnosis',title:'Diagnose',desc:'Review the evidence, map the workflow, identify bottlenecks, establish the baseline, and rank AI opportunities.',phase:'diagnosis',package:'ai_diagnosis'},
 {n:4,key:'plan',title:'Agree on the Plan',desc:'Turn the diagnosis into one practical implementation plan and get the client’s explicit approval before building.',phase:'solution_design',package:'solution_design'},
 {n:5,key:'implementation',title:'Build, Test & Launch',desc:'Build the approved solution, run functional testing and QA/QC, complete client acceptance testing, and approve launch.',phase:'implementation',package:'implementation_launch'},
 {n:6,key:'training',title:'Train & Handoff',desc:'Train the owner/team, confirm the SOP, and make sure the client knows how the system is controlled.',phase:'training',package:'training_handoff'},
 {n:7,key:'finish',title:'Measure, Optimize & Complete',desc:'Record what changed, review failures and feedback, decide what comes next, and close the engagement when appropriate.',phase:'optimization',package:'monthly_optimization'}
];

let initialized=false;
let journeyButton=null;
let toolButtons={};

function company(){return state.companies?.find(c=>c.id===state.companyId)||null}
function project(){return state.projects?.[0]||null}
function tasksFor(stage){return stage.phase?(state.tasks||[]).filter(t=>t.phase===stage.phase):[]}
function packageExists(stage){return !!stage.package&&(state.tasks||[]).some(t=>t.package_code===stage.package)}
function stageStatus(stage){
 if(stage.key==='setup')return project()?'complete':'not_started';
 if(stage.key==='finish'&&String(project()?.status||'').toLowerCase()==='complete')return 'complete';
 const tasks=tasksFor(stage);
 if(!tasks.length)return 'not_started';
 if(tasks.every(t=>done(t.status))){
   if(stage.key==='finish')return !(state.metrics||[]).length?'needs_measurement':'ready_to_finish';
   return 'complete';
 }
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

function ensureSection(){
 const main=document.querySelector('.main');if(!main)return null;
 let section=$('section-journey');
 if(!section){section=document.createElement('section');section.id='section-journey';section.className='section admin-journey-section';section.innerHTML='<div id="adminJourneyRoot"></div>';main.prepend(section)}
 return section;
}
function showJourney(){
 if(!state.admin)return;
 ensureSection();
 document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id==='section-journey'));
 document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b===journeyButton));
 renderJourney();window.scrollTo(0,0);
}
function openTool(section,view){
 const b=toolButtons[section]||document.querySelector(`.side-nav button[data-section="${section}"]`);if(!b)return toast('That tool is not available in this workspace.');
 b.click();
 if(section==='tasks'&&view)setTimeout(()=>document.querySelector(`#actionExecutionFilters button[data-view="${view}"]`)?.click(),80);
}
function rebuildAdminNav(){
 if(!state.admin)return;
 const nav=document.querySelector('.side-nav');if(!nav)return;
 const buttons=[...nav.querySelectorAll('button[data-section]')];toolButtons=Object.fromEntries(buttons.map(b=>[b.dataset.section,b]));
 nav.innerHTML='';
 const head=document.createElement('div');head.className='ops-nav-group';head.textContent='Client Delivery';nav.appendChild(head);
 journeyButton=document.createElement('button');journeyButton.type='button';journeyButton.className='journey-primary active';journeyButton.textContent='Client Journey';journeyButton.onclick=showJourney;nav.appendChild(journeyButton);
 if(toolButtons.clients){toolButtons.clients.textContent='Clients';nav.appendChild(toolButtons.clients)}
 const note=document.createElement('div');note.className='admin-journey-only-note';note.textContent='Run the engagement from Client Journey. Open the tools below only when the current step sends you there.';nav.appendChild(note);
 const drawer=document.createElement('details');drawer.className='admin-tool-drawer';drawer.innerHTML='<summary>Tools & records</summary><div class="admin-tool-buttons"></div>';const box=drawer.querySelector('.admin-tool-buttons');
 const order=[['tasks','Action Items'],['documents','Files & Information'],['approvals','Approvals'],['automations','Automations'],['metrics','Improvements'],['timeline','Projects & Milestones'],['requests','Requests'],['activity','Activity'],['command','Command Center'],['overview','Client Snapshot']];
 order.forEach(([key,label])=>{const b=toolButtons[key];if(!b)return;b.textContent=label;box.appendChild(b)});nav.appendChild(drawer);
 const pill=document.querySelector('.topbar .pill');if(pill)pill.textContent='CLIENT DELIVERY';
}

function stepCounts(stage){const tasks=tasksFor(stage);return {all:tasks.length,done:tasks.filter(t=>done(t.status)).length,client:tasks.filter(clientWaiting).length,nexus:tasks.filter(nexusWaiting).length,review:tasks.filter(reviewWaiting).length}}
function stageAction(stage,status,locked){
 if(locked)return '<span class="journey-status">Locked</span>';
 if(stage.key==='setup')return project()?'<button class="btn secondary" data-open="clients" type="button">View client</button>':'<button class="btn primary" data-open="clients" type="button">Set up client →</button>';
 if(status==='complete')return `<button class="btn secondary" data-stage-records="${stage.key}" type="button">View records</button>`;
 if(status==='ready_to_finish')return '<button class="btn primary" data-finish-engagement type="button">Complete engagement →</button>';
 if(status==='review')return '<button class="btn primary" data-open="tasks" data-view="ready_review" type="button">Review submission →</button>';
 if(status==='client')return '<button class="btn primary" data-open="tasks" data-view="client_work" type="button">See what client owes →</button>';
 if(status==='nexus'||status==='in_progress')return '<button class="btn primary" data-open="tasks" data-view="my_work" type="button">Continue my work →</button>';
 if(status==='needs_measurement')return '<button class="btn primary" data-open="metrics" type="button">Record result →</button>';
 if(status==='not_started'&&stage.package)return `<button class="btn primary" data-start-package="${stage.package}" data-stage="${stage.key}" type="button">Start this step →</button>`;
 return '';
}
function recordsTarget(stage){return ({setup:'clients',discovery:'documents',diagnosis:'tasks',plan:'approvals',implementation:'automations',training:'tasks',finish:'metrics'}[stage.key]||'tasks')}
function nextMove(stage,status){
 if(stage.key==='setup'&&!project())return {title:'Set up this client first',copy:'Create or confirm the client engagement project. After that, Nexus can generate the work in order.',label:'Open Clients',open:'clients'};
 if(stage.key==='finish'){
   if(!(state.metrics||[]).length)return {title:'Record what changed',copy:'Add at least one baseline/current result before closing the engagement. This becomes your proof of impact.',label:'Open Improvements',open:'metrics'};
   if(status==='not_started')return {title:'Run the final review',copy:'Create the optimization/closeout actions so Nexus can review KPIs, failures, feedback, and the next recommendation.',label:'Start Final Review',package:stage.package};
   if(status==='ready_to_finish')return {title:'Complete the engagement',copy:'The delivery steps and result record are complete. Close the project when you are satisfied with the handoff.',label:'Mark Engagement Complete',finish:true};
 }
 if(status==='not_started'&&stage.package)return {title:`Start Step ${stage.n}: ${stage.title}`,copy:'Nexus will create the standard actions for this stage. Remove or adjust anything that does not apply to this client.',label:'Start This Step',package:stage.package};
 if(status==='review')return {title:'A submission is ready for you',copy:'Review what the client submitted. Approve it or send it back for revision.',label:'Review Now',open:'tasks',view:'ready_review'};
 if(status==='client')return {title:'The client has the next move',copy:'You do not need to invent more work. Check the client queue and follow up only on what is outstanding.',label:'View Client Work',open:'tasks',view:'client_work'};
 if(status==='nexus'||status==='in_progress')return {title:'You have the next move',copy:'Open your Nexus work for this stage and complete the next outstanding item.',label:'Continue My Work',open:'tasks',view:'my_work'};
 if(status==='needs_measurement')return {title:'Record the result before closing',copy:'Capture the baseline, current value, and measurement context so the impact is documented.',label:'Record Result',open:'metrics'};
 return {title:'Review this stage',copy:'Open the supporting records for this stage.',label:'Open Records',open:recordsTarget(stage)};
}

function renderJourney(){
 if(!state.admin)return;const root=$('adminJourneyRoot');if(!root)return;
 const current=firstIncomplete(),currentStatus=stageStatus(current),move=nextMove(current,currentStatus),c=counts(),co=company(),p=project();
 const completed=STAGES.filter(s=>stageStatus(s)==='complete').length;
 root.innerHTML=`<div class="admin-journey-hero"><div><div class="eyebrow">Nexus admin · guided delivery</div><h1>Run this client one step at a time.</h1><p>You do not need to operate every tab. Stay on this page, finish the current step, and let Nexus tell you what comes next.</p></div><div class="admin-journey-client"><span>Active client</span><b>${esc(co?.name||'No client selected')}</b><span style="margin-top:7px">${esc(p?.name||'No engagement project')}</span></div></div>
 <div class="journey-progress">${STAGES.map(s=>`<span class="${stageStatus(s)==='complete'?'complete':s.key===current.key?'current':''}"></span>`).join('')}</div>
 <section class="journey-focus"><div class="journey-focus-top"><div><div class="kicker">Your next move · Step ${current.n} of ${STAGES.length}</div><h2>${esc(move.title)}</h2><p>${esc(move.copy)}</p></div><span class="journey-status ${statusClass(currentStatus,true)}">${esc(statusText(currentStatus))}</span></div><div class="journey-focus-actions"><button id="journeyPrimaryAction" class="btn primary" type="button">${esc(move.label)} →</button>${current.n>1?'<button id="journeyOpenCurrentRecords" class="btn secondary" type="button">View step records</button>':''}</div></section>
 <div class="journey-summary-grid"><div class="journey-summary-card"><b>${completed}/7</b><span>Stages complete</span></div><div class="journey-summary-card"><b>${c.client}</b><span>Waiting on client</span></div><div class="journey-summary-card"><b>${c.review+c.nexus}</b><span>Need your attention</span></div></div>
 <div class="journey-steps">${STAGES.map(stage=>{const status=stageStatus(stage),isCurrent=stage.key===current.key,locked=!priorComplete(stage),sc=stepCounts(stage);return `<article class="journey-step ${status==='complete'?'complete':''} ${isCurrent?'current':''} ${locked?'locked':''}"><div class="journey-step-number">${status==='complete'?'✓':stage.n}</div><div><h3>${stage.title}</h3><p>${stage.desc}</p><div class="journey-step-meta">${stage.phase?`<span>${sc.done}/${sc.all||0} actions complete</span>`:''}${sc.client?`<span>${sc.client} client</span>`:''}${sc.review?`<span>${sc.review} review</span>`:''}${sc.nexus?`<span>${sc.nexus} Nexus</span>`:''}</div></div><div class="journey-step-action">${stageAction(stage,status,locked)}</div></article>`}).join('')}</div>
 <details class="journey-help"><summary>What happened to all the other Nexus tabs?</summary><p>Nothing was removed from the backend. Action Items, Files, Approvals, Automations, Improvements, Projects, Requests, and Activity still work exactly as supporting systems. They are now secondary tools. The Client Journey is the operating layer that tells you when to use each one.</p></details>`;
 const primary=$('journeyPrimaryAction');if(primary)primary.onclick=()=>runMove(move,current);
 $('journeyOpenCurrentRecords')?.addEventListener('click',()=>openTool(recordsTarget(current)));
 root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openTool(b.dataset.open,b.dataset.view||null));
 root.querySelectorAll('[data-start-package]').forEach(b=>b.onclick=()=>startPackage(b.dataset.startPackage,b));
 root.querySelectorAll('[data-stage-records]').forEach(b=>{const stage=STAGES.find(s=>s.key===b.dataset.stageRecords);b.onclick=()=>openTool(recordsTarget(stage))});
 root.querySelectorAll('[data-finish-engagement]').forEach(b=>b.onclick=finishEngagement);
}
async function runMove(move,stage){if(move.open)return openTool(move.open,move.view);if(move.package)return startPackage(move.package,$('journeyPrimaryAction'));if(move.finish)return finishEngagement();return openTool(recordsTarget(stage))}
async function startPackage(code,button){
 const stage=STAGES.find(s=>s.package===code);if(stage&&packageExists(stage))return openTool('tasks',stageStatus(stage)==='client'?'client_work':stageStatus(stage)==='review'?'ready_review':'my_work');
 const p=project();if(!p)return toast('Set up the client project first.');
 if(button){button.disabled=true;button.textContent='Starting…'}
 const {data,error}=await sb.rpc('nexus_assign_action_package',{p_company_id:state.companyId,p_project_id:p.id,p_package_code:code,p_start_date:new Date().toISOString().slice(0,10)});
 if(error){if(button){button.disabled=false;button.textContent='Start this step →'}return toast(error.message||'This step could not be started.');}
 try{if(log)await log('journey_stage_started','project',p.id,`Started guided client stage: ${stage?.title||code}`)}catch{}
 toast(`${data||0} standard action item${Number(data)===1?'':'s'} created.`);await workspace();renderJourney();
}
async function finishEngagement(){
 const p=project();if(!p)return;if(!confirm('Mark this client engagement complete? You can still keep all records and create future work later.'))return;
 const {error}=await sb.from('nexus_projects').update({status:'complete',updated_at:new Date().toISOString()}).eq('id',p.id);if(error)return toast(error.message||'The engagement could not be completed.');
 try{if(log)await log('engagement_completed','project',p.id,`Engagement completed: ${p.name}`)}catch{}
 toast('Engagement marked complete.');await workspace();renderJourney();
}

function init(){
 if(initialized||!state.admin)return;initialized=true;ensureSection();rebuildAdminNav();showJourney();
 $('companySelect')?.addEventListener('change',()=>setTimeout(()=>{rebuildAdminNav();showJourney()},450));
 document.addEventListener('click',e=>{if(e.target?.closest?.('.journey-primary'))renderJourney()},true);
}
function tryInit(){if(state.admin&&state.user&&document.querySelector('.side-nav'))init()}
tryInit();
sb.auth.onAuthStateChange(()=>setTimeout(tryInit,450));
