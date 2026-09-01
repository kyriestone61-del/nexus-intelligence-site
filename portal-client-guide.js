const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
if(state.admin)throw new Error('Client Guide must not load in the Nexus admin workspace.');

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const day=v=>{if(!v)return '';try{return new Date(String(v).length===10?`${v}T00:00:00`:v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}catch{return ''}};
let snapshot={approvals:[],docRequests:[],requests:[],automations:[],releases:[]};
let refreshBusy=false;
let guideOpen=false;

const destinationLabels={overview:'Home',documents:'Files','diagnosis-reports':'Reports',progress:'Progress',help:'Help'};
const rawStatusMap={
  complete:'Complete',completed:'Complete',resolved:'Complete',approved:'Complete',released:'Complete',answered:'Complete',uploaded:'Complete',implemented:'Complete',healthy:'Complete',
  ready_for_review:'Ready to review',in_review:'Ready to review',pending_review:'Ready to review',recommended:'Ready to review',
  pending:'Waiting on you',waiting_client:'Waiting on you',waiting_on_client:'Waiting on you',requested:'Waiting on you',needs_client:'Waiting on you',changes_requested:'Waiting on you',
  blocked:'Blocked',failed:'Blocked',delayed:'Blocked',attention:'Blocked',action_required:'Blocked',
  submitted:'Nexus working',reviewing:'Nexus working',planned:'Nexus working',planning:'Nexus working',in_progress:'Nexus working',active:'Nexus working',building:'Nexus working',queued:'Nexus working',analyzing:'Nexus working',not_started:'Nexus working',draft:'Nexus working'
};
function humanStatus(raw,{owner}={}){
  const key=String(raw||'').trim().toLowerCase().replaceAll(' ','_');
  if(owner==='client'&&!['complete','completed','resolved','approved','released','answered','uploaded','blocked','failed','delayed'].includes(key))return 'Waiting on you';
  return rawStatusMap[key]||'Nexus working';
}
function statusClass(label){return label.toLowerCase().replaceAll(' ','-')}
function statusChip(raw,opts){const label=humanStatus(raw,opts);return `<span class="client-status ${statusClass(label)}">${esc(label)}</span>`}
function activeProject(){return window.NexusFoundationHardening?.activeProject?.()||null}

const faqs=[
  {id:'start-next',category:'Start Here',q:'How do I know what I need to do next?',keywords:'next today action need do start home waiting',answer:'Open Home. The “Needs you now” area shows only the items that are actually waiting on you.',steps:['Open Home.','Start with the first item under “Needs you now.”','Use the single action button on that card.'],dest:'overview',action:'Show my Home'},
  {id:'start-nexus',category:'Start Here',q:'How do I know what Nexus is working on?',keywords:'nexus working doing status progress work',answer:'Home shows current Nexus-owned work separately from anything waiting on you.',steps:['Open Home.','Find “Nexus is working on.”','Open Progress only when you want more detail.'],dest:'overview',action:'Show Nexus work'},
  {id:'files-what',category:'Files & Evidence',q:'What should I upload?',keywords:'upload file evidence what documents provide',answer:'Upload only the items Nexus specifically requests. A few representative examples are usually better than a giant data dump.',steps:['Open Files.','Choose the requested evidence item.','Tap Upload file on that item and select the file.'],dest:'documents',action:'Go to Files'},
  {id:'files-missing',category:'Files & Evidence',q:'What if I do not have a requested file or document?',keywords:'missing no file document dont have build nexus',answer:'That is okay. Missing documentation is useful information. Choose “Build with Nexus” when that option is available.',steps:['Open Files.','Find the requested item.','Choose “Build with Nexus” instead of creating something just to satisfy the checklist.'],dest:'documents',action:'Go to Files'},
  {id:'files-safe',category:'Files & Evidence',q:'What should I never upload?',keywords:'privacy safe sensitive password card ssn secret api medical',answer:'Do not upload passwords, API keys, MFA codes, full payment-card data, SSNs, medical records, crypto private keys, or unrelated sensitive information unless Nexus has explicitly approved that data type.',steps:['Review the requested evidence item.','Redact information Nexus does not need.','Upload only the minimum relevant business evidence.'],dest:'documents',action:'Review Files'},
  {id:'files-status',category:'Files & Evidence',q:'How do I know whether Nexus received my file?',keywords:'received upload status file shared received',answer:'The evidence item and Files list show the uploaded file after it is linked successfully.',steps:['Open Files.','Find the evidence item you uploaded to.','Confirm the file appears under that item or under files already shared.'],dest:'documents',action:'Check my Files'},
  {id:'reports-find',category:'Reports',q:'Where is my Nexus report?',keywords:'report diagnosis findings where results pdf',answer:'Released findings live in Reports. Internal Nexus drafts never appear there.',steps:['Open Reports.','Choose the released report.','Read the summary first; expand into details only when needed.'],dest:'diagnosis-reports',action:'Open Reports'},
  {id:'reports-question',category:'Reports',q:'How do I ask a question about my report?',keywords:'report question ask unclear finding recommendation',answer:'Ask directly inside the released report so your question stays attached to the exact findings you are reviewing.',steps:['Open Reports.','Open the report.','Use “Ask about this report,” type the question, and submit it.'],dest:'diagnosis-reports',action:'Ask about my report'},
  {id:'reports-pdf',category:'Reports',q:'How do I download my report?',keywords:'download pdf report save',answer:'Use the Download PDF button on the released report.',steps:['Open Reports.','Select the report.','Tap Download PDF.'],dest:'diagnosis-reports',action:'Open Reports'},
  {id:'progress-actions',category:'Requests & Actions',q:'Where are my action items?',keywords:'task action items my work need complete',answer:'Progress groups your client-owned actions, decisions, milestones, and measured results in one place.',steps:['Open Progress.','Start with “Your actions.”','Open the action only when you need its full instructions or completion control.'],dest:'progress',action:'Open Progress'},
  {id:'progress-approve',category:'Requests & Actions',q:'How do I approve a decision?',keywords:'approve decision approval changes',answer:'Pending decisions appear in Progress with a clear “Review decision” action.',steps:['Open Progress.','Find “Decisions.”','Tap Review decision, read the request, then Approve or Request changes.'],dest:'progress',action:'Review decisions'},
  {id:'progress-request',category:'Requests & Actions',q:'How do I ask Nexus for something new?',keywords:'new request ask nexus problem help change automation reporting',answer:'Use Ask Nexus first. If the Guide cannot resolve it, it can prepare a request for the Nexus team without making you hunt for a form.',steps:['Open Ask Nexus.','Describe what you need in normal language.','If needed, choose “Send this question to Nexus,” review the prepared request, and submit it.'],dest:'help',action:'Ask Nexus'},
  {id:'projects-status',category:'Projects & Progress',q:'Where can I see project progress?',keywords:'project milestone progress timeline delivery plan',answer:'Progress shows the current project, next milestone, your actions, and measured changes together.',steps:['Open Progress.','Check “Project plan.”','Look for the next incomplete milestone.'],dest:'progress',action:'Open Progress'},
  {id:'results',category:'Projects & Progress',q:'Where can I see what improved?',keywords:'results improvement metric baseline current target roi value',answer:'Measured changes appear under Results inside Progress. Nexus keeps baseline, current, and target values together when they exist.',steps:['Open Progress.','Scroll to “Results.”','Compare baseline, current, and target values.'],dest:'progress',action:'See Results'},
  {id:'statuses',category:'Start Here',q:'What do the status labels mean?',keywords:'status waiting nexus working ready review complete blocked meaning',answer:'Nexus uses only five client-facing statuses: Waiting on you, Nexus working, Ready to review, Complete, and Blocked.',steps:['“Waiting on you” means you have the next move.','“Nexus working” means no action is required from you right now.','“Ready to review” needs your attention; “Complete” is finished; “Blocked” needs an issue resolved.'],dest:'overview',action:'Return Home'},
  {id:'notifications',category:'Account & Notifications',q:'Where are my notifications?',keywords:'notification alert inbox email preferences messages',answer:'Notifications stay available as a secondary detail rather than a main workspace destination.',steps:['Open Help.','Use “Notification settings” below.','Review alerts or adjust your email preferences there.'],dest:'notifications',action:'Notification settings'},
  {id:'privacy',category:'Account & Notifications',q:'Can another client see my information?',keywords:'privacy tenant company another client see data security',answer:'Your client workspace is company-scoped. Client-visible tools should return only information authorized for your company, while internal Nexus material remains separate.',steps:['Use your authenticated workspace.','Share evidence only through Files.','Contact Nexus immediately if anything appears to belong to another company.'],dest:'help',action:'Open Help'},
  {id:'help-human',category:'Account & Notifications',q:'What if the Nexus Guide cannot answer my question?',keywords:'human support contact nexus guide cannot answer help',answer:'The Guide will offer to prepare a request for the Nexus team. Nothing is sent until you review and submit it.',steps:['Ask the question in Nexus Guide.','Choose “Send this question to Nexus.”','Review the prepared request and tap Submit request.'],dest:'help',action:'Ask Nexus'}
];
const categories=['All','Start Here','Files & Evidence','Requests & Actions','Reports','Projects & Progress','Account & Notifications'];

async function querySafe(table,columns='*',order='created_at'){
  if(!state.companyId)return [];
  try{
    let q=sb.from(table).select(columns).eq('company_id',state.companyId);
    if(order)q=q.order(order,{ascending:false});
    const {data,error}=await q;if(error)throw error;return data||[];
  }catch(error){console.warn(`Client Guide could not read ${table}`,error?.message||error);return []}
}
async function loadSnapshot(){
  if(refreshBusy||!state.companyId)return snapshot;
  refreshBusy=true;
  try{
    const [approvals,docRequests,requests,automations,releases]=await Promise.all([
      querySafe('nexus_approvals','id,title,description,status,due_date,decided_at,created_at'),
      querySafe('nexus_document_requests','id,title,purpose,status,due_date,created_at'),
      querySafe('nexus_client_requests','id,title,description,status,category,priority,created_at,updated_at'),
      querySafe('nexus_automations','id,name,purpose,status,owner_label,last_run_at,updated_at'),
      querySafe('nexus_diagnosis_report_releases','id,status,released_at,created_at','released_at')
    ]);
    snapshot={approvals,docRequests,requests,automations,releases};
    return snapshot;
  }finally{refreshBusy=false}
}

function clientActions(){
  const items=[];
  arr(state.tasks).filter(t=>String(t.assignee||'').toLowerCase()==='client'&&!['complete','completed'].includes(String(t.status||'').toLowerCase())).forEach(t=>items.push({kind:'task',title:t.title||'Action item',copy:t.description||'Nexus needs you to complete this action.',status:t.status||'waiting_on_client',due:t.due_date,section:'tasks',cta:'Open action'}));
  snapshot.approvals.filter(a=>a.status==='pending').forEach(a=>items.push({kind:'approval',title:a.title||'Decision',copy:a.description||'Nexus needs your decision.',status:'ready_for_review',due:a.due_date,section:'approvals',cta:'Review decision'}));
  snapshot.docRequests.filter(d=>d.status==='requested').forEach(d=>items.push({kind:'file',title:d.title||'Requested information',copy:d.purpose||'Nexus needs this information to continue.',status:'waiting_on_client',due:d.due_date,section:'documents',cta:'Provide item'}));
  return items.slice(0,3);
}
function nexusWorking(){
  const items=[];
  arr(state.tasks).filter(t=>String(t.assignee||'').toLowerCase()==='nexus'&&!['complete','completed'].includes(String(t.status||'').toLowerCase())).forEach(t=>items.push({title:t.title||'Nexus action',copy:t.description||'Nexus is moving this work forward.',status:t.status||'in_progress'}));
  snapshot.requests.filter(r=>['submitted','reviewing','planned','in_progress'].includes(r.status)).forEach(r=>items.push({title:r.title||'Request',copy:`Your request is ${humanStatus(r.status).toLowerCase()}.`,status:r.status}));
  snapshot.automations.filter(a=>['building','healthy','active'].includes(a.status)).forEach(a=>items.push({title:a.name||'Nexus-supported system',copy:a.purpose||'Nexus is supporting this system.',status:a.status}));
  return items.slice(0,3);
}
function recentlyCompleted(){
  const out=[];
  arr(state.tasks).filter(t=>['complete','completed'].includes(String(t.status||'').toLowerCase())).slice(0,3).forEach(t=>out.push({title:t.title||'Action completed',when:t.completed_at||t.updated_at,status:'complete'}));
  snapshot.approvals.filter(a=>a.status==='approved').slice(0,2).forEach(a=>out.push({title:a.title||'Decision approved',when:a.decided_at,status:'approved'}));
  return out.slice(0,3);
}
function nextMilestone(){
  return [...arr(state.milestones)].filter(m=>!['complete','completed'].includes(String(m.status||'').toLowerCase())).sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))[0]||null;
}
function currentSection(){return document.querySelector('.section.active')?.id?.replace('section-','')||'overview'}

function ensureSections(){
  const main=document.querySelector('.main');if(!main)return;
  if(!$('section-progress')){const s=document.createElement('section');s.id='section-progress';s.className='section';s.innerHTML='<div id="clientProgressRoot"></div>';main.appendChild(s)}
  if(!$('section-help')){const s=document.createElement('section');s.id='section-help';s.className='section';s.innerHTML='<div id="clientHelpRoot"></div>';main.appendChild(s)}
}
function sourceButton(section){return document.querySelector(`.client-source-nav button[data-section="${section}"]`)||document.querySelector(`.side-nav button[data-section="${section}"]`)}
function markNav(dest){document.querySelectorAll('#clientPrimaryNav [data-client-dest]').forEach(b=>b.classList.toggle('active',b.dataset.clientDest===dest))}
function showCustom(section,dest){
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${section}`));
  document.querySelectorAll('.side-nav button[data-section]').forEach(b=>b.classList.remove('active'));
  markNav(dest);window.scrollTo({top:0,left:0,behavior:'auto'});
}
function addBackBar(section,dest){
  const target=$(`section-${section}`);if(!target)return;
  let bar=target.querySelector(':scope > .client-detail-back');
  if(!bar){bar=document.createElement('div');bar.className='client-detail-back';target.prepend(bar)}
  bar.innerHTML=`<button type="button" class="client-back-link">← Back to ${esc(destinationLabels[dest]||dest)}</button><span>Detail view</span>`;
  bar.querySelector('button').onclick=()=>activateDestination(dest);
}
function openDetail(section,back='progress'){
  const b=sourceButton(section);if(b)b.click();else{document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${section}`))}
  setTimeout(()=>{addBackBar(section,back);markNav(back);window.scrollTo({top:0,left:0,behavior:'auto'})},30);
}
function activateDestination(dest){
  if(dest==='progress'){renderProgress();showCustom('progress','progress');return}
  if(dest==='help'){renderHelp();showCustom('help','help');return}
  const section=dest==='overview'?'overview':dest==='documents'?'documents':'diagnosis-reports';
  const b=sourceButton(section);if(b)b.click();else if($(`section-${section}`)){document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${section}`))}
  setTimeout(()=>{markNav(dest);window.scrollTo({top:0,left:0,behavior:'auto'});injectContextHelp()},30);
}
function buildNavigation(){
  const nav=document.querySelector('.side-nav');if(!nav)return;
  let source=nav.querySelector('.client-source-nav');
  if(!source){source=document.createElement('div');source.className='client-source-nav';source.hidden=true;nav.appendChild(source)}
  [...nav.children].forEach(child=>{if(child===source||child.id==='clientPrimaryNav')return;source.appendChild(child)});
  const loose=[...nav.querySelectorAll(':scope > button[data-section]')];loose.forEach(b=>source.appendChild(b));
  let primary=$('clientPrimaryNav');if(!primary){primary=document.createElement('div');primary.id='clientPrimaryNav';primary.className='client-primary-nav';nav.prepend(primary)}
  const destinations=[['overview','Home'],['documents','Files'],['diagnosis-reports','Reports'],['progress','Progress'],['help','Help']];
  primary.innerHTML=destinations.map(([key,label])=>`<button type="button" data-client-dest="${key}" aria-label="${label}"><span class="client-nav-dot" aria-hidden="true"></span><span>${label}</span></button>`).join('');
  primary.querySelectorAll('button').forEach(b=>b.onclick=()=>activateDestination(b.dataset.clientDest));
  const section=currentSection();const top=section==='documents'?'documents':section==='diagnosis-reports'?'diagnosis-reports':section==='progress'?'progress':section==='help'?'help':'overview';markNav(top);
}

function actionCard(item){
  return `<article class="client-action-card"><div class="client-card-top">${statusChip(item.status,{owner:item.kind==='task'||item.kind==='file'?'client':undefined})}${item.due?`<span class="client-due">${esc(day(item.due))}</span>`:''}</div><h3>${esc(item.title)}</h3><p>${esc(item.copy||'')}</p><button class="btn primary client-card-action" type="button" data-open-detail="${esc(item.section)}">${esc(item.cta||'Open')}</button></article>`
}
function renderHome(){
  const section=$('section-overview'),legacy=$('opsTodayRoot');if(!section)return;
  if(legacy)legacy.classList.add('client-simple-hidden');
  let root=$('clientSimpleHome');if(!root){root=document.createElement('div');root.id='clientSimpleHome';root.className='client-simple-home';section.prepend(root)}
  const actions=clientActions(),working=nexusWorking(),done=recentlyCompleted(),milestone=nextMilestone();
  root.innerHTML=`<header class="client-page-head"><div><div class="eyebrow">Home</div><h1>What do you need to do?</h1><p>Start here. If something needs you, it will be obvious.</p></div><button class="btn secondary client-context-help" type="button" data-guide-question="How do I know what I need to do next?">Need help?</button></header>
  <section class="client-focus-panel"><div class="client-section-head"><div><div class="kicker">Needs you now</div><h2>${actions.length?`${actions.length} ${actions.length===1?'item':'items'} waiting on you`:'You are clear right now'}</h2></div></div>${actions.length?`<div class="client-action-grid">${actions.map(actionCard).join('')}</div>`:'<div class="client-clear-state"><b>Nothing needs your attention.</b><span>Nexus will surface the next action here when one is ready.</span></div>'}</section>
  <div class="client-home-grid"><section class="client-soft-panel"><div class="kicker">Nexus is working on</div><h2>No guessing required</h2>${working.length?working.map(x=>`<div class="client-line-item">${statusChip(x.status)}<div><b>${esc(x.title)}</b><span>${esc(x.copy)}</span></div></div>`).join(''):'<div class="client-empty-small">No active Nexus work is visible right now.</div>'}</section>
  <section class="client-soft-panel"><div class="kicker">Next milestone</div><h2>${esc(milestone?.title||'No milestone is waiting')}</h2>${milestone?`<p>${esc(milestone.description||'This is the next planned point in the engagement.')}</p><div class="client-meta-row">${statusChip(milestone.status)}${milestone.due_date?`<span>Target ${esc(day(milestone.due_date))}</span>`:''}</div><button class="btn secondary" type="button" data-client-dest="progress">See Progress</button>`:'<p>Nexus will show the next milestone here once it is scheduled.</p>'}</section></div>
  <section class="client-soft-panel client-completed-panel"><div class="client-section-head"><div><div class="kicker">Recently completed</div><h2>What moved forward</h2></div><button class="btn secondary" type="button" data-client-dest="progress">See all progress</button></div>${done.length?`<div class="client-completed-list">${done.map(x=>`<div><span class="client-complete-mark">✓</span><b>${esc(x.title)}</b>${x.when?`<small>${esc(day(x.when))}</small>`:''}</div>`).join('')}</div>`:'<div class="client-empty-small">Completed work will collect here as the engagement moves forward.</div>'}</section>`;
  root.querySelectorAll('[data-open-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.openDetail,'overview'));
  root.querySelectorAll('[data-client-dest]').forEach(b=>b.onclick=()=>activateDestination(b.dataset.clientDest));
  bindGuideButtons(root);
}

function taskRows(){return arr(state.tasks).filter(t=>String(t.assignee||'').toLowerCase()==='client').slice(0,12)}
function milestoneRows(){return [...arr(state.milestones)].sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,12)}
function metricRows(){return arr(state.metrics).slice(0,8)}
function renderProgress(){
  const root=$('clientProgressRoot');if(!root)return;
  const tasks=taskRows(),approvals=snapshot.approvals.slice(0,10),milestones=milestoneRows(),metrics=metricRows(),project=activeProject();
  root.innerHTML=`<header class="client-page-head"><div><div class="eyebrow">Progress</div><h1>Everything moving forward, in one place.</h1><p>Your actions, decisions, project plan, and measured results—without the internal machinery.</p></div><button class="btn secondary client-context-help" type="button" data-guide-question="Where can I see project progress?">Need help?</button></header>
  <section class="client-progress-section"><div class="client-section-head"><div><div class="kicker">Your actions</div><h2>${tasks.filter(t=>!['complete','completed'].includes(String(t.status||'').toLowerCase())).length} open</h2></div>${tasks.length?'<button class="btn secondary" type="button" data-progress-detail="tasks">Open action details</button>':''}</div>${tasks.length?`<div class="client-progress-list">${tasks.map(t=>`<div class="client-progress-row">${statusChip(t.status,{owner:'client'})}<div><b>${esc(t.title||'Action item')}</b><span>${esc(t.description||'')}</span></div>${t.due_date?`<small>${esc(day(t.due_date))}</small>`:''}</div>`).join('')}</div>`:'<div class="client-clear-state"><b>No client actions yet.</b><span>When Nexus needs something from you, it will appear here and on Home.</span></div>'}</section>
  <section class="client-progress-section"><div class="client-section-head"><div><div class="kicker">Decisions</div><h2>${approvals.filter(a=>a.status==='pending').length} ready for review</h2></div>${approvals.length?'<button class="btn secondary" type="button" data-progress-detail="approvals">Review decisions</button>':''}</div>${approvals.length?`<div class="client-progress-list">${approvals.map(a=>`<div class="client-progress-row">${statusChip(a.status==='pending'?'ready_for_review':a.status)}<div><b>${esc(a.title||'Decision')}</b><span>${esc(a.description||'')}</span></div>${a.due_date?`<small>${esc(day(a.due_date))}</small>`:''}</div>`).join('')}</div>`:'<div class="client-empty-small">No decisions are waiting.</div>'}</section>
  <section class="client-progress-section"><div class="client-section-head"><div><div class="kicker">Project plan</div><h2>${esc(project?.name||'Nexus engagement')}</h2></div></div>${milestones.length?`<div class="client-milestone-track">${milestones.map((m,i)=>`<div class="client-milestone ${['complete','completed'].includes(String(m.status||'').toLowerCase())?'complete':''}"><span>${['complete','completed'].includes(String(m.status||'').toLowerCase())?'✓':i+1}</span><div><b>${esc(m.title||'Milestone')}</b><small>${m.due_date?esc(day(m.due_date)):humanStatus(m.status)}</small></div></div>`).join('')}</div>`:'<div class="client-empty-small">Project milestones will appear here once they are scheduled.</div>'}</section>
  <section class="client-progress-section"><div class="client-section-head"><div><div class="kicker">Results</div><h2>Measured improvement</h2></div></div>${metrics.length?`<div class="client-metric-grid">${metrics.map(m=>`<article><b>${esc(m.name||'Measurement')}</b><div><span>Baseline<strong>${esc(m.baseline_value??'—')} ${esc(m.unit||'')}</strong></span><span>Current<strong>${esc(m.current_value??'—')} ${esc(m.unit||'')}</strong></span><span>Target<strong>${esc(m.target_value??'—')} ${esc(m.unit||'')}</strong></span></div></article>`).join('')}</div>`:'<div class="client-empty-small">Measured results will appear here once a baseline and follow-up measurement exist.</div>'}</section>`;
  root.querySelectorAll('[data-progress-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.progressDetail,'progress'));
  bindGuideButtons(root);
}

function faqCard(f){return `<details class="client-faq-card" data-category="${esc(f.category)}" data-search="${esc(`${f.q} ${f.keywords} ${f.answer}`.toLowerCase())}"><summary><span>${esc(f.q)}</span><span aria-hidden="true">+</span></summary><div class="client-faq-answer"><p>${esc(f.answer)}</p><ol>${f.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><button class="btn secondary" type="button" data-faq-dest="${esc(f.dest)}" data-faq-id="${esc(f.id)}">${esc(f.action||'Go there')} →</button><button class="client-ask-inline" type="button" data-guide-question="${esc(f.q)}">Still need help? Ask Nexus.</button></div></details>`}
function filterFaq(){
  const root=$('clientHelpRoot');if(!root)return;const q=String($('clientFaqSearch')?.value||'').trim().toLowerCase();const active=root.querySelector('.client-faq-category.active')?.dataset.category||'All';let shown=0;
  root.querySelectorAll('.client-faq-card').forEach(card=>{const okCategory=active==='All'||card.dataset.category===active;const okText=!q||card.dataset.search.includes(q);const show=okCategory&&okText;card.hidden=!show;if(show)shown++});
  const empty=$('clientFaqEmpty');if(empty)empty.hidden=shown>0;
}
function renderHelp(){
  const root=$('clientHelpRoot');if(!root)return;
  root.innerHTML=`<header class="client-page-head"><div><div class="eyebrow">Help</div><h1>Get an answer without hunting around.</h1><p>Search a question, follow three simple steps, or ask Nexus Guide.</p></div><button class="btn primary" id="openNexusGuideFromHelp" type="button">Ask Nexus</button></header>
  <section class="client-help-hero"><label for="clientFaqSearch">What do you need help with?</label><input id="clientFaqSearch" type="search" placeholder="Try “upload a file” or “where is my report?”" autocomplete="off"><div class="client-faq-categories">${categories.map((c,i)=>`<button type="button" class="client-faq-category ${i===0?'active':''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</div></section>
  <section class="client-faq-list">${faqs.map(faqCard).join('')}<div id="clientFaqEmpty" class="client-clear-state" hidden><b>No exact FAQ matched.</b><span>Ask Nexus Guide and it will either guide you or prepare a request for the Nexus team.</span><button class="btn primary" id="faqAskInstead" type="button">Ask Nexus</button></div></section>
  <section class="client-help-footer"><div><div class="kicker">Learn the workspace</div><h2>Need the 60-second tour again?</h2><p>Home → Files → Reports → Progress → Help. Those are the only five places you need to remember.</p></div><button class="btn secondary" id="showClientTour" type="button">Show quick tour</button></section>
  <section class="client-help-footer"><div><div class="kicker">Account & notifications</div><h2>Want to review alerts?</h2><p>Notifications are kept out of the main navigation so they do not compete with your work.</p></div><button class="btn secondary" data-help-detail="notifications" type="button">Notification settings</button></section>`;
  $('clientFaqSearch').oninput=filterFaq;
  root.querySelectorAll('.client-faq-category').forEach(b=>b.onclick=()=>{root.querySelectorAll('.client-faq-category').forEach(x=>x.classList.toggle('active',x===b));filterFaq()});
  root.querySelectorAll('[data-faq-dest]').forEach(b=>b.onclick=()=>{const f=faqs.find(x=>x.id===b.dataset.faqId);routeGuideDestination(f?.dest||b.dataset.faqDest,'help')});
  bindGuideButtons(root);$('openNexusGuideFromHelp').onclick=()=>openGuide();$('faqAskInstead').onclick=()=>openGuide();$('showClientTour').onclick=()=>showTour(true);root.querySelectorAll('[data-help-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.helpDetail,'help'));
}

function routeGuideDestination(dest,back='help'){
  if(['overview','documents','diagnosis-reports','progress','help'].includes(dest)){activateDestination(dest);return}
  openDetail(dest,back);
}
function bindGuideButtons(root=document){root.querySelectorAll('[data-guide-question]').forEach(b=>{if(b.dataset.guideBound)return;b.dataset.guideBound='1';b.onclick=()=>openGuide(b.dataset.guideQuestion)})}
function injectContextHelp(){
  const contexts=[['section-documents','How do I know what Nexus needs from me?'],['section-diagnosis-reports','How do I ask a question about my report?']];
  contexts.forEach(([id,q])=>{const section=$(id);const toolbar=section?.querySelector('.toolbar');if(!toolbar||toolbar.querySelector('.client-context-help'))return;const b=document.createElement('button');b.type='button';b.className='btn secondary client-context-help';b.dataset.guideQuestion=q;b.textContent='Need help?';toolbar.appendChild(b);bindGuideButtons(toolbar)});
}

function ensureGuide(){
  if($('nexusGuideButton'))return;
  const button=document.createElement('button');button.id='nexusGuideButton';button.className='nexus-guide-button';button.type='button';button.setAttribute('aria-haspopup','dialog');button.innerHTML='<span aria-hidden="true">N</span><b>Ask Nexus</b>';document.body.appendChild(button);
  const drawer=document.createElement('aside');drawer.id='nexusGuideDrawer';drawer.className='nexus-guide-drawer';drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','Nexus Guide');drawer.setAttribute('aria-hidden','true');drawer.innerHTML=`<div class="nexus-guide-head"><div><div class="kicker">Nexus Guide</div><h2>Ask in plain language.</h2><p>I use only client-visible help and workspace context. If I cannot answer confidently, I will help you ask the Nexus team.</p></div><button type="button" id="closeNexusGuide" aria-label="Close Nexus Guide">×</button></div><div id="nexusGuideMessages" class="nexus-guide-messages" aria-live="polite"></div><div id="nexusGuideQuick" class="nexus-guide-quick"><button type="button">What do I need to do?</button><button type="button">How do I upload a file?</button><button type="button">Where is my report?</button><button type="button">What is Nexus working on?</button></div><form id="nexusGuideForm" class="nexus-guide-form"><label for="nexusGuideInput">Your question</label><div><input id="nexusGuideInput" maxlength="1000" autocomplete="off" placeholder="Ask Nexus…"><button type="submit">Send</button></div></form>`;document.body.appendChild(drawer);
  button.onclick=()=>openGuide();$('closeNexusGuide').onclick=()=>closeGuide();$('nexusGuideForm').onsubmit=e=>{e.preventDefault();const input=$('nexusGuideInput');const q=input.value.trim();if(!q)return;input.value='';askGuide(q)};drawer.querySelectorAll('#nexusGuideQuick button').forEach(b=>b.onclick=()=>askGuide(b.textContent));
}
function openGuide(prefill=''){
  ensureGuide();guideOpen=true;const d=$('nexusGuideDrawer');d.classList.add('open');d.setAttribute('aria-hidden','false');document.body.classList.add('nexus-guide-open');
  if(!$('nexusGuideMessages').children.length)addGuideMessage('bot','Hi. Tell me what you are trying to do, and I will give you the shortest path.');
  if(prefill){$('nexusGuideInput').value=prefill;$('nexusGuideInput').focus()}else $('nexusGuideInput').focus();
}
function closeGuide(){guideOpen=false;const d=$('nexusGuideDrawer');d?.classList.remove('open');d?.setAttribute('aria-hidden','true');document.body.classList.remove('nexus-guide-open')}
function addGuideMessage(role,html){const box=$('nexusGuideMessages');if(!box)return null;const node=document.createElement('div');node.className=`nexus-guide-message ${role}`;node.innerHTML=html;box.appendChild(node);box.scrollTop=box.scrollHeight;return node}
function guideAction(dest,label,back='help'){return `<button type="button" class="nexus-guide-action" data-guide-dest="${esc(dest)}" data-guide-back="${esc(back)}">${esc(label)} →</button>`}
function bindMessageActions(node){node?.querySelectorAll('[data-guide-dest]').forEach(b=>b.onclick=()=>{closeGuide();routeGuideDestination(b.dataset.guideDest,b.dataset.guideBack||'help')});node?.querySelectorAll('[data-escalate-question]').forEach(b=>b.onclick=()=>prepareRequest(b.dataset.escalateQuestion))}
function tokenize(text){return new Set(String(text||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>2))}
function bestFaq(query){const q=tokenize(query);let best=null,score=0;faqs.forEach(f=>{const hay=tokenize(`${f.q} ${f.keywords}`);let s=0;q.forEach(t=>{if(hay.has(t))s+=2;else if([...hay].some(h=>h.includes(t)||t.includes(h)))s+=1});if(s>score){score=s;best=f}});return score>=3?best:null}
function dynamicGuide(query){
  const q=query.toLowerCase();
  if(/what.*(need|do)|what.*next|my next|needs me/.test(q)){
    const items=clientActions();if(!items.length)return {html:'<b>You are clear right now.</b><p>Nothing in the client-visible workspace is waiting on you. Nexus will put the next required action on Home.</p>',dest:'overview',label:'Open Home'};
    return {html:`<b>${items.length} ${items.length===1?'thing needs':'things need'} you right now.</b><ol>${items.map(x=>`<li>${esc(x.title)}</li>`).join('')}</ol><p>Start with the first item. Home keeps the list capped so it stays manageable.</p>`,dest:'overview',label:'Show my Home'};
  }
  if(/nexus.*working|what.*nexus.*doing/.test(q)){
    const items=nexusWorking();return {html:items.length?`<b>Nexus is currently working on:</b><ol>${items.map(x=>`<li>${esc(x.title)}</li>`).join('')}</ol><p>You do not need to act on these unless the status changes to Waiting on you or Ready to review.</p>`:'<b>No active Nexus-owned work is visible right now.</b><p>Home will update when Nexus starts or changes work.</p>',dest:'overview',label:'Open Home'};
  }
  if(/next milestone|milestone next/.test(q)){const m=nextMilestone();return {html:m?`<b>Your next milestone is ${esc(m.title||'the next project step')}.</b><p>${esc(m.description||'Open Progress for the project plan.')}${m.due_date?` Target: ${esc(day(m.due_date))}.`:''}</p>`:'<b>No next milestone is currently scheduled.</b><p>Nexus will add it to Progress when the plan is ready.</p>',dest:'progress',label:'Open Progress'}}
  if(/report.*(available|ready|where)|where.*report/.test(q)){const count=snapshot.releases.filter(r=>r.status==='released').length;return {html:count?`<b>You have ${count} released ${count===1?'report':'reports'} available.</b><p>Open Reports and start with the executive summary.</p>`:'<b>No released report is visible yet.</b><p>Nexus internal drafts stay private until they are deliberately released to your client workspace.</p>',dest:'diagnosis-reports',label:'Open Reports'}}
  return null;
}
function askGuide(query){
  openGuide();addGuideMessage('user',esc(query));const dynamic=dynamicGuide(query);if(dynamic){const n=addGuideMessage('bot',`${dynamic.html}${guideAction(dynamic.dest,dynamic.label)}`);bindMessageActions(n);return}
  const faq=bestFaq(query);if(faq){const n=addGuideMessage('bot',`<b>${esc(faq.answer)}</b><ol>${faq.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>${guideAction(faq.dest,faq.action||'Go there')}`);bindMessageActions(n);return}
  const safe=esc(query);const n=addGuideMessage('bot',`<b>I do not have a confident client-help answer for that.</b><p>I can prepare a request for the Nexus team with your question already filled in. You will review it before anything is submitted.</p><button type="button" class="nexus-guide-action" data-escalate-question="${safe}">Prepare a Nexus request →</button>`);bindMessageActions(n)
}
function prepareRequest(question){
  closeGuide();openDetail('requests','help');setTimeout(()=>{
    const form=$('opsRequestForm');if(form)form.style.display='block';if($('opsRequestCategory'))$('opsRequestCategory').value='other';if($('opsRequestPriority'))$('opsRequestPriority').value='normal';if($('opsRequestTitle'))$('opsRequestTitle').value='Question for Nexus';if($('opsRequestDescription'))$('opsRequestDescription').value=question;form?.scrollIntoView({block:'start',behavior:'smooth'});toast?.('Your question is prepared. Review it, then tap Submit request when you are ready.');
  },120)
}

const tourSteps=[
  {title:'Home tells you what matters.',copy:'Open Nexus and start here. “Needs you now” contains only the actions that actually require you.'},
  {title:'Files is where you give Nexus information.',copy:'Use the requested evidence cards. Upload what you have. If something does not exist, choose Build with Nexus.'},
  {title:'Reports is where Nexus gives you findings.',copy:'Only deliberately released client-safe reports appear here. Questions stay attached to the report.'},
  {title:'Progress and Help finish the loop.',copy:'Progress combines actions, decisions, milestones, and results. Help gives you FAQs and Nexus Guide from anywhere.'}
];
let tourIndex=0;
function showTour(force=false){
  const key=`nexus_client_tour_v2:${state.user?.id||'user'}`;if(!force&&localStorage.getItem(key)==='done')return;tourIndex=0;
  let overlay=$('clientQuickTour');if(!overlay){overlay=document.createElement('div');overlay.id='clientQuickTour';overlay.className='client-tour';overlay.innerHTML='<div class="client-tour-card"><div class="client-tour-progress"></div><div class="kicker">60-second Nexus tour</div><h2></h2><p></p><div class="client-tour-actions"><button type="button" class="client-tour-skip">Skip</button><button type="button" class="client-tour-next">Next →</button></div></div>';document.body.appendChild(overlay)}
  overlay.classList.add('open');overlay.dataset.key=key;renderTourStep();
}
function renderTourStep(){const o=$('clientQuickTour');if(!o)return;const s=tourSteps[tourIndex];o.querySelector('h2').textContent=s.title;o.querySelector('p').textContent=s.copy;o.querySelector('.client-tour-progress').innerHTML=tourSteps.map((_,i)=>`<span class="${i<=tourIndex?'active':''}"></span>`).join('');const next=o.querySelector('.client-tour-next');next.textContent=tourIndex===tourSteps.length-1?'Finish':'Next →';next.onclick=()=>{if(tourIndex<tourSteps.length-1){tourIndex++;renderTourStep()}else finishTour()};o.querySelector('.client-tour-skip').onclick=finishTour}
function finishTour(){const o=$('clientQuickTour');if(!o)return;localStorage.setItem(o.dataset.key,'done');o.classList.remove('open')}

function humanizeVisibleStatuses(){document.querySelectorAll('.portal-client-mode .ops-badge,.portal-client-mode .req-status').forEach(el=>{const raw=String(el.textContent||'').trim().toLowerCase().replaceAll(' ','_');if(rawStatusMap[raw]&&!el.dataset.clientHumanized){el.dataset.clientHumanized=raw;el.textContent=rawStatusMap[raw]}})}
async function refreshClientExperience(){await loadSnapshot();ensureSections();buildNavigation();renderHome();renderProgress();renderHelp();ensureGuide();injectContextHelp();humanizeVisibleStatuses()}

$('companySelect')?.addEventListener('change',()=>setTimeout(refreshClientExperience,350));
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(refreshClientExperience,180));
window.addEventListener('focus',()=>setTimeout(refreshClientExperience,120));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&guideOpen)closeGuide()});
for(const ms of [0,180,650])setTimeout(refreshClientExperience,ms);
setTimeout(()=>showTour(false),1000);
window.NexusClientGuide={refresh:refreshClientExperience,open:openGuide,ask:askGuide,activateDestination};
