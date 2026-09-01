const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {state,toast}=portal;

function canonical(){return window.NexusFoundationHardening?.activeProject?.()||null}
function normalizeLegacyOrder(){
  const active=canonical(),projects=Array.isArray(state.projects)?state.projects:[];
  if(!active?.id||projects[0]?.id===active.id)return active;
  const match=projects.find(p=>p.id===active.id)||active;
  state.projects=[match,...projects.filter(p=>p.id!==active.id)];
  return match;
}
function guardCompanyProjectAction(event){
  const target=event.target.closest?.('#captureDiscoveryContextBtn,#queueDiagnosisBtn,#createApprovalChainBtn');if(!target)return;
  const active=normalizeLegacyOrder();if(active?.id)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  toast?.('Resolve one active engagement before continuing. Nexus will not guess which project should receive this record.');
}
function reconcile(){normalizeLegacyOrder()}

document.addEventListener('click',guardCompanyProjectAction,true);
document.getElementById('companySelect')?.addEventListener('change',()=>setTimeout(reconcile,80));
window.addEventListener('nexus:diagnosis-changed',reconcile);
window.addEventListener('nexus:discovery-context-captured',reconcile);
reconcile();
window.NexusActiveEngagementCohesion={canonical,normalizeLegacyOrder};
