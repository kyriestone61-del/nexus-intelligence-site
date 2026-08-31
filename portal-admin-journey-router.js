const portal=window.NexusPortal;

function promoteCoreNav(){
  if(!portal?.state?.admin)return false;
  const nav=document.querySelector('.side-nav');
  const journey=nav?.querySelector('.journey-primary');
  const intake=nav?.querySelector('button[data-section="intake"]');
  if(!nav||!journey||!intake)return false;
  intake.textContent='Discovery & Diagnosis';
  intake.classList.add('journey-core-tool');
  intake.setAttribute('aria-label','Open Discovery & Diagnosis');
  if(intake.previousElementSibling!==journey)journey.insertAdjacentElement('afterend',intake);
  return true;
}

if(portal){
  promoteCoreNav();
  document.addEventListener('click',event=>{
    if(!portal.state.admin)return;
    if(event.target?.closest?.('.open-client')){
      setTimeout(()=>{
        document.querySelector('.journey-primary')?.click();
        promoteCoreNav();
      },700);
    }
  },true);
  portal.$?.('companySelect')?.addEventListener('change',()=>setTimeout(promoteCoreNav,260));
  window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(promoteCoreNav,120));
  window.addEventListener('focus',()=>setTimeout(promoteCoreNav,120));
  for(const ms of [0,120,350,800])setTimeout(promoteCoreNav,ms);
}

window.NexusAdminJourneyRouter={promoteCoreNav};
