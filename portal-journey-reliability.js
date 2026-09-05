const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');
const {state,toast}=portal;
let repairing=false;

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const intakeSection=()=>document.getElementById('section-intake');
const currentStageTitle=()=>document.querySelector('.journey-step.current h3')?.textContent?.trim()||'';
const isIntakeStage=()=>['Collect Information','Diagnose'].includes(currentStageTitle());
const terminal=s=>['completed','approved','done','complete','not_applicable'].includes(String(s||'').toLowerCase());
const stagePackage=title=>({
  'Collect Information':'client_discovery',
  'Agree on the Plan':'solution_design',
  'Build, Test & Launch':'implementation_launch',
  'Train & Handoff':'training_handoff',
  'Measure, Optimize & Complete':'monthly_optimization'
}[title]||null);

function activateSection(name){
  document.querySelectorAll('.section').forEach(section=>section.classList.toggle('active',section.id===`section-${name}`));
  document.querySelectorAll('.side-nav button').forEach(button=>button.classList.toggle('active',button.dataset.section===name));
  window.scrollTo({top:0,left:0,behavior:'auto'});
}

function requestAdminIntakeReconcile(){
  const selector=document.getElementById('companySelect');
  if(!selector)return false;
  selector.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}

async function ensureAdminIntake({open=false,quiet=false}={}){
  if(!state.admin)return false;
  if(intakeSection()){
    if(open)activateSection('intake');
    return true;
  }
  if(repairing){
    await delay(260);
    if(intakeSection()&&open)activateSection('intake');
    return !!intakeSection();
  }
  repairing=true;
  try{
    requestAdminIntakeReconcile();
    for(const wait of [80,160,260,420]){
      await delay(wait);
      if(intakeSection()){
        if(open)activateSection('intake');
        return true;
      }
    }
    if(!quiet)toast?.('Discovery & Diagnosis did not initialize. Relystra kept your current step unchanged; refresh once and try again.');
    return false;
  }finally{repairing=false}
}

function syncJourneySummary(){
  if(!state.admin)return;
  const cards=[...document.querySelectorAll('.journey-summary-grid .journey-summary-card')];
  if(cards.length<3)return;
  const title=currentStageTitle(),pkg=stagePackage(title),status=document.querySelector('.journey-focus .journey-status')?.textContent?.trim()||'';
  let client=0,attention=0;
  if(pkg){
    const tasks=(state.tasks||[]).filter(task=>task.package_code===pkg&&!terminal(task.status));
    client=tasks.filter(task=>task.assignee==='client'&&task.status!=='ready_for_review').length;
    attention=tasks.filter(task=>task.assignee==='nexus'||task.status==='ready_for_review').length;
  }else if(title==='Diagnose'){
    attention=['Your work','Ready for review'].includes(status)?1:0;
  }else if(title==='Set Up Client'){
    attention=status==='Complete'?0:1;
  }
  const clientValue=cards[1].querySelector('b'),attentionValue=cards[2].querySelector('b');
  if(clientValue&&clientValue.textContent!==String(client))clientValue.textContent=String(client);
  if(attentionValue&&attentionValue.textContent!==String(attention))attentionValue.textContent=String(attention);
}

function clickTargetsIntake(button){
  if(!button)return false;
  if(button.dataset.open==='intake')return true;
  if(button.matches('[data-primary-action]')&&isIntakeStage())return true;
  return false;
}

document.addEventListener('click',event=>{
  if(!state.admin)return;
  const button=event.target.closest?.('button');
  if(clickTargetsIntake(button)&&!intakeSection()){
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled=true;
    const original=button.textContent;
    button.textContent='Opening…';
    ensureAdminIntake({open:true}).finally(()=>{
      if(button.isConnected){button.disabled=false;button.textContent=original}
    });
    return;
  }
  setTimeout(syncJourneySummary,80);
},true);

const scheduleRepair=()=>setTimeout(()=>{ensureAdminIntake({quiet:true});syncJourneySummary()},180);
document.getElementById('companySelect')?.addEventListener('change',scheduleRepair);
window.addEventListener('focus',scheduleRepair);
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(syncJourneySummary,100));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleRepair()});
setTimeout(()=>ensureAdminIntake({quiet:true}),180);
setTimeout(()=>{ensureAdminIntake({quiet:true});syncJourneySummary()},900);

window.NexusJourneyReliability={ensureAdminIntake,syncJourneySummary};
