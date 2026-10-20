const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable for diagnosis deep links.');
let handled=false;

function requestedRelease(){
  const params=new URLSearchParams(location.search);
  const view=params.get('view'),release=params.get('release');
  return view==='diagnosis-report'&&release?release:null;
}
function requestedWorkspace(){
  const params=new URLSearchParams(location.search);
  return {companyId:params.get('company'),projectId:params.get('project')};
}
async function waitFor(test,{timeout=2600,step=80}={}){
  const start=Date.now();
  while(Date.now()-start<timeout){try{const value=test();if(value)return value}catch{}await new Promise(resolve=>setTimeout(resolve,step))}
  return null;
}
async function openRequestedReport(){
  if(handled)return;
  const releaseId=requestedRelease();if(!releaseId)return;
  handled=true;
  try{
    const target=requestedWorkspace();
    if(target.companyId&&(target.companyId!==portal.state.companyId||String(target.projectId||'')!==String(portal.state.activeProjectId||''))){
      const opened=await portal.workspace?.(target.companyId,{reason:'diagnosis-report-link',projectId:target.projectId||null});
      if(opened===false){handled=false;return false}
    }
    await window.NexusClientDiagnosisFlow?.refresh?.();
    window.NexusClientShell?.activateView?.('reports');
    const card=await waitFor(()=>{
      window.NexusClientDiagnosisFlow?.decorate?.();
      return document.querySelector(`.nexus-client-report[data-diagnosis-release-id="${CSS.escape(releaseId)}"]`);
    });
    if(card){
      card.classList.add('nexus-diagnosis-focus');
      card.scrollIntoView({behavior:'smooth',block:'start'});
      setTimeout(()=>card.classList.remove('nexus-diagnosis-focus'),2400);
    }else{
      portal.toast?.('The diagnosis report link opened Reports, but that report is not available in this workspace.');
    }
    return true;
  }catch{
    handled=false;
    portal.toast?.('The diagnosis report could not be opened. Please try again.');
    return false;
  }
}

window.addEventListener('nexus:client-context-ready',openRequestedReport);
window.addEventListener('load',()=>setTimeout(openRequestedReport,120));
setTimeout(openRequestedReport,450);
window.NexusClientDiagnosisDeepLink=Object.freeze({openRequestedReport,requestedRelease,requestedWorkspace});
