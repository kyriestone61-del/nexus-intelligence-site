const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable for the delivery plan.');
const {sb,state,toast,workspace,runtime}=portal;
if(!state?.admin)throw new Error('Delivery plan is admin-only.');

const boundary=runtime?.boundary;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let activeRunId=null;
let pendingRun=null;
let pendingRefresh=null;
let journeyTimer=null;

function ensureStyles(){
  if(document.getElementById('nexusResolutionPlanStyles'))return;
  const style=document.createElement('style');
  style.id='nexusResolutionPlanStyles';
  style.textContent=`
    #nexusResolutionPlanModal{z-index:2147483000}
    #nexusResolutionPlanModal .resolution-plan-card{width:min(860px,calc(100vw - 28px));max-height:min(90vh,880px);overflow:auto}
    .simple-plan-summary{padding:18px;border:1px solid rgba(217,255,114,.26);border-radius:16px;background:rgba(217,255,114,.045)}
    .simple-plan-summary h3{margin:5px 0 8px;font-size:22px}.simple-plan-summary p{margin:0;color:var(--muted,#aaa4ba);line-height:1.55}
    .simple-plan-flow{display:grid;gap:9px;margin-top:16px}.simple-plan-step{display:grid;grid-template-columns:34px 1fr;gap:11px;align-items:start;padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.02)}
    .simple-plan-step span{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(217,255,114,.09);color:#d9ff72;font-weight:800}.simple-plan-step b{display:block;margin:2px 0 3px}.simple-plan-step small{display:block;color:var(--muted,#aaa4ba);line-height:1.4}
    .simple-plan-note{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.025);color:var(--muted,#aaa4ba);font-size:12px;line-height:1.5}
    .simple-plan-footer{position:sticky;bottom:-1px;display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:16px;padding:14px 0 2px;background:linear-gradient(transparent 0,#15131f 24%)}
    .resolution-plan-feedback{margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);font-size:12px}.resolution-plan-feedback.error{color:#ffd5da;border-color:rgba(255,139,154,.35);background:rgba(255,139,154,.07)}
    .resolution-journey-card{margin:12px 0 18px;padding:16px;border:1px solid rgba(217,255,114,.25);border-radius:14px;background:rgba(217,255,114,.045);display:flex;justify-content:space-between;gap:18px;align-items:center}.resolution-journey-card h3{margin:2px 0 5px}.resolution-journey-card p{margin:0;color:var(--muted,#aaa4ba)}
    .resolution-review-cta{margin-top:14px;padding:14px;border:1px solid rgba(217,255,114,.2);border-radius:12px;background:rgba(217,255,114,.04)}
    @media(max-width:700px){.simple-plan-footer,.resolution-journey-card{display:block}.simple-plan-footer .actions,.resolution-journey-card .actions{margin-top:12px}.resolution-plan-card{padding:16px!important}}
  `;
  document.head.appendChild(style);
}
function ensureModal(){
  ensureStyles();
  let modal=document.getElementById('nexusResolutionPlanModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='nexusResolutionPlanModal';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-hidden','true');
  modal.innerHTML='<div class="modal-card resolution-plan-card"><div class="toolbar"><div><div class="eyebrow">Relystra · diagnosis plan</div><h2 style="margin:5px 0">One plan. Four steps.</h2></div><button class="btn secondary" data-resolution-close type="button">Close</button></div><div id="nexusResolutionPlanBody"></div></div>';
  document.body.appendChild(modal);modal.querySelector('[data-resolution-close]').onclick=close;modal.onclick=event=>{if(event.target===modal)close()};return modal;
}
function close(){const modal=document.getElementById('nexusResolutionPlanModal');modal?.classList.remove('open','show');modal?.setAttribute('aria-hidden','true');activeRunId=null}
function setFeedback(message,type=''){const body=document.getElementById('nexusResolutionPlanBody');if(!body)return;let node=body.querySelector('.resolution-plan-feedback');if(!node){node=document.createElement('div');body.appendChild(node)}node.className=`resolution-plan-feedback${type?' '+type:''}`;node.textContent=message}
function runBoundary(name,fn){return boundary?.run?boundary.run(name,fn):fn()}
function stepMarkup(step,index){return `<div class="simple-plan-step"><span>${index+1}</span><div><b>${esc(step.title||'Next step')}</b><small>${esc(step.description||'Complete this step, then move to the next one.')}</small></div></div>`}
function render(plan){
  const body=document.getElementById('nexusResolutionPlanBody');if(!body)return;
  const proposal=(plan.proposals||[])[0]||null;
  const confirmed=plan.plan_status==='confirmed'||plan.plan_status==='commercial_gate';
  if(!proposal){body.innerHTML='<div class="resolution-plan-feedback error">No diagnosis-led plan is available. Review the diagnosis before continuing.</div>';return}
  body.innerHTML=`<section class="simple-plan-summary"><div class="kicker">Recommended from the diagnosis</div><h3>${esc(proposal.title||'Recommended Relystra plan')}</h3><p>${esc(proposal.recommendation||proposal.problem||'Relystra will use the diagnosis to drive one ordered delivery workflow.')}</p><div class="simple-plan-flow">${(proposal.steps||[]).map(stepMarkup).join('')}</div></section><div class="simple-plan-note">${confirmed?'Plan confirmed. Delivery remains paused until the commercial close and kickoff gates are satisfied.':'Confirming this plan creates one ordered workflow. No parallel solution queues or duplicate action chains will be created.'}</div><div class="simple-plan-footer"><span class="small">${confirmed?'Next: finish commercial close, then work the four steps in order.':'This is the single recommended workflow from the diagnosis.'}</span><div class="actions">${confirmed?'<button class="btn primary" data-resolution-open-actions type="button">Open Work →</button>':`<button class="btn primary" data-resolution-confirm type="button" ${plan.can_confirm?'':'disabled'}>Use this plan →</button>`}</div></div>`;
  body.querySelector('[data-resolution-confirm]')?.addEventListener('click',event=>runBoundary('confirm diagnosis plan',()=>confirmPlan(event.currentTarget)));
  body.querySelector('[data-resolution-open-actions]')?.addEventListener('click',()=>{close();document.querySelector('.side-nav button[data-section="tasks"]')?.click()||document.querySelector('.side-nav button[data-section="journey"]')?.click()});
}
async function load(runId){const {data,error}=await sb.rpc('nexus_get_resolution_plan',{p_run_id:runId});if(error)throw error;return data}
async function open(runId){
  if(!runId)throw new Error('Diagnosis run is required.');
  const review=document.getElementById('diagnosisReviewModal');review?.classList.remove('open','show');review?.setAttribute('aria-hidden','true');document.body.classList.remove('diagnosis-review-open');
  activeRunId=runId;const modal=ensureModal(),body=modal.querySelector('#nexusResolutionPlanBody');modal.classList.add('open','show');modal.setAttribute('aria-hidden','false');body.innerHTML='<div class="empty">Loading the diagnosis plan…</div>';
  try{render(await load(runId))}catch(error){body.innerHTML=`<div class="resolution-plan-feedback error"><b>Plan could not load.</b><br>${esc(error.message||'Try again.')}</div>`;throw error}
}
async function setSelection(id,status,button){
  if(button)button.disabled=true;
  try{const {data,error}=await sb.rpc('nexus_set_resolution_selection',{p_proposal_id:id,p_status:status,p_overrides:{}});if(error)throw error;render(data);return data}
  finally{if(button?.isConnected)button.disabled=false}
}
async function confirmPlan(button){
  if(!activeRunId)return;
  button.disabled=true;const original=button.textContent;button.textContent='Confirming plan…';
  try{
    const {data,error}=await sb.rpc('nexus_phase_zero_confirm_resolution_plan',{p_run_id:activeRunId});if(error)throw error;
    toast?.('Plan confirmed. One four-step delivery workflow is ready after commercial close.');
    await workspace?.();window.NexusDiagnosisController?.invalidateLatest?.();window.dispatchEvent(new CustomEvent('nexus:resolution-plan-confirmed',{detail:{runId:activeRunId,summary:data||null}}));window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed',{detail:{runId:activeRunId,action:'plan_confirmed',summary:data||null}}));
    render({...await load(activeRunId),plan_status:'commercial_gate'});pendingRun=null;scheduleJourneyRefresh(true);window.RelystrPhaseZeroLifecycle?.refresh?.({reloadWorkspace:true});
  }catch(error){setFeedback(error.message||'Plan could not be confirmed.','error');button.textContent=original;button.disabled=false;throw error}
}
async function refreshPending(){
  if(!state.companyId)return pendingRun=null;
  const {data,error}=await sb.from('nexus_diagnosis_runs').select('id,status,approved_at,orchestrated_at').eq('company_id',state.companyId).eq('status','approved').is('orchestrated_at',null).order('approved_at',{ascending:false}).limit(1).maybeSingle();
  if(error){console.error('Diagnosis plan pending-state load failed',error);return pendingRun}pendingRun=data||null;return pendingRun;
}
function decorateJourney(){
  const root=document.getElementById('adminJourneyRoot');if(!root)return;root.querySelector('.resolution-journey-card')?.remove();if(!pendingRun)return;
  const focus=root.querySelector('.journey-focus');if(!focus)return;
  const card=document.createElement('section');card.className='resolution-journey-card';card.innerHTML='<div><div class="kicker">Diagnosis approved</div><h3>Review the recommended plan.</h3><p>Relystra has reduced the diagnosis to one plan and one ordered delivery workflow.</p></div><div class="actions"><button class="btn primary" type="button">Review Plan →</button></div>';focus.after(card);card.querySelector('button').onclick=()=>runBoundary('open diagnosis plan',()=>open(pendingRun.id));
}
function decorateApprovedReview(){
  const modal=document.getElementById('diagnosisReviewModal');if(!modal?.classList.contains('open')||!pendingRun)return;const body=modal.querySelector('#diagnosisReviewBody');if(!body||body.querySelector('.resolution-review-cta'))return;
  const meta=body.querySelector('.diagnosis-review-meta');if(!meta||!/approved/i.test(meta.textContent||''))return;
  const cta=document.createElement('div');cta.className='resolution-review-cta';cta.innerHTML='<div class="kicker">Next step</div><h3 style="margin:4px 0 6px">Review the plan</h3><p class="small">The diagnosis is approved. Review the one recommended workflow before commercial close.</p><button class="btn primary" type="button">Review Plan →</button>';body.appendChild(cta);cta.querySelector('button').onclick=()=>runBoundary('open diagnosis plan',()=>open(pendingRun.id));
}
async function scheduleJourneyRefresh(force=false){clearTimeout(journeyTimer);journeyTimer=setTimeout(async()=>{if(force||!pendingRefresh)pendingRefresh=refreshPending().finally(()=>pendingRefresh=null);await pendingRefresh;decorateJourney();decorateApprovedReview()},force?0:120)}
window.addEventListener('nexus:diagnosis-changed',event=>{const detail=event.detail||{};scheduleJourneyRefresh(true);if(detail.action==='approved'&&detail.runId)setTimeout(()=>runBoundary('open diagnosis plan',()=>open(detail.runId)).catch(error=>toast?.(error.message||'Plan could not be opened.')),120)});
window.addEventListener('nexus:workspace-ready',()=>scheduleJourneyRefresh(true));
const observer=new MutationObserver(()=>scheduleJourneyRefresh());observer.observe(document.body,{childList:true,subtree:true});
for(const ms of [0,250,850])setTimeout(()=>scheduleJourneyRefresh(true),ms);

const service=Object.freeze({open,close,load,setSelection,confirmPlan,refreshPending});
portal.services=portal.services||{};portal.services.resolutionPlan=service;window.NexusResolutionPlan=service;