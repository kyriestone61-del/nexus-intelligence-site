const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');

const {sb,toast}=portal;
let approving=false;

function ensureStyles(){
  if(document.getElementById('nexusDiagnosisApprovalUxStyles'))return;
  const style=document.createElement('style');
  style.id='nexusDiagnosisApprovalUxStyles';
  style.textContent=`
    .diagnosis-decision-feedback{margin:0 0 12px;padding:12px 14px;border:1px solid rgba(217,255,114,.24);border-radius:10px;background:rgba(217,255,114,.055);color:var(--nx-text,#f4f0e8);font-size:13px;line-height:1.45}
    .diagnosis-decision-feedback.error{border-color:rgba(255,139,154,.35);background:rgba(255,139,154,.07);color:#ffd5da}
    .diagnosis-decision-feedback.success{border-color:rgba(110,231,187,.35);background:rgba(110,231,187,.07);color:#d7ffef}
    .diagnosis-review-actions [data-diagnosis-action="approve"][aria-busy="true"]{cursor:wait;opacity:.9}
    body.diagnosis-review-open .toast{z-index:2147483646!important}
  `;
  document.head.appendChild(style);
}

function feedbackHost(button){return button?.closest('.diagnosis-review-actions')||document.getElementById('diagnosisReviewBody')}
function setFeedback(button,message,type='working'){
  const host=feedbackHost(button);if(!host)return null;
  let node=host.querySelector(':scope > .diagnosis-decision-feedback');
  if(!node){node=document.createElement('div');node.className='diagnosis-decision-feedback';host.prepend(node)}
  node.className=`diagnosis-decision-feedback${type==='error'?' error':type==='success'?' success':''}`;
  node.textContent=message;
  node.setAttribute('role',type==='error'?'alert':'status');
  return node;
}

function setActionsDisabled(button,disabled){
  const host=button?.closest('.diagnosis-review-actions');
  host?.querySelectorAll('[data-diagnosis-action]').forEach(control=>{control.disabled=disabled});
}

async function approve(button){
  if(approving)return;
  const id=button?.dataset?.id;if(!id)return;
  approving=true;
  ensureStyles();
  const original=button.textContent;
  const note=document.getElementById('diagnosisReviewNote')?.value?.trim()||'';
  setActionsDisabled(button,true);
  button.setAttribute('aria-busy','true');
  button.textContent='Approving…';
  setFeedback(button,'Saving diagnosis approval and preparing the recommended action plan…');
  try{
    const {data,error}=await sb.rpc('nexus_approve_diagnosis',{p_run_id:id,p_note:note||null});
    if(error)throw error;
    setFeedback(button,'Diagnosis approved. Recommended actions are ready for your selection. No downstream action items have been released yet.','success');
    toast?.('Diagnosis approved. Review the recommended actions before anything is assigned.');
    window.NexusDiagnosisController?.invalidateLatest?.();
    await window.NexusDiagnosisReviewRuntime?.openReview?.(id,{force:true});
    window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed',{detail:{runId:id,action:'approved',summary:data||null}}));
  }catch(error){
    console.error('Diagnosis approval failed',error);
    const message=String(error?.message||'Diagnosis approval could not be saved.');
    setFeedback(button,`Approval was not saved: ${message}`,'error');
    toast?.(`Approval was not saved: ${message}`);
    if(button?.isConnected){button.textContent=original;button.removeAttribute('aria-busy');setActionsDisabled(button,false)}
  }finally{
    approving=false;
    if(button?.isConnected&&button.getAttribute('aria-busy')==='true'){
      button.removeAttribute('aria-busy');
      setActionsDisabled(button,false);
    }
  }
}

function hideReviewForDrilldown(event){
  const target=event.target.closest?.('#diagnosisReviewModal .diagnosis-generated [data-output-kind],#diagnosisReviewModal .diagnosis-generated [data-open-generated-workspace],#diagnosisReviewModal .diagnosis-generated [data-continue-step4]');
  if(!target)return;
  const modal=document.getElementById('diagnosisReviewModal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden','true');
  document.body.classList.remove('diagnosis-review-open');
}

ensureStyles();
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-diagnosis-action="approve"]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  approve(button);
},true);
document.addEventListener('click',hideReviewForDrilldown,true);

window.NexusDiagnosisApprovalUX={approve};
await import('/portal-resolution-plan.js?v=20260904-baseline-flow1').catch(error=>console.error('Resolution plan failed to load',error));
await import('/portal-resolution-inline-approval-bridge.js?v=20260904-baseline-flow1').catch(error=>console.error('Resolution inline approval bridge failed to load',error));
import('/portal-diagnosis-output-hub.js?v=20260904-baseline-flow1').catch(error=>console.error('Diagnosis output hub failed to load',error));
