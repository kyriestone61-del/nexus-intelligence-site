const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for live task file state.');
const {state}=portal;
let scheduled=false;

function sync(){
  scheduled=false;
  const modal=document.getElementById('nexusInlineFileTaskModal'),submit=modal?.querySelector('[data-inline-file-submit]');
  if(submit&&window.NexusTaskFileAttachments){
    const task=(state.tasks||[]).find(row=>String(row.id)===String(submit.dataset.inlineFileSubmit));
    const hasFiles=!!task&&window.NexusTaskFileAttachments.taskDocs(task).length>0;
    submit.disabled=!hasFiles;
    submit.title=hasFiles?'':'Upload at least one file first.';
    window.NexusTaskFileAttachments.refresh?.();
  }
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(sync)}
window.addEventListener('nexus:workspace-ready',schedule);
window.addEventListener('nexus:client-context-ready',schedule);
const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
schedule();

const DIAGNOSIS_FLOW_BUILD='20260903-diagnosis-flow1';
import(`/portal-client-diagnosis-flow.js?v=${DIAGNOSIS_FLOW_BUILD}`).catch(error=>console.error('Nexus diagnosis approval flow failed to load.',error));
