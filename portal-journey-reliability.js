const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {state,toast}=portal;
let repairing=false;

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const intakeSection=()=>document.getElementById('section-intake');
const currentStageTitle=()=>document.querySelector('.journey-step.current h3')?.textContent?.trim()||'';
const isIntakeStage=()=>['Collect Information','Diagnose'].includes(currentStageTitle());

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
    if(!quiet)toast?.('Discovery & Diagnosis did not initialize. Nexus kept your current step unchanged; refresh once and try again.');
    return false;
  }finally{repairing=false}
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
  if(!clickTargetsIntake(button)||intakeSection())return;
  event.preventDefault();
  event.stopImmediatePropagation();
  button.disabled=true;
  const original=button.textContent;
  button.textContent='Opening…';
  ensureAdminIntake({open:true}).finally(()=>{
    if(button.isConnected){button.disabled=false;button.textContent=original}
  });
},true);

const scheduleRepair=()=>setTimeout(()=>ensureAdminIntake({quiet:true}),180);
document.getElementById('companySelect')?.addEventListener('change',scheduleRepair);
window.addEventListener('focus',scheduleRepair);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleRepair()});
setTimeout(()=>ensureAdminIntake({quiet:true}),180);
setTimeout(()=>ensureAdminIntake({quiet:true}),900);

window.NexusJourneyReliability={ensureAdminIntake};
