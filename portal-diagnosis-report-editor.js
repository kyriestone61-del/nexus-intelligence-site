const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
if(!state.admin)throw new Error('Diagnosis report editor is administrator-only.');

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let currentRunId=null;
let mountQueued=false;
let loading=false;
let preview=null;

function targetKey(opportunity,index){
  const rank=opportunity?.rank;
  return rank!=null&&String(rank).trim()!==''?`rank:${rank}`:String(opportunity?.title||`opportunity-${index+1}`);
}
function adjustmentLabel(row){
  return ({
    replace_executive_summary:'Executive summary changed',
    hide_opportunity:'Opportunity hidden',
    rewrite_opportunity:'Opportunity wording changed',
    add_opportunity:'Founder recommendation added',
    replace_first_move:'Recommended first move changed'
  })[row.adjustment_type]||'Client report adjusted';
}
function shortDate(value){try{return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch{return''}}

function ensureStyles(){
  if(document.getElementById('nexusDiagnosisReportEditorStyles'))return;
  const style=document.createElement('style');
  style.id='nexusDiagnosisReportEditorStyles';
  style.textContent=`
    .diagnosis-report-editor{margin:14px 0;padding:16px;border:1px solid rgba(217,255,114,.2);border-radius:14px;background:rgba(217,255,114,.035)}
    .diagnosis-report-editor>summary{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;cursor:pointer;list-style:none}
    .diagnosis-report-editor>summary::-webkit-details-marker{display:none}
    .diagnosis-report-editor>summary h3{margin:3px 0 4px;font-size:18px}.diagnosis-report-editor>summary p{margin:0;color:var(--muted,#aaa4ba);font-size:12px;line-height:1.45}
    .diagnosis-report-editor-badge{flex:0 0 auto;border:1px solid rgba(217,255,114,.25);border-radius:999px;padding:5px 8px;color:#d9ff72;font-size:10px;font-weight:900}
    .diagnosis-report-editor-body{display:grid;gap:12px;margin-top:14px}.diagnosis-report-editor-card{padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(9,8,15,.34)}
    .diagnosis-report-editor-card h4{margin:4px 0 9px;font-size:15px}.diagnosis-report-editor-card p{margin:0;color:var(--muted,#aaa4ba);font-size:12px;line-height:1.5}
    .diagnosis-report-editor label{display:block;margin:9px 0 5px;font-size:11px;font-weight:850}.diagnosis-report-editor textarea,.diagnosis-report-editor input{width:100%;box-sizing:border-box}
    .diagnosis-report-editor textarea{min-height:88px;resize:vertical}.diagnosis-report-editor .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .diagnosis-report-opportunity-list{display:grid;gap:9px}.diagnosis-report-opportunity{padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:11px}.diagnosis-report-opportunity-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.diagnosis-report-opportunity-head b{font-size:13px}.diagnosis-report-opportunity-head span{font-size:10px;color:#cfc5ff}.diagnosis-report-opportunity>p{margin-top:6px}
    .diagnosis-report-opportunity details{margin-top:9px}.diagnosis-report-opportunity details>summary{cursor:pointer;font-size:11px;font-weight:850;color:#d9ff72}
    .diagnosis-report-audit{display:grid;gap:7px}.diagnosis-report-audit-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px;border:1px solid rgba(255,255,255,.07);border-radius:10px}.diagnosis-report-audit-row div{display:grid;gap:2px}.diagnosis-report-audit-row small{color:var(--muted,#aaa4ba)}
    .diagnosis-report-editor-note{padding:10px 12px;border-radius:10px;background:rgba(156,124,255,.08);color:#d8d0ff;font-size:11px;line-height:1.5}
    @media(max-width:720px){.diagnosis-report-opportunity-head,.diagnosis-report-audit-row{display:grid}.diagnosis-report-editor .btn{width:100%}}
  `;
  document.head.appendChild(style);
}

async function loadPreview(){
  if(!currentRunId||loading)return;
  loading=true;
  try{
    const {data,error}=await sb.rpc('nexus_preview_diagnosis_client_report',{p_run_id:currentRunId});
    if(error)throw error;
    preview=data||null;
    renderPanel();
  }catch(error){
    console.error('Client report preview failed',error);
    const body=document.getElementById('diagnosisReviewBody');
    const panel=body?.querySelector('.diagnosis-report-editor');
    if(panel)panel.innerHTML='<summary><div><div class="kicker">Client report review</div><h3>Report controls unavailable</h3><p>The audited client-report layer could not be loaded.</p></div></summary>';
  }finally{loading=false}
}

function opportunitiesMarkup(report){
  const rows=Array.isArray(report?.opportunity_backlog)?report.opportunity_backlog:[];
  if(!rows.length)return '<p>No client-facing opportunities remain in the current preview.</p>';
  return `<div class="diagnosis-report-opportunity-list">${rows.map((item,index)=>{
    const key=targetKey(item,index);
    return `<article class="diagnosis-report-opportunity" data-opportunity-key="${esc(key)}"><div class="diagnosis-report-opportunity-head"><div><span>${item.rank!=null?`Rank ${esc(item.rank)}`:'Client recommendation'}</span><br><b>${esc(item.title||'Opportunity')}</b></div><button type="button" class="btn secondary" data-hide-opportunity="${esc(key)}">Hide from client</button></div>${item.problem?`<p><b>Problem:</b> ${esc(item.problem)}</p>`:''}${item.recommendation?`<p><b>Recommendation:</b> ${esc(item.recommendation)}</p>`:''}<details><summary>Edit client wording</summary><label>Title</label><input data-rewrite-title value="${esc(item.title||'')}"><label>Problem</label><textarea data-rewrite-problem>${esc(item.problem||'')}</textarea><label>Recommendation</label><textarea data-rewrite-recommendation>${esc(item.recommendation||'')}</textarea><div class="actions"><button type="button" class="btn primary" data-rewrite-opportunity="${esc(key)}">Save wording</button></div></details></article>`;
  }).join('')}</div>`;
}

function auditMarkup(rows){
  if(!Array.isArray(rows)||!rows.length)return '<p>No founder adjustments are active. The preview matches the AI-generated client projection.</p>';
  return `<div class="diagnosis-report-audit">${rows.map(row=>`<div class="diagnosis-report-audit-row"><div><b>${esc(adjustmentLabel(row))}</b><small>${row.target_key?`${esc(row.target_key)} · `:''}${esc(shortDate(row.created_at))}</small></div><button type="button" class="btn secondary" data-undo-adjustment="${esc(row.id)}">Undo</button></div>`).join('')}</div>`;
}

function renderPanel(){
  const body=document.getElementById('diagnosisReviewBody');
  if(!body||!preview)return;
  let panel=body.querySelector('.diagnosis-report-editor');
  if(!panel){
    panel=document.createElement('details');
    panel.className='diagnosis-report-editor diagnosis-generated';
    const actions=[...body.children].find(node=>node.matches?.('.diagnosis-review-actions'));
    if(actions)actions.before(panel);else body.appendChild(panel);
  }
  const report=preview.report||{};
  const first=report.smallest_safe_pilot||{};
  const adjustments=Array.isArray(preview.adjustments)?preview.adjustments:[];
  panel.innerHTML=`<summary><div><div class="kicker">Client report review</div><h3>Vet what the client will receive</h3><p>AI analysis stays immutable. Your edits are audited and affect only the client-facing report.</p></div><span class="diagnosis-report-editor-badge">${adjustments.length} active ${adjustments.length===1?'edit':'edits'}</span></summary><div class="diagnosis-report-editor-body">
    <div class="diagnosis-report-editor-note">Preview status: <b>${esc(preview.status||'review')}</b>. If a report was already released, save your edits and release it again to create the next client-visible version.</div>
    <section class="diagnosis-report-editor-card"><div class="kicker">Executive summary</div><h4>Client-facing summary</h4><textarea id="nexusClientReportSummary">${esc(report.executive_summary||'')}</textarea><div class="actions"><button type="button" class="btn primary" data-save-summary>Save summary</button></div></section>
    <section class="diagnosis-report-editor-card"><div class="kicker">Recommended first move</div><h4>What the client should do first</h4><label>Title</label><input id="nexusClientFirstMoveTitle" value="${esc(first.title||'')}"><label>Summary</label><textarea id="nexusClientFirstMoveSummary">${esc(first.summary||'')}</textarea><div class="actions"><button type="button" class="btn primary" data-save-first-move>Save first move</button></div></section>
    <section class="diagnosis-report-editor-card"><div class="kicker">Ranked opportunities</div><h4>Keep, rewrite, or remove individual recommendations</h4>${opportunitiesMarkup(report)}</section>
    <section class="diagnosis-report-editor-card"><div class="kicker">Founder recommendation</div><h4>Add a recommendation the AI missed</h4><label>Title</label><input id="nexusFounderOpportunityTitle" placeholder="Example: Proposal follow-up system"><label>Problem it solves</label><textarea id="nexusFounderOpportunityProblem" placeholder="What business problem makes this worth doing?"></textarea><label>Recommendation</label><textarea id="nexusFounderOpportunityRecommendation" placeholder="What should Nexus recommend to the client?"></textarea><div class="actions"><button type="button" class="btn primary" data-add-opportunity>Add recommendation</button></div></section>
    <section class="diagnosis-report-editor-card"><div class="kicker">Audit trail</div><h4>Active founder adjustments</h4>${auditMarkup(adjustments)}</section>
  </div>`;
  bindPanel(panel);
}

function setBusy(button,busy,label='Saving…'){
  if(!button)return()=>{};
  const original=button.textContent;
  button.disabled=busy;
  if(busy)button.textContent=label;
  return()=>{if(button.isConnected){button.disabled=false;button.textContent=original}};
}
async function addAdjustment(type,{target=null,payload={},reason='Founder client-report review'}={},button){
  const restore=setBusy(button,true);
  try{
    const {error}=await sb.rpc('nexus_add_diagnosis_report_adjustment',{p_run_id:currentRunId,p_adjustment_type:type,p_target_key:target,p_payload:payload,p_reason:reason});
    if(error)throw error;
    toast?.('Client report updated.');
    await loadPreview();
    window.dispatchEvent(new CustomEvent('nexus:diagnosis-report-adjusted',{detail:{runId:currentRunId,type}}));
  }catch(error){console.error('Diagnosis report adjustment failed',error);toast?.(error.message||'The client report could not be updated.')}finally{restore()}
}

function bindPanel(panel){
  if(panel.dataset.bound==='1')return;
  panel.dataset.bound='1';
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-save-summary]')){
      const value=panel.querySelector('#nexusClientReportSummary')?.value?.trim();if(!value){toast?.('Enter a client-facing summary first.');return}
      await addAdjustment('replace_executive_summary',{payload:{text:value}},button);return;
    }
    if(button.matches('[data-save-first-move]')){
      const title=panel.querySelector('#nexusClientFirstMoveTitle')?.value?.trim()||'';
      const summary=panel.querySelector('#nexusClientFirstMoveSummary')?.value?.trim()||'';
      if(!title&&!summary){toast?.('Enter a first-move title or summary.');return}
      await addAdjustment('replace_first_move',{payload:{title,summary}},button);return;
    }
    if(button.matches('[data-hide-opportunity]')){
      if(!window.confirm('Hide this recommendation from the client report? The AI diagnosis will remain unchanged and you can undo this later.'))return;
      await addAdjustment('hide_opportunity',{target:button.dataset.hideOpportunity},button);return;
    }
    if(button.matches('[data-rewrite-opportunity]')){
      const card=button.closest('.diagnosis-report-opportunity');
      const title=card?.querySelector('[data-rewrite-title]')?.value?.trim()||'';
      const problem=card?.querySelector('[data-rewrite-problem]')?.value?.trim()||'';
      const recommendation=card?.querySelector('[data-rewrite-recommendation]')?.value?.trim()||'';
      if(!recommendation){toast?.('Enter the recommendation wording first.');return}
      await addAdjustment('rewrite_opportunity',{target:button.dataset.rewriteOpportunity,payload:{title,problem,recommendation}},button);return;
    }
    if(button.matches('[data-add-opportunity]')){
      const title=panel.querySelector('#nexusFounderOpportunityTitle')?.value?.trim()||'';
      const problem=panel.querySelector('#nexusFounderOpportunityProblem')?.value?.trim()||'';
      const recommendation=panel.querySelector('#nexusFounderOpportunityRecommendation')?.value?.trim()||'';
      if(!title||!recommendation){toast?.('Add a title and recommendation first.');return}
      await addAdjustment('add_opportunity',{payload:{title,problem,recommendation}},button);return;
    }
    if(button.matches('[data-undo-adjustment]')){
      const restore=setBusy(button,true,'Undoing…');
      try{
        const {error}=await sb.rpc('nexus_revoke_diagnosis_report_adjustment',{p_adjustment_id:button.dataset.undoAdjustment});
        if(error)throw error;
        toast?.('Founder adjustment undone.');
        await loadPreview();
        window.dispatchEvent(new CustomEvent('nexus:diagnosis-report-adjusted',{detail:{runId:currentRunId,type:'undo'}}));
      }catch(error){console.error('Diagnosis report adjustment undo failed',error);toast?.(error.message||'The adjustment could not be undone.')}finally{restore()}
    }
  });
}

function detectRunId(body){
  const tagged=body?.querySelector('[data-diagnosis-action][data-id],.diagnosis-retry-btn[data-id],[data-manual-result]');
  return tagged?.dataset?.id||tagged?.dataset?.diagnosisAction||tagged?.dataset?.manualResult||currentRunId||null;
}
function mount(){
  const modal=document.getElementById('diagnosisReviewModal');
  const body=document.getElementById('diagnosisReviewBody');
  if(!modal?.classList.contains('open')||!body||!body.querySelector('.diagnosis-executive,.diagnosis-review-section .diagnosis-review-item'))return;
  const id=detectRunId(body);if(!id)return;
  if(currentRunId!==id){currentRunId=id;preview=null}
  if(!body.querySelector('.diagnosis-report-editor')&&!loading)loadPreview();
}
function scheduleMount(){if(mountQueued)return;mountQueued=true;requestAnimationFrame(()=>{mountQueued=false;mount()})}

document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('.diagnosis-review-btn[data-id],.diagnosis-retry-btn[data-id],[data-diagnosis-action][data-id]');
  if(trigger?.dataset?.id){currentRunId=trigger.dataset.id;preview=null;setTimeout(scheduleMount,80)}
},true);
const observer=new MutationObserver(scheduleMount);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:diagnosis-changed',event=>{if(event.detail?.runId)currentRunId=event.detail.runId;preview=null;setTimeout(scheduleMount,100)});
ensureStyles();scheduleMount();

window.NexusDiagnosisReportEditor=Object.freeze({refresh:async()=>{preview=null;await loadPreview()}});
