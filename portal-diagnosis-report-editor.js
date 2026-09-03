const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
if(!state.admin)throw new Error('Founder diagnosis editor must only load in the admin workspace.');

let activeRunId=null;
let mountQueued=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];

function ensureStyles(){
  if(document.getElementById('nexusDiagnosisEditorStyles'))return;
  const style=document.createElement('style');
  style.id='nexusDiagnosisEditorStyles';
  style.textContent=`
  .nx-report-editor{margin:14px 0;padding:16px;border:1px solid rgba(217,255,114,.2);border-radius:14px;background:rgba(217,255,114,.035)}
  .nx-report-editor-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
  .nx-report-editor-head h3{margin:4px 0 4px}.nx-report-editor-head p{margin:0;color:var(--muted,#aaa4ba);font-size:12px}
  .nx-report-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.nx-report-editor-grid .field{margin:0}
  .nx-report-editor textarea{min-height:100px}.nx-report-editor .actions{margin-top:8px}
  .nx-report-opps{display:grid;gap:8px;margin-top:12px}.nx-report-opp{padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:rgba(255,255,255,.02)}
  .nx-report-opp h4{margin:0 0 4px}.nx-report-opp p{margin:0 0 8px;color:var(--muted,#aaa4ba);font-size:12px}
  .nx-report-adjustments{display:grid;gap:6px;margin-top:10px}.nx-report-adjustment{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:9px}
  .nx-report-preview{margin-top:10px;padding:12px;border:1px solid rgba(156,124,255,.22);border-radius:10px;background:rgba(156,124,255,.05)}.nx-report-preview h4{margin:0 0 8px}.nx-report-preview ul{margin:6px 0 0;padding-left:18px}
  @media(max-width:760px){.nx-report-editor-grid{grid-template-columns:1fr}.nx-report-editor-head{display:block}.nx-report-adjustment{align-items:flex-start;flex-direction:column}.nx-report-adjustment .btn{width:100%}}
  `;
  document.head.appendChild(style);
}

async function effectiveReport(runId){
  const {data,error}=await sb.rpc('nexus_effective_client_report',{p_run_id:runId});
  if(error)throw error;
  return data||{};
}
async function adjustments(runId){
  const {data,error}=await sb.from('nexus_diagnosis_report_adjustments').select('id,adjustment_type,target_key,payload,reason,created_at,revoked_at').eq('diagnosis_run_id',runId).order('created_at',{ascending:true});
  if(error)throw error;
  return data||[];
}
async function addAdjustment(type,targetKey,payload,reason){
  if(!activeRunId)throw new Error('No diagnosis is selected.');
  const {error}=await sb.rpc('nexus_add_diagnosis_report_adjustment',{p_run_id:activeRunId,p_adjustment_type:type,p_target_key:targetKey||null,p_payload:payload||{},p_reason:reason||null});
  if(error)throw error;
  toast?.('Client report adjustment saved.');
  await refreshEditor();
}
async function revokeAdjustment(id){
  const {error}=await sb.rpc('nexus_revoke_diagnosis_report_adjustment',{p_adjustment_id:id});
  if(error)throw error;
  toast?.('Original report content restored.');
  await refreshEditor();
}

function oppKey(opp,index){return opp?.rank!=null?`rank:${opp.rank}`:(opp?.title||`index:${index}`)}
function previewMarkup(report){
  const opps=arr(report?.opportunity_backlog);
  const pilot=report?.smallest_safe_pilot||{};
  return `<div class="nx-report-preview"><div class="kicker">Client-safe preview</div><h4>${esc(report?.executive_summary||'No executive summary')}</h4>${pilot?.title||pilot?.summary?`<p><b>Recommended first move:</b> ${esc(pilot.title||'')} ${esc(pilot.summary||'')}</p>`:''}<b>Opportunities shown to client</b><ul>${opps.length?opps.map(x=>`<li>${esc(x.title||x.recommendation||'Opportunity')}</li>`).join(''):'<li>No opportunities included.</li>'}</ul></div>`;
}
function adjustmentLabel(row){
  return ({replace_executive_summary:'Executive summary edited',hide_opportunity:'Opportunity hidden',rewrite_opportunity:'Opportunity rewritten',add_opportunity:'Founder recommendation added',replace_first_move:'Recommended first move edited'})[row.adjustment_type]||row.adjustment_type;
}

async function renderEditor(host){
  if(!activeRunId||!host)return;
  const [report,rows]=await Promise.all([effectiveReport(activeRunId),adjustments(activeRunId)]);
  const active=rows.filter(x=>!x.revoked_at);
  const opps=arr(report.opportunity_backlog);
  const pilot=report.smallest_safe_pilot||{};
  host.innerHTML=`<div class="nx-report-editor-head"><div><div class="kicker">Founder controls</div><h3>Edit client report</h3><p>Changes affect only the client-facing report. The original AI diagnosis remains immutable and every change is audited.</p></div><button class="btn secondary" type="button" data-nx-preview>Refresh preview</button></div>
  <div class="nx-report-editor-grid">
    <div class="field"><label>Executive summary</label><textarea data-nx-summary>${esc(report.executive_summary||'')}</textarea><input data-nx-summary-reason placeholder="Reason for change (recommended)"><div class="actions"><button class="btn secondary" type="button" data-nx-save-summary>Save summary</button></div></div>
    <div class="field"><label>Recommended first move</label><input data-nx-pilot-title value="${esc(pilot.title||'')}" placeholder="Title"><textarea data-nx-pilot-summary placeholder="Summary">${esc(pilot.summary||'')}</textarea><input data-nx-pilot-reason placeholder="Reason for change (recommended)"><div class="actions"><button class="btn secondary" type="button" data-nx-save-pilot>Save first move</button></div></div>
  </div>
  <div class="nx-report-opps"><div class="kicker">Client opportunities</div>${opps.map((opp,index)=>`<article class="nx-report-opp" data-opp-key="${esc(oppKey(opp,index))}"><h4>${esc(opp.title||`Opportunity ${index+1}`)}</h4><p>${esc(opp.recommendation||opp.problem||'')}</p><details><summary>Edit this client recommendation</summary><div class="field"><label>Title</label><input data-opp-title value="${esc(opp.title||'')}"><label>Problem</label><textarea data-opp-problem>${esc(opp.problem||'')}</textarea><label>Recommendation</label><textarea data-opp-recommendation>${esc(opp.recommendation||'')}</textarea><label>Reason</label><input data-opp-reason placeholder="Why are you changing this?"></div><div class="actions"><button class="btn secondary" type="button" data-opp-rewrite>Save rewrite</button><button class="btn secondary" type="button" data-opp-hide>Remove from client report</button></div></details></article>`).join('')}</div>
  <details style="margin-top:12px"><summary><b>Add founder recommendation</b></summary><div class="nx-report-editor-grid"><div class="field"><label>Title</label><input data-add-title placeholder="Recommendation title"><label>Problem</label><textarea data-add-problem placeholder="Problem or opportunity"></textarea></div><div class="field"><label>Recommendation</label><textarea data-add-recommendation placeholder="What should the client do?"></textarea><label>Reason</label><input data-add-reason placeholder="Why are you adding this?"></div></div><div class="actions"><button class="btn primary" type="button" data-add-save>Add to client report</button></div></details>
  <details style="margin-top:12px"><summary><b>Audit history (${rows.length})</b></summary><div class="nx-report-adjustments">${rows.length?rows.map(row=>`<div class="nx-report-adjustment"><div><b>${esc(adjustmentLabel(row))}</b>${row.target_key?`<div class="small">Target: ${esc(row.target_key)}</div>`:''}${row.reason?`<div class="small">Reason: ${esc(row.reason)}</div>`:''}<div class="small">${new Date(row.created_at).toLocaleString()}${row.revoked_at?' · Restored':''}</div></div>${row.revoked_at?'':`<button class="btn secondary" type="button" data-revoke="${esc(row.id)}">Restore original</button>`}</div>`).join(''):'<div class="small">No founder adjustments yet.</div>'}</div></details>
  <div data-nx-preview-host>${previewMarkup(report)}</div>`;
  bindEditor(host);
}

function bindEditor(host){
  host.querySelector('[data-nx-save-summary]')?.addEventListener('click',async()=>{
    const text=host.querySelector('[data-nx-summary]')?.value?.trim();
    if(!text)return toast?.('Executive summary cannot be empty.');
    try{await addAdjustment('replace_executive_summary',null,{text},host.querySelector('[data-nx-summary-reason]')?.value?.trim())}catch(e){toast?.(e.message||'Summary could not be saved.')}
  });
  host.querySelector('[data-nx-save-pilot]')?.addEventListener('click',async()=>{
    const title=host.querySelector('[data-nx-pilot-title]')?.value?.trim()||'';
    const summary=host.querySelector('[data-nx-pilot-summary]')?.value?.trim()||'';
    if(!title&&!summary)return toast?.('Add a first-move title or summary.');
    try{await addAdjustment('replace_first_move',null,{title,summary},host.querySelector('[data-nx-pilot-reason]')?.value?.trim())}catch(e){toast?.(e.message||'First move could not be saved.')}
  });
  host.querySelectorAll('.nx-report-opp').forEach(card=>{
    const key=card.dataset.oppKey;
    card.querySelector('[data-opp-rewrite]')?.addEventListener('click',async()=>{
      const payload={title:card.querySelector('[data-opp-title]')?.value?.trim()||'',problem:card.querySelector('[data-opp-problem]')?.value?.trim()||'',recommendation:card.querySelector('[data-opp-recommendation]')?.value?.trim()||''};
      try{await addAdjustment('rewrite_opportunity',key,payload,card.querySelector('[data-opp-reason]')?.value?.trim())}catch(e){toast?.(e.message||'Recommendation could not be rewritten.')}
    });
    card.querySelector('[data-opp-hide]')?.addEventListener('click',async()=>{
      if(!confirm('Remove this recommendation from the client-facing report? The original diagnosis will remain unchanged.'))return;
      try{await addAdjustment('hide_opportunity',key,{},card.querySelector('[data-opp-reason]')?.value?.trim()||'Removed during founder review')}catch(e){toast?.(e.message||'Recommendation could not be removed.')}
    });
  });
  host.querySelector('[data-add-save]')?.addEventListener('click',async()=>{
    const title=host.querySelector('[data-add-title]')?.value?.trim()||'';
    const recommendation=host.querySelector('[data-add-recommendation]')?.value?.trim()||'';
    if(!title||!recommendation)return toast?.('Founder recommendation needs a title and recommendation.');
    try{await addAdjustment('add_opportunity',null,{title,problem:host.querySelector('[data-add-problem]')?.value?.trim()||'',recommendation},host.querySelector('[data-add-reason]')?.value?.trim()||'Founder-added recommendation')}catch(e){toast?.(e.message||'Recommendation could not be added.')}
  });
  host.querySelectorAll('[data-revoke]').forEach(button=>button.addEventListener('click',async()=>{try{await revokeAdjustment(button.dataset.revoke)}catch(e){toast?.(e.message||'Adjustment could not be restored.')}}));
  host.querySelector('[data-nx-preview]')?.addEventListener('click',refreshEditor);
}

async function refreshEditor(){
  const host=document.querySelector('[data-nx-report-editor]');
  if(!host||!activeRunId)return;
  try{await renderEditor(host)}catch(e){console.error('Nexus diagnosis report editor failed',e);host.innerHTML=`<div class="note error">${esc(e.message||'Client report editor could not be loaded.')}</div>`}
}

function inferRunId(body){
  return body?.querySelector('[data-diagnosis-action][data-id],.diagnosis-retry-btn[data-id],[data-diagnosis-pdf-run]')?.dataset?.id||body?.querySelector('[data-diagnosis-pdf-run]')?.dataset?.diagnosisPdfRun||activeRunId;
}
function mount(){
  ensureStyles();
  const modal=document.getElementById('diagnosisReviewModal');
  const body=document.getElementById('diagnosisReviewBody');
  if(!modal?.classList.contains('open')||!body||!body.querySelector('.diagnosis-executive,.diagnosis-review-section'))return;
  const runId=inferRunId(body);if(!runId)return;activeRunId=runId;
  let host=body.querySelector('[data-nx-report-editor]');
  if(!host){host=document.createElement('section');host.className='nx-report-editor';host.dataset.nxReportEditor='1';const meta=body.querySelector('.diagnosis-review-meta');meta?.after(host);if(!meta)body.prepend(host)}
  if(!host.dataset.loadedFor||host.dataset.loadedFor!==runId){host.dataset.loadedFor=runId;host.innerHTML='<div class="small">Loading audited founder controls…</div>';refreshEditor()}
}
function scheduleMount(){if(mountQueued)return;mountQueued=true;requestAnimationFrame(()=>{mountQueued=false;mount()})}

document.addEventListener('click',event=>{const button=event.target.closest?.('.diagnosis-review-btn[data-id]');if(button?.dataset?.id)activeRunId=button.dataset.id},true);
const observer=new MutationObserver(scheduleMount);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:diagnosis-changed',scheduleMount);
scheduleMount();
window.NexusDiagnosisReportEditor=Object.freeze({refresh:refreshEditor});
