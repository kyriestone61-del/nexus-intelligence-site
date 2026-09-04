const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');

const {state}=portal;
const $=id=>document.getElementById(id);
const terminal=new Set(['complete','completed','done','closed','resolved','cancelled','canceled','archived','approved','not_applicable']);
const adminPrimaryCache={home:null,clients:null,decisions:null,sales:null};
let scheduled=false;

function text(node,value){if(node&&node.textContent!==value)node.textContent=value}
function hidden(node,value=true){if(!node)return;if(value){node.hidden=true;node.setAttribute('aria-hidden','true')}else{node.hidden=false;node.removeAttribute('aria-hidden')}}
function activePlanTasks(){return (state.tasks||[]).filter(task=>String(task.phase||'').toLowerCase()==='solution_design'&&!terminal.has(String(task.status||'').toLowerCase()))}
function currentPlanStep(){return [...document.querySelectorAll('#adminJourneyRoot .journey-step')].find(step=>step.querySelector('.journey-step-number')?.textContent.trim()==='3'||/Agree on the Plan|Choose Solutions/i.test(step.querySelector('h3')?.textContent||''))||null}
function openDecisions(){
  const button=document.querySelector('.side-nav button[data-section="notifications"]')||adminPrimaryCache.decisions;
  if(button){button.click();return true}
  portal.toast?.('Nexus could not open Decisions. Reload the workspace and try again.');
  return false;
}

function simplifyAuth(){
  const auth=$('authView');if(!auth||auth.style.display==='none')return;
  const eyebrow=auth.querySelector('.eyebrow');text(eyebrow,'Nexus Workspace');
  const hero=auth.querySelector('h1');if(hero&&hero.dataset.productionSimple!=='1'){
    hero.dataset.productionSimple='1';hero.innerHTML='Sign in.<br>See what needs you.';
  }
  const intro=auth.querySelector('.panel .muted');text(intro,'One secure workspace for actions, files, decisions, and measured results.');
  const help=auth.querySelector('.data-room-help');
  if(help&&help.dataset.productionSimple!=='1'){
    help.dataset.productionSimple='1';help.innerHTML='<div><b>01 · Today</b><span>The one thing that needs attention now.</span></div><div><b>02 · Files</b><span>Only the evidence Nexus actually requests.</span></div><div><b>03 · Results</b><span>What changed and what happens next.</span></div>';
  }
  const pill=document.querySelector('.topbar .pill');if(pill)text(pill,state.admin?'NEXUS':'WORKSPACE');
}

function primaryAdminNodes(nav){
  const liveHome=nav.querySelector('.journey-primary');
  const liveClients=nav.querySelector('button[data-section="companies"]')||nav.querySelector('button[data-section="clients"]');
  const liveDecisions=nav.querySelector('button[data-section="notifications"]');
  const liveSales=nav.querySelector('button[data-section="revenue"]');
  if(liveHome)adminPrimaryCache.home=liveHome;
  if(liveClients?.dataset.section==='companies'||!adminPrimaryCache.clients)adminPrimaryCache.clients=liveClients;
  if(liveDecisions)adminPrimaryCache.decisions=liveDecisions;
  if(liveSales)adminPrimaryCache.sales=liveSales;
  const home=liveHome||adminPrimaryCache.home;
  const clients=(liveClients?.dataset.section==='companies'?liveClients:null)||adminPrimaryCache.clients||liveClients;
  const decisions=liveDecisions||adminPrimaryCache.decisions;
  const sales=liveSales||adminPrimaryCache.sales;
  return [home,clients,decisions,sales].filter(Boolean);
}
function labelSecondary(button){
  const key=button.dataset.section||'';
  const labels={
    clients:'Client Setup',command:'Command Center',overview:'Client Today',discovery:'Diagnosis',tasks:'Work',documents:'Files',approvals:'Approval History',automations:'Systems',metrics:'Results',timeline:'Projects',requests:'Requests',activity:'Activity'
  };
  if(labels[key])text(button,labels[key]);
}
function simplifyAdminNav(){
  if(!state.admin||state.viewMode==='client')return;
  const nav=document.querySelector('.side-nav');if(!nav)return;
  const primaryNodes=primaryAdminNodes(nav);if(primaryNodes.length<4)return;
  const existingPrimary=nav.querySelector(':scope > .nexus-production-primary-nav');
  const existingRecords=nav.querySelector(':scope > details.nexus-production-records');
  const correct=existingPrimary&&existingRecords&&primaryNodes.every(node=>existingPrimary.contains(node))&&[...nav.querySelectorAll('button')].every(node=>existingPrimary.contains(node)||existingRecords.contains(node));
  if(!correct){
    const buttons=[...nav.querySelectorAll('button')];
    const primarySet=new Set(primaryNodes);
    const primary=document.createElement('div');primary.className='nexus-production-primary-nav';primary.setAttribute('aria-label','Primary workspace navigation');
    const records=document.createElement('details');records.className='nexus-production-records';records.innerHTML='<summary>Records & Tools</summary><div class="nexus-production-record-buttons"></div>';
    const recordsBox=records.querySelector('.nexus-production-record-buttons');
    nav.replaceChildren(primary,records);
    primaryNodes.forEach(node=>primary.appendChild(node));
    buttons.filter(node=>!primarySet.has(node)).forEach(node=>{labelSecondary(node);recordsBox.appendChild(node)});
    recordsBox.addEventListener('click',event=>{if(event.target.closest('button'))records.open=true});
  }
  const home=nav.querySelector('.journey-primary');text(home,'Home');
  const clients=nav.querySelector('.nexus-production-primary-nav button[data-section="companies"]')||nav.querySelector('.nexus-production-primary-nav button[data-section="clients"]');text(clients,'Clients');
  const decisions=nav.querySelector('.nexus-production-primary-nav button[data-section="notifications"]');text(decisions,'Decisions');decisions?.setAttribute('aria-label','Decisions');
  const sales=nav.querySelector('.nexus-production-primary-nav button[data-section="revenue"]');text(sales,'Sales');sales?.setAttribute('aria-label','Sales');
  nav.querySelectorAll('.nexus-production-record-buttons button').forEach(labelSecondary);
}

function simplifyJourney(){
  if(!state.admin||state.viewMode==='client')return;
  const root=$('adminJourneyRoot');if(!root)return;
  const hero=root.querySelector('.admin-journey-hero');
  if(hero){text(hero.querySelector('.eyebrow'),'Nexus · active client');text(hero.querySelector('h1'),'What happens next.');text(hero.querySelector('p'),'Nexus keeps the process moving and brings you only the next decision or action that requires you.');}
  const step=currentPlanStep();
  if(step){
    text(step.querySelector('h3'),'Choose Solutions & Confirm Plan');
    text(step.querySelector('p'),'Review the resolutions Nexus recommends from the approved diagnosis. Approve, reject, or defer each one. Only the final confirmed plan becomes work.');
  }
  const preConfirm=!!step?.classList.contains('current')&&activePlanTasks().length===0;
  const cardStart=step?.querySelector('[data-start-package="solution_design"]');
  if(cardStart){text(cardStart,preConfirm?'Review suggested solutions →':'Open plan work →');cardStart.dataset.productionResolutionGate=preConfirm?'1':'0'}
  const primary=$('journeyPrimaryAction');
  if(preConfirm&&primary){
    const focus=root.querySelector('.journey-focus');
    text(focus?.querySelector('.kicker'),'Your next move · Step 3');
    text(focus?.querySelector('h2'),'Choose the solutions to execute');
    text(focus?.querySelector('p'),'Nexus translated the approved diagnosis into proposed resolutions. Decide which ones belong in the plan, then approve Confirm Plan.');
    const status=focus?.querySelector('.journey-status');text(status,'Needs your decisions');
    text(primary,'Review suggested solutions →');primary.dataset.productionResolutionGate='1';
  }else if(primary){delete primary.dataset.productionResolutionGate}
  const help=root.querySelector('.journey-help');
  if(help){text(help.querySelector('summary'),'Where are the other tools?');text(help.querySelector('p'),'Nexus keeps files, workflows, approvals, systems, and audit history behind this journey. Open Records & Tools only when you need to inspect them.');}
}

function simplifyDecisions(){
  if(!state.admin||state.viewMode==='client')return;
  const section=$('section-notifications');if(!section)return;
  text(section.querySelector('.eyebrow'),'Founder decisions');
  text(section.querySelector('h1'),'Decisions');
  text(section.querySelector('p.small'),'Approvals, client submissions, questions, and exceptions that require a human decision.');
  const nav=document.querySelector('.side-nav button[data-section="notifications"]')||adminPrimaryCache.decisions;text(nav,'Decisions');
  const updates=section.querySelector('[data-inbox-filter="update"]'),all=section.querySelector('[data-inbox-filter="all"]');hidden(updates,true);hidden(all,true);
  const create=$('newApprovalChainBtn');if(create)text(create,'+ New decision');
  const advanced=$('nexusInboxAdvancedFilters');
  if(advanced&&!advanced.closest('.nexus-decisions-advanced')){
    const details=document.createElement('details');details.className='nexus-decisions-advanced';details.innerHTML='<summary>Search & advanced filters</summary>';
    advanced.parentNode?.insertBefore(details,advanced);details.appendChild(advanced);
  }
}

function simplifySales(){
  if(!state.admin||state.viewMode==='client')return;
  const section=$('section-revenue');if(!section)return;
  const nav=document.querySelector('.side-nav button[data-section="revenue"]')||adminPrimaryCache.sales;text(nav,'Sales');
  const hero=section.querySelector('.revenue-hero');
  if(hero){text(hero.querySelector('.eyebrow'),'Nexus · sales pipeline');text(hero.querySelector('h1'),'Sales');text(hero.querySelector('p'),'Qualified opportunities, outreach approvals, replies, bookings, and exceptions. Research and scoring stay behind this view.');const guard=hero.querySelector('.revenue-guard');if(guard){text(guard.querySelector('b'),'Human send approval is on');text(guard.querySelector('span'),'Nexus prepares outreach. Nothing external is sent from this console without approval.')}}
  const statLabels=['Prospects','Qualified','Needs approval','Contacted','Booked','Exceptions'];section.querySelectorAll('.revenue-stats > div span').forEach((span,index)=>{if(statLabels[index])text(span,statLabels[index])});
  const top=section.querySelector('.revenue-top-grid');
  if(top&&!top.closest('.nexus-sales-advanced')){
    const details=document.createElement('details');details.className='nexus-sales-advanced';details.innerHTML='<summary>Advanced prospect intake & evidence</summary>';
    top.parentNode?.insertBefore(details,top);details.appendChild(top);
  }
  section.querySelectorAll('.revenue-panel h2').forEach(h=>{if(h.textContent.trim()==='Leads')text(h,'Qualified pipeline');if(h.textContent.trim()==='Outreach packets')text(h,'Outreach ready for review');if(h.textContent.trim()==='Your pending revenue decisions')text(h,'Decisions requiring you')});
}

function hideManualCreation(){
  if(!state.admin||state.viewMode==='client')return;
  ['newTaskBtn','newMetricBtn','newMilestoneBtn','newDocumentRequestBtn'].forEach(id=>hidden($(id),true));
}

function simplifyClient(){
  const clientMode=!state.admin||state.viewMode==='client';if(!clientMode)return;
  const labels={today:'Today',files:'Files',improvement:'Results'};
  document.querySelectorAll('#nexusClientPrimaryNav [data-client-view]').forEach(button=>{const label=labels[button.dataset.clientView];if(label)text(button.querySelector('b'),label)});
  hidden($('nexusClientReportsButton'),true);hidden($('alertsBtn'),true);
  const pill=document.querySelector('.topbar .pill');text(pill,'CLIENT WORKSPACE');
  const select=$('companySelect');if(select&&select.options.length<=1)hidden(select,true);
  const mini=$('nexusClientMiniContext');if(mini){text(mini.querySelector('.kicker'),'Client workspace')}
  const files=$('nexus-client-files');if(files){text(files.querySelector('.eyebrow'),'Files')}
  const results=$('nexus-client-improvement');if(results){text(results.querySelector('.eyebrow'),'Results');const h1=results.querySelector('h1');text(h1,'What changed and what is next.')}
}

function simplifyTopbar(){
  const alerts=$('alertsBtn');if(alerts&&state.admin&&state.viewMode!=='client')text(alerts,'Alerts');
  const pill=document.querySelector('.topbar .pill');if(pill&&state.admin&&state.viewMode!=='client')text(pill,'NEXUS');
}

function apply(){
  simplifyAuth();simplifyTopbar();simplifyAdminNav();simplifyJourney();simplifyDecisions();simplifySales();hideManualCreation();simplifyClient();
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}
function scheduleSettled(){schedule();setTimeout(apply,140);setTimeout(apply,700)}

document.addEventListener('click',event=>{
  const target=event.target.closest('#journeyPrimaryAction,[data-start-package="solution_design"]');
  if(!target||target.dataset.productionResolutionGate!=='1')return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openDecisions();
},true);
document.addEventListener('click',()=>scheduleSettled(),false);
document.addEventListener('change',event=>{
  if(event.target?.matches?.('#companySelect,#nexusPerspectiveSelect,[data-company-switcher]'))scheduleSettled();
},false);
window.addEventListener('nexus:diagnosis-changed',scheduleSettled);window.addEventListener('nexus:diagnosis-updated',scheduleSettled);window.addEventListener('resize',schedule,{passive:true});
apply();setTimeout(apply,350);setTimeout(apply,1100);

window.NexusProductionSimplification={apply,openDecisions};
