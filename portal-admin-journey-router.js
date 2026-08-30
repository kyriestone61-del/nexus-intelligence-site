const portal=window.NexusPortal;
if(portal){
  document.addEventListener('click',event=>{
    if(!portal.state.admin)return;
    if(event.target?.closest?.('.open-client'))setTimeout(()=>document.querySelector('.journey-primary')?.click(),700);
  },true);
}
