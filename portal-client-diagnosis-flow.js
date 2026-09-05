const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable for diagnosis approval flow.');
const {sb,state,toast}=portal;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize=value=>String(value||'').trim().toLowerCase().replaceAll(' ','_');
let releases=[];
let decisions=[];
let loadedCompanyId=null;
let loading=false;
let scheduled=false;

const isPreview=()=>state.previewReadOnly===true;
const isDiagnosisApprovalTask=task=>!!task&&normalize(task.task_type)==='approval'&&normalize(task.phase)==='diagnosis'&&!!task.source_diagnosis_run_id;
const taskById=id=>(state.tasks||[]).find(task=>String(task.id)===String(id))||null;
const releaseForTask=task=>isDiagnosisApprovalTask(task)?releases.find(row=>String(row.diagnosis_run_id)===String(task.source_diagnosis_run_id))||null:null;
const decisionFor=release=>decisions.filter(row=>String(row.release_id)===String(release.id)&&Number(row.report_version)===Number(release.report_version)).sort((a,b)=>String(b.decided_at||b.updated_at||'').localeCompare(String(a.decided_at||a.updated_at||'')))[0]||null;

function ensureStyles(){
  if(document.getElementById('nexusClientDiagnosisFlowStyles'))return;
  const style=document.createElement('style');
  style.id='nexusClientDiagnosisFlowStyles';
  style.textContent=`
    .nexus-client-report[data-diagnosis-release-id]{scroll-margin-top:24px}
    .nexus-client-report.nexus-diagnosis-focus{outline:2px solid rgba(215,255,94,.7);outline-offset:4px;box-shadow:0 0 0 8px rgba(215,255,94,.06)}
    .nexus-diagnosis-decision{margin-top:18px;padding:18px;border:1px solid rgba(215,255,94,.22);border-radius:14px;background:rgba(215,255,94,.035)}
    .nexus-diagnosis-decision-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    .nexus-diagnosis-decision-head h3{margin:4px 0 6px;font-size:20px;line-height:1.2}.nexus-diagnosis-decision-head p{margin:0;color:var(--nx-muted,#aaa4ba);font-size:15px;line-height:1.55}
    .nexus-diagnosis-decision-status{flex:0 0 auto;padding:6px 9px;border:1px solid rgba(255,255,255,.13);border-radius:999px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
    .nexus-diagnosis-decision-status.approved{color:#80efc0;border-color:rgba(128,239,192,.3)}.nexus-diagnosis-decision-status.changes{color:#ffe1a8;border-color:rgba(255,225,168,.3)}
    .nexus-diagnosis-decision .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.nexus-diagnosis-decision .btn{min-height:48px}
    .nexus-diagnosis-decision details{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}.nexus-diagnosis-decision details>summary{cursor:pointer;font-weight:850}
    .nexus-diagnosis-decision textarea{width:100%;box-sizing:border-box;min-height:105px;margin-top:10px;font-size:16px;line-height:1.45;resize:vertical}
    .nexus-diagnosis-decision-note,.nexus-diagnosis-preview-note{margin-top:12px;padding:11px 12px;border-radius:10px;background:rgba(255,255,255,.035);font-size:14px;line-height:1.5;color:var(--nx-muted,#aaa4ba)}
    @media(max-width:760px){.nexus-diagnosis-decision{padding:16px}.nexus-diagnosis-decision-head{display:grid}.nexus-diagnosis-decision .actions{display:grid}.nexus-diagnosis-decision .btn{width:100%;font-size:16px}.nexus-diagnosis-decision-head p{font-size:16px}}
  `;
  document.head.appendChild(style);
}

async function load({force=false}={}){
  const companyId=state.companyId;
  if(!companyId||loading)return;
  if(!force&&loadedCompanyId===companyId&&releases.length)return;
  loading=true;
  try{
    const [releaseResult,decisionResult]=await Promise.all([
      sb.from('nexus_diagnosis_report_releases').select('id,company_id,project_id,diagnosis_run_id,status,report_version,released_at,revoked_at').eq('company_id',companyId).eq('status','released').is('revoked_at',null).order('released_at',{ascending:false}),
      sb.from('nexus_diagnosis_report_client_decisions').select('id,release_id,report_version,company_id,decision,note,decided_at,updated_at').eq('company_id',companyId).order('decided_at',{ascending:false})
    ]);
    if(releaseResult.error)throw releaseResult.error;
    if(decisionResult.error)throw decisionResult.error;
    if(companyId!==state.companyId)return;
    releases=releaseResult.data||[];
    decisions=decisionResult.data||[];
    loadedCompanyId=companyId;
    decorate();
  }catch(error){console.error('Relystra diagnosis approval flow could not load.',error)}
  finally{loading=false}
}

function statusMarkup(current){
  if(current?.decision==='approved')return '<span class="nexus-diagnosis-decision-status approved">Approved</span>';
  if(current?.decision==='changes_requested')return '<span class="nexus-diagnosis-decision-status changes">Changes requested</span>';
  return '<span class="nexus-diagnosis-decision-status">Awaiting approval</span>';
}

function decisionMarkup(release){
  const current=decisionFor(release),approved=current?.decision==='approved',changes=current?.decision==='changes_requested',preview=isPreview();
  const intro=approved?'You approved this diagnosis. The next eligible client step is now available when its prerequisites are satisfied.':changes?'Relystra has your requested changes. This approval stays paused until a revised report version is released.':'Review the diagnosis above, including the recommended first priority. Approve it if it is accurate enough to move forward, or request a correction.';
  const previewNote=preview?'<div class="nexus-diagnosis-preview-note"><b>Admin Client View:</b> this is a read-only preview. The signed-in client can approve or request changes from this exact report.</div>':'';
  const approveButton=!approved?(preview?'<button type="button" class="btn primary" disabled aria-disabled="true">Client can approve diagnosis</button>':'<button type="button" class="btn primary" data-diagnosis-approve>Approve diagnosis</button>'):'';
  const changeBlock=preview?'':`<details><summary>${approved?'Need to correct something after approval?':'Request changes instead'}</summary><textarea data-diagnosis-change-note placeholder="Tell Relystra exactly what is inaccurate, missing, or unclear.">${changes?esc(current.note||''):''}</textarea><div class="actions"><button type="button" class="btn secondary" data-diagnosis-request-changes>Send change request</button></div></details>`;
  return `<section class="nexus-diagnosis-decision" data-diagnosis-decision-release="${esc(release.id)}"><div class="nexus-diagnosis-decision-head"><div><div class="kicker">Your decision · Report v${esc(release.report_version)}</div><h3>${approved?'Diagnosis approved':changes?'Relystra is revising the report':'Approve the diagnosis and first priority'}</h3><p>${esc(intro)} Approval does not authorize implementation, production access, or additional paid work.</p></div>${statusMarkup(current)}</div>${changes&&current.note?`<div class="nexus-diagnosis-decision-note"><b>Your change request:</b><br>${esc(current.note)}</div>`:''}${previewNote}${approveButton?`<div class="actions">${approveButton}</div>`:''}${changeBlock}</section>`;
}

function bindDecisionPanel(card,release){
  const panel=card.querySelector(`[data-diagnosis-decision-release="${CSS.escape(release.id)}"]`);if(!panel)return;
  panel.querySelector('[data-diagnosis-approve]')?.addEventListener('click',event=>{
    if(!window.confirm('Approve this diagnosis and recommended first priority? This does not authorize implementation or production access.'))return;
    submitDecision(release,'approved','',event.currentTarget);
  });
  panel.querySelector('[data-diagnosis-request-changes]')?.addEventListener('click',event=>{
    const note=panel.querySelector('[data-diagnosis-change-note]')?.value?.trim()||'';
    if(!note){toast?.('Explain what needs to change before sending the request.');return}
    submitDecision(release,'changes_requested',note,event.currentTarget);
  });
}

function mountReportControls(){
  const root=document.getElementById('nexus-client-reports');
  const cards=[...root?.querySelectorAll('.nexus-client-report')||[]];
  if(!cards.length||!releases.length)return;
  const count=Math.min(cards.length,releases.length);
  for(let index=0;index<count;index+=1){
    const card=cards[index],release=releases[index];
    card.dataset.diagnosisReleaseId=release.id;
    card.querySelector('[data-diagnosis-decision-release]')?.remove();
    card.insertAdjacentHTML('beforeend',decisionMarkup(release));
    bindDecisionPanel(card,release);
  }
}

function decorateTaskButtons(){
  document.querySelectorAll('[data-complete-task]').forEach(button=>{
    const task=taskById(button.dataset.completeTask);if(!task)return;
    const diagnosis=isDiagnosisApprovalTask(task),release=releaseForTask(task);
    if(diagnosis){
      button.dataset.diagnosisApprovalTask='true';
      if(release){button.dataset.diagnosisReleaseId=release.id;button.disabled=false;button.removeAttribute('aria-disabled');button.textContent=isPreview()?'Preview diagnosis approval →':'Review & approve diagnosis →';button.title='Open the released diagnosis and complete the approval there.'}
      else if(button.classList.contains('nexus-client-primary-cta')){button.disabled=true;button.setAttribute('aria-disabled','true');button.textContent='Diagnosis report not released yet';button.title='Relystra must release the client-safe diagnosis before this approval can be completed.'}
      return;
    }
    if(isPreview()&&button.classList.contains('nexus-client-primary-cta'))button.textContent='Preview this client step →';
  });
}

function decorate(){
  ensureStyles();
  decorateTaskButtons();
  mountReportControls();
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{scheduled=false;decorate()}))}

async function openDiagnosisTask(task){
  if(loadedCompanyId!==state.companyId)await load({force:true});
  const release=releaseForTask(task);
  if(!release){
    toast?.(isPreview()?'This diagnosis has not been released to the client yet. Release the client-safe report from Admin before asking the client to approve it.':'Relystra is still preparing your diagnosis report. This approval will open automatically after the report is released.');
    return;
  }
  window.NexusClientShell?.activateView?.('reports');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  mountReportControls();
  const card=document.querySelector(`.nexus-client-report[data-diagnosis-release-id="${CSS.escape(release.id)}"]`);
  if(card){card.classList.add('nexus-diagnosis-focus');card.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>card.classList.remove('nexus-diagnosis-focus'),2200)}
}

async function submitDecision(release,decision,note,button){
  if(isPreview()){toast?.('Client View is read-only. The signed-in client can make this decision.');return}
  const original=button?.textContent||'';
  if(button){button.disabled=true;button.textContent=decision==='approved'?'Approving…':'Sending…'}
  try{
    const {error}=await sb.rpc('nexus_submit_diagnosis_report_decision',{p_release_id:release.id,p_decision:decision,p_note:note||null});
    if(error)throw error;
    await portal.workspace?.();
    await window.NexusClientShell?.refresh?.({force:true});
    loadedCompanyId=null;releases=[];decisions=[];await load({force:true});
    window.NexusClientShell?.activateView?.('today');
    const next=window.NexusClientShell?.getCurrentActionContext?.()?.primaryAction;
    if(decision==='approved')toast?.(next?`Diagnosis approved. Your next step is “${next.title}.”`:'Diagnosis approved. Nothing else needs you right now.');
    else toast?.('Change request sent. Relystra is reviewing it. This approval will reopen when a revised report is released.');
  }catch(error){console.error('Diagnosis decision failed.',error);toast?.(error.message||'Your diagnosis decision could not be saved.')}
  finally{if(button?.isConnected){button.disabled=false;button.textContent=original}}
}

document.addEventListener('click',event=>{
  const taskButton=event.target.closest?.('[data-complete-task]');
  if(taskButton){
    const task=taskById(taskButton.dataset.completeTask);
    if(isDiagnosisApprovalTask(task)){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      openDiagnosisTask(task);
      return;
    }
  }
  if(event.target.closest?.('#nexusClientReportsButton,[data-client-reports],[data-client-view="reports"],[data-client-go="reports"]'))setTimeout(schedule,0);
},true);

window.addEventListener('nexus:workspace-ready',event=>{if(event.detail?.companyId===state.companyId){loadedCompanyId=null;releases=[];decisions=[];load({force:true})}});
window.addEventListener('nexus:client-context-ready',event=>{if(event.detail?.companyId===state.companyId){load();schedule()}});
window.addEventListener('nexus:diagnosis-changed',()=>{loadedCompanyId=null;releases=[];decisions=[];load({force:true})});

ensureStyles();
load({force:true});
schedule();
window.NexusClientDiagnosisFlow=Object.freeze({refresh:()=>load({force:true}),decorate,isDiagnosisApprovalTask,releaseForTask});
