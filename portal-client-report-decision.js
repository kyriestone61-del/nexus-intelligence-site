const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let releases=[];
let decisions=[];
let queued=false;
let loading=false;

function ensureStyles(){
  if(document.getElementById('nexusClientDiagnosisDecisionStyles'))return;
  const style=document.createElement('style');
  style.id='nexusClientDiagnosisDecisionStyles';
  style.textContent=`
    .nexus-client-report-decision{margin-top:16px;padding:14px;border:1px solid rgba(156,124,255,.2);border-radius:12px;background:rgba(156,124,255,.045)}
    .nexus-client-report-decision-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.nexus-client-report-decision-head h3{margin:4px 0 4px;font-size:17px}.nexus-client-report-decision-head p{margin:0;color:var(--nx-muted);font-size:12px;line-height:1.5}
    .nexus-client-report-decision-status{flex:0 0 auto;padding:5px 8px;border:1px solid var(--nx-line);border-radius:999px;font-size:10px;font-weight:900}.nexus-client-report-decision-status.approved{color:var(--nx-mint,#6ee7bb);border-color:rgba(110,231,187,.3)}.nexus-client-report-decision-status.changes{color:#ffe1a8;border-color:rgba(255,198,109,.3)}
    .nexus-client-report-decision .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.nexus-client-report-decision details{margin-top:10px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}.nexus-client-report-decision details>summary{cursor:pointer;font-size:11px;font-weight:850}.nexus-client-report-decision textarea{width:100%;box-sizing:border-box;min-height:84px;margin-top:8px;resize:vertical}.nexus-client-report-decision-note{margin-top:10px;padding:10px;border-radius:9px;background:rgba(255,255,255,.025);color:var(--nx-muted);font-size:12px;line-height:1.5}
    @media(max-width:760px){.nexus-client-report-decision-head{display:grid}.nexus-client-report-decision .btn{width:100%}.nexus-client-report-decision textarea{font-size:16px}}
  `;
  document.head.appendChild(style);
}

function decisionFor(release){return decisions.find(row=>row.release_id===release.id&&Number(row.report_version)===Number(release.report_version))||null}
function panelMarkup(release){
  const current=decisionFor(release);
  const approved=current?.decision==='approved';
  const changes=current?.decision==='changes_requested';
  const status=approved?'<span class="nexus-client-report-decision-status approved">Approved</span>':changes?'<span class="nexus-client-report-decision-status changes">Changes requested</span>':'<span class="nexus-client-report-decision-status">Awaiting your approval</span>';
  return `<section class="nexus-client-report-decision" data-report-decision-release="${esc(release.id)}" data-report-version="${esc(release.report_version)}"><div class="nexus-client-report-decision-head"><div><div class="kicker">Client approval · Report v${esc(release.report_version)}</div><h3>${approved?'You approved this diagnosis.':changes?'Nexus has your requested changes.':'Approve the vetted diagnosis'}</h3><p>${approved?'Implementation choices remain separate; approving the report does not purchase or activate a solution.':changes?'Nexus will review your note and, if changes are warranted, release a new report version for your approval.':'Confirm that this report is accurate enough to move forward, or tell Nexus what needs to change.'}</p></div>${status}</div>${changes&&current.note?`<div class="nexus-client-report-decision-note"><b>Your note:</b><br>${esc(current.note)}</div>`:''}${!approved?`<div class="actions"><button type="button" class="btn primary" data-approve-diagnosis>Approve report</button></div>`:''}<details ${changes?'':' '}><summary>${approved?'Need to correct something after approval?':'Request changes instead'}</summary><textarea data-diagnosis-change-note placeholder="Tell Nexus exactly what is inaccurate, missing, or needs clarification before you approve this report.">${changes?esc(current.note||''):''}</textarea><div class="actions"><button type="button" class="btn secondary" data-request-diagnosis-changes>Send change request</button></div></details></section>`;
}

async function load(){
  const companyId=state.companyId;if(!companyId||loading)return;
  loading=true;
  try{
    const releaseResult=await sb.from('nexus_diagnosis_report_releases').select('id,company_id,report_version,released_at').eq('company_id',companyId).eq('status','released').is('revoked_at',null).order('released_at',{ascending:false});
    if(releaseResult.error)throw releaseResult.error;
    releases=releaseResult.data||[];
    if(!releases.length){decisions=[];return}
    const ids=releases.map(row=>row.id);
    const decisionResult=await sb.from('nexus_diagnosis_report_client_decisions').select('id,release_id,report_version,decision,note,decided_at,updated_at').in('release_id',ids).order('decided_at',{ascending:false});
    if(decisionResult.error)throw decisionResult.error;
    decisions=decisionResult.data||[];
    mount();
  }catch(error){console.error('Client diagnosis approval state failed to load',error)}finally{loading=false}
}

async function submit(release,decision,note,button){
  const original=button?.textContent||'';if(button){button.disabled=true;button.textContent='Sending…'}
  try{
    const {data,error}=await sb.rpc('nexus_submit_diagnosis_report_decision',{p_release_id:release.id,p_decision:decision,p_note:note||null});
    if(error)throw error;
    toast?.(decision==='approved'?'Diagnosis report approved.':'Change request sent to Nexus.');
    await load();
    window.dispatchEvent(new CustomEvent('nexus:client-report-decision',{detail:{releaseId:release.id,reportVersion:release.report_version,decision:data?.decision||decision}}));
  }catch(error){console.error('Diagnosis client decision failed',error);toast?.(error.message||'Your report decision could not be sent.')}finally{if(button?.isConnected){button.disabled=false;button.textContent=original}}
}

function mount(){
  const root=document.getElementById('nexus-client-reports');
  const cards=[...root?.querySelectorAll('.nexus-client-report')||[]];
  if(!cards.length)return;
  if(cards.length!==releases.length){console.warn('Nexus skipped report approval controls because report/release ordering could not be reconciled safely.',{cards:cards.length,releases:releases.length});return}
  cards.forEach((card,index)=>{
    const release=releases[index];if(!release)return;
    const old=card.querySelector('[data-report-decision-release]');if(old)old.remove();
    card.insertAdjacentHTML('beforeend',panelMarkup(release));
    const panel=card.querySelector(`[data-report-decision-release="${CSS.escape(release.id)}"]`);if(!panel)return;
    panel.querySelector('[data-approve-diagnosis]')?.addEventListener('click',event=>{
      if(!window.confirm('Approve this diagnosis report? This confirms the report is accurate enough to proceed; it does not purchase or activate any solution.'))return;
      submit(release,'approved','',event.currentTarget);
    });
    panel.querySelector('[data-request-diagnosis-changes]')?.addEventListener('click',event=>{
      const note=panel.querySelector('[data-diagnosis-change-note]')?.value?.trim()||'';
      if(!note){toast?.('Explain what needs to change before sending the request.');return}
      submit(release,'changes_requested',note,event.currentTarget);
    });
  });
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(releases.length)mount();else load()})}

ensureStyles();
const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:client-context-ready',()=>{releases=[];decisions=[];schedule()});
window.addEventListener('nexus:diagnosis-changed',()=>{releases=[];decisions=[];schedule()});
schedule();

window.NexusClientDiagnosisDecision=Object.freeze({refresh:()=>{releases=[];decisions=[];return load()}});
