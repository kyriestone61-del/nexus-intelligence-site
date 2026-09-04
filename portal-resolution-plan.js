const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable for Resolution Plan.');
const {sb,state,toast,workspace,runtime}=portal;
if(!state?.admin)throw new Error('Resolution Plan is admin-only.');

const boundary=runtime?.boundary;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
let activeRunId=null;
let currentPlan=null;
let pendingRun=null;
let pendingRefresh=null;
let journeyTimer=null;

function ensureStyles(){
  if(document.getElementById('nexusResolutionPlanStyles'))return;
  const style=document.createElement('style');
  style.id='nexusResolutionPlanStyles';
  style.textContent=`
    #nexusResolutionPlanModal{z-index:2147483000}
    #nexusResolutionPlanModal .resolution-plan-card{width:min(1080px,calc(100vw - 28px));max-height:min(90vh,920px);overflow:auto}
    .resolution-plan-intro{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin:0 0 18px;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.025)}
    .resolution-plan-intro h3{margin:2px 0 6px;font-size:18px}.resolution-plan-intro p{margin:0;color:var(--muted,#aaa4ba);line-height:1.55}
    .resolution-plan-count{min-width:110px;text-align:center;padding:10px 12px;border-radius:12px;background:rgba(217,255,114,.08);border:1px solid rgba(217,255,114,.18)}
    .resolution-plan-count b{display:block;font-size:24px}.resolution-plan-count span{font-size:11px;color:var(--muted,#aaa4ba)}
    .resolution-proposal-list{display:grid;gap:14px}.resolution-proposal{padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.018)}
    .resolution-proposal.selected{border-color:rgba(217,255,114,.42);background:rgba(217,255,114,.045)}.resolution-proposal.rejected{opacity:.68}
    .resolution-proposal-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.resolution-proposal h3{margin:3px 0 5px;font-size:18px}.resolution-proposal p{margin:5px 0;color:var(--muted,#aaa4ba);line-height:1.5}
    .resolution-proposal-status{white-space:nowrap;padding:5px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:11px;text-transform:capitalize}.resolution-proposal.selected .resolution-proposal-status{color:#d9ff72;border-color:rgba(217,255,114,.32)}
    .resolution-steps{display:grid;gap:8px;margin-top:14px}.resolution-step{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:start;padding:10px 11px;border-radius:10px;background:rgba(255,255,255,.035)}
    .resolution-step-index{width:25px;height:25px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.08);font-size:11px;font-weight:800}.resolution-step b{display:block;font-size:13px}.resolution-step small{display:block;margin-top:3px;color:var(--muted,#aaa4ba);line-height:1.4}.resolution-step-owner{font-size:10px;padding:4px 7px;border-radius:999px;background:rgba(156,124,255,.1);border:1px solid rgba(156,124,255,.2)}
    .resolution-proposal-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.resolution-plan-footer{position:sticky;bottom:-1px;display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:18px;padding:14px 0 2px;background:linear-gradient(transparent 0,#15131f 24%)}
    .resolution-plan-feedback{margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);font-size:12px}.resolution-plan-feedback.error{color:#ffd5da;border-color:rgba(255,139,154,.35);background:rgba(255,139,154,.07)}
    .resolution-journey-card{margin:12px 0 18px;padding:16px;border:1px solid rgba(217,255,114,.25);border-radius:14px;background:rgba(217,255,114,.045);display:flex;justify-content:space-between;gap:18px;align-items:center}.resolution-journey-card h3{margin:2px 0 5px}.resolution-journey-card p{margin:0;color:var(--muted,#aaa4ba)}
    .resolution-review-cta{margin-top:14px;padding:14px;border:1px solid rgba(217,255,114,.2);border-radius:12px;background:rgba(217,255,114,.04)}
    @media(max-width:760px){.resolution-plan-intro,.resolution-proposal-head,.resolution-plan-footer,.resolution-journey-card{display:block}.resolution-plan-count{margin-top:12px}.resolution-step{grid-template-columns:26px 1fr}.resolution-step-owner{grid-column:2;justify-self:start}.resolution-plan-footer .actions,.resolution-journey-card .actions{margin-top:12px}.resolution-plan-card{padding:16px!important}}
  `;
  document.head.appendChild(style);
}

function ensureModal(){
  ensureStyles();
  let modal=document.getElementById('nexusResolutionPlanModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='nexusResolutionPlanModal';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-hidden','true');
  modal.innerHTML='<div class="modal-card resolution-plan-card"><div class="toolbar"><div><div class="eyebrow">Nexus · governed action plan</div><h2 style="margin:5px 0">Choose what becomes real work</h2></div><button class="btn secondary" data-resolution-close type="button">Close</button></div><div id="nexusResolutionPlanBody"></div></div>';
  document.body.appendChild(modal);
  modal.querySelector('[data-resolution-close]').onclick=close;
  modal.onclick=event=>{if(event.target===modal)close()};
  return modal;
}
function close(){const modal=document.getElementById('nexusResolutionPlanModal');modal?.classList.remove('open','show');modal?.setAttribute('aria-hidden','true');activeRunId=null;currentPlan=null}
function setFeedback(message,type=''){const body=document.getElementById('nexusResolutionPlanBody');if(!body)return;let node=body.querySelector('.resolution-plan-feedback');if(!node){node=document.createElement('div');node.className='resolution-plan-feedback';body.appendChild(node)}node.className=`resolution-plan-feedback${type?' '+type:''}`;node.textContent=message}

function stepMarkup(step,index){
  const owner=String(step.assignee||'nexus').toLowerCase()==='client'?'Client':'Nexus';
  return `<div class="resolution-step"><span class="resolution-step-index">${index+1}</span><div><b>${esc(step.title||step.template_code||'Action')}</b><small>${esc(step.description||`${label(step.task_type||'action')} · ${label(step.phase||'general')}`)}</small></div><span class="resolution-step-owner">${owner}</span></div>`;
}
function proposalMarkup(p){
  const status=String(p.status||'proposed');
  const selected=status==='selected'||status==='confirmed';
  return `<article class="resolution-proposal ${esc(status)} ${selected?'selected':''}" data-resolution-proposal="${esc(p.id)}"><div class="resolution-proposal-head"><div><div class="kicker">Recommended resolution ${esc(p.opportunity_index||'')}</div><h3>${esc(p.title||'Recommended action')}</h3><p>${esc(p.problem||p.recommendation||'')}</p>${p.recommendation&&p.recommendation!==p.problem?`<p><b>Diagnosis recommendation:</b> ${esc(p.recommendation)}</p>`:''}</div><span class="resolution-proposal-status">${esc(label(status))}</span></div><div class="resolution-steps">${(p.steps||[]).map(stepMarkup).join('')}</div>${status==='confirmed'?'<div class="resolution-proposal-actions"><span class="small">Confirmed. Its action chain is now in the workspace.</span></div>':`<div class="resolution-proposal-actions">${status!=='selected'?'<button class="btn primary" data-resolution-status="selected" type="button">Select this resolution</button>':'<button class="btn secondary" data-resolution-status="proposed" type="button">Remove selection</button>'}<button class="btn secondary" data-resolution-status="deferred" type="button">Defer</button><button class="btn secondary" data-resolution-status="rejected" type="button">Do not proceed</button></div>`}</article>`;
}
function render(plan){
  currentPlan=plan;
  const body=document.getElementById('nexusResolutionPlanBody');if(!body)return;
  const confirmed=plan.plan_status==='confirmed';
  body.innerHTML=`<div class="resolution-plan-intro"><div><h3>${confirmed?'Confirmed execution plan':'AI recommendations are proposals until you choose them.'}</h3><p>${confirmed?'The selected resolutions have been converted into governed action chains with owners, dependencies, evidence requirements, and completion criteria.':'Review the recommendation and every downstream step. Select only the resolutions you want Nexus to execute. Nothing is assigned to the client or Nexus until you confirm the selected plan.'}</p></div><div class="resolution-plan-count"><b>${esc(plan.selected_count||0)}</b><span>${confirmed?'selected':'selected to proceed'}</span></div></div><div class="resolution-proposal-list">${(plan.proposals||[]).length?(plan.proposals||[]).map(proposalMarkup).join(''):'<div class="empty">No resolution proposals were produced. Do not proceed until the diagnosis is corrected.</div>'}</div><div class="resolution-plan-footer"><span class="small">${confirmed?'Plan confirmed.':'You remain the final approval gate.'}</span><div class="actions">${confirmed?'<button class="btn primary" data-resolution-open-actions type="button">Open Action Items →</button>':`<button class="btn primary" data-resolution-confirm type="button" ${plan.can_confirm?'':'disabled'}>Confirm ${Number(plan.selected_count||0)} selected ${Number(plan.selected_count||0)===1?'resolution':'resolutions'} →</button>`}</div></div>`;
  bind(body);
}
function bind(body){
  body.querySelectorAll('[data-resolution-proposal]').forEach(card=>{
    const id=card.dataset.resolutionProposal;
    card.querySelectorAll('[data-resolution-status]').forEach(button=>button.onclick=()=>runBoundary('change resolution selection',()=>setSelection(id,button.dataset.resolutionStatus,button)));
  });
  body.querySelector('[data-resolution-confirm]')?.addEventListener('click',event=>runBoundary('confirm resolution plan',()=>confirmPlan(event.currentTarget)));
  body.querySelector('[data-resolution-open-actions]')?.addEventListener('click',()=>{close();document.querySelector('.side-nav button[data-section="tasks"]')?.click()});
}
function runBoundary(name,fn){return boundary?.run?boundary.run(name,fn):fn()}

async function load(runId){
  const {data,error}=await sb.rpc('nexus_get_resolution_plan',{p_run_id:runId});if(error)throw error;return data;
}
async function open(runId){
  if(!runId)throw new Error('Diagnosis run is required.');
  activeRunId=runId;const modal=ensureModal(),body=modal.querySelector('#nexusResolutionPlanBody');modal.classList.add('open','show');modal.setAttribute('aria-hidden','false');body.innerHTML='<div class="empty">Loading recommended action plan…</div>';
  try{render(await load(runId))}catch(error){body.innerHTML=`<div class="resolution-plan-feedback error"><b>Recommended plan could not load.</b><br>${esc(error.message||'Try again.')}</div>`;throw error}
}
async function setSelection(id,status,button){
  button.disabled=true;
  try{const {data,error}=await sb.rpc('nexus_set_resolution_selection',{p_proposal_id:id,p_status:status,p_overrides:{}});if(error)throw error;render(data);toast?.(status==='selected'?'Resolution selected.':'Resolution selection updated.')}
  catch(error){setFeedback(error.message||'Selection could not be saved.','error');throw error}
  finally{if(button?.isConnected)button.disabled=false}
}
async function confirmPlan(button){
  if(!activeRunId)return;
  button.disabled=true;const original=button.textContent;button.textContent='Confirming plan…';
  try{
    const {data,error}=await sb.rpc('nexus_confirm_resolution_plan',{p_run_id:activeRunId});if(error)throw error;
    toast?.(`Plan confirmed. ${Number(data?.tasks||0)} action item${Number(data?.tasks||0)===1?'':'s'} created and routed.`);
    await workspace?.();window.NexusDiagnosisController?.invalidateLatest?.();window.dispatchEvent(new CustomEvent('nexus:resolution-plan-confirmed',{detail:{runId:activeRunId,summary:data||null}}));window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed',{detail:{runId:activeRunId,action:'plan_confirmed',summary:data||null}}));
    render(await load(activeRunId));pendingRun=null;scheduleJourneyRefresh(true);
  }catch(error){setFeedback(error.message||'Selected plan could not be confirmed.','error');button.textContent=original;button.disabled=false;throw error}
}

async function refreshPending(){
  if(!state.companyId)return pendingRun=null;
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,approved_at,orchestrated_at').eq('company_id',state.companyId).eq('status','approved').is('orchestrated_at',null).order('approved_at',{ascending:false}).limit(1).maybeSingle();
  if(error){console.error('Resolution plan pending-state load failed',error);return pendingRun}
  pendingRun=data||null;return pendingRun;
}
function decorateJourney(){
  const root=document.getElementById('adminJourneyRoot');if(!root)return;
  root.querySelector('.resolution-journey-card')?.remove();
  if(!pendingRun)return;
  const focus=root.querySelector('.journey-focus');if(!focus)return;
  const card=document.createElement('section');card.className='resolution-journey-card';card.innerHTML='<div><div class="kicker">Diagnosis approved · action selection required</div><h3>Choose which recommendations become work.</h3><p>The diagnosis is approved, but no downstream action chain has been released yet. Review and confirm the recommended resolution plan first.</p></div><div class="actions"><button class="btn primary" type="button">Review Recommended Actions →</button></div>';focus.after(card);card.querySelector('button').onclick=()=>runBoundary('open recommended actions',()=>open(pendingRun.id));
  const kicker=focus.querySelector('.kicker')?.textContent||'';
  if(/Step\s*3\s*of\s*6/i.test(kicker)){
    const primary=focus.querySelector('#journeyPrimaryAction,[data-primary-action],button.btn.primary');if(primary){primary.textContent='Review Recommended Actions →';primary.dataset.resolutionPlanRequired='1'}
  }
}
async function scheduleJourneyRefresh(force=false){
  clearTimeout(journeyTimer);journeyTimer=setTimeout(async()=>{if(force||!pendingRefresh){pendingRefresh=refreshPending().finally(()=>pendingRefresh=null)}await pendingRefresh;decorateJourney();decorateApprovedReview()},force?0:120);
}
function decorateApprovedReview(){
  const modal=document.getElementById('diagnosisReviewModal');if(!modal?.classList.contains('open')||!pendingRun)return;
  const body=modal.querySelector('#diagnosisReviewBody');if(!body||body.querySelector('.resolution-review-cta'))return;
  const meta=body.querySelector('.diagnosis-review-meta');if(!meta||!/approved/i.test(meta.textContent||''))return;
  const cta=document.createElement('div');cta.className='resolution-review-cta';cta.innerHTML='<div class="kicker">Next required step</div><h3 style="margin:4px 0 6px">Review recommended actions</h3><p class="small">Approval locked the diagnosis. Now choose which recommendations become real client or Nexus work.</p><button class="btn primary" type="button">Review Recommended Actions →</button>';body.appendChild(cta);cta.querySelector('button').onclick=()=>runBoundary('open recommended actions',()=>open(pendingRun.id));
}

document.addEventListener('click',event=>{
  const primary=event.target.closest?.('[data-resolution-plan-required="1"]');if(primary&&pendingRun){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();runBoundary('open recommended actions',()=>open(pendingRun.id));return}
},true);
window.addEventListener('nexus:diagnosis-changed',event=>{const detail=event.detail||{};scheduleJourneyRefresh(true);if(detail.action==='approved'&&detail.runId)setTimeout(()=>runBoundary('open recommended actions',()=>open(detail.runId)).catch(error=>toast?.(error.message||'Recommended actions could not be opened.')),120)});
window.addEventListener('nexus:workspace-ready',()=>scheduleJourneyRefresh(true));
const observer=new MutationObserver(()=>scheduleJourneyRefresh());observer.observe(document.body,{childList:true,subtree:true});
for(const ms of [0,250,850])setTimeout(()=>scheduleJourneyRefresh(true),ms);

const service=Object.freeze({open,close,load,setSelection,confirmPlan,refreshPending});
portal.services=portal.services||{};portal.services.resolutionPlan=service;
window.NexusResolutionPlan=service;
