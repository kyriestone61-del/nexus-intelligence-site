const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable for Phase Zero lifecycle.');
const {sb,state,toast,workspace,runtime}=portal;
const events=runtime?.events;
const boundary=runtime?.boundary;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const terminal=new Set(['complete','completed','cancelled','canceled','closed','archived']);
const STAGES=[
  ['discovery','Understand'],['diagnosis','Diagnose'],['commercial','Agree & Pay'],['onboarding','Kickoff'],
  ['implementation','Build'],['verification','Verify'],['measurement','Measure'],['acceptance','Accept'],['complete','Complete']
];
const STAGE_INDEX=new Map(STAGES.map((x,i)=>[x[0],i]));
const ADMIN_GATES={
  commercial:['scope_signed','payment_confirmed'],
  onboarding:['onboarding_complete'],
  implementation:['implementation_complete'],
  verification:['qa_passed'],
  measurement:['measurement_complete'],
  acceptance:['handoff_complete']
};
const EVIDENCE_REQUIRED=new Set(['scope_signed','payment_confirmed','qa_passed']);
let current=null,activeProjectId=null,refreshPromise=null,renderTimer=null,observer=null;

function activeProject(){
  const projects=Array.isArray(state.projects)?state.projects:[];
  const pointer=state.activeEngagement?.project_id||state.activeProjectId||null;
  if(pointer){const hit=projects.find(p=>p.id===pointer);if(hit)return hit}
  return projects.find(p=>!terminal.has(String(p.status||'').toLowerCase()))||projects[0]||null;
}
function labelStage(code){return STAGES.find(x=>x[0]===code)?.[1]||String(code||'').replaceAll('_',' ')}
function gateMap(){return new Map((current?.gates||[]).map(g=>[g.gate_code,g]))}
function runBoundary(name,fn){return boundary?.run?boundary.run(name,fn):fn()}

async function loadStatus(){
  const project=activeProject();
  if(!project){current=null;activeProjectId=null;return null}
  activeProjectId=project.id;
  const {data,error}=await sb.rpc('nexus_get_phase_zero_status',{p_project_id:project.id});
  if(error)throw error;
  current=data||null;
  return current;
}
async function refresh({reloadWorkspace=false}={}){
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    try{
      if(reloadWorkspace&&workspace)await workspace();
      await loadStatus();
      render();
      return current;
    }catch(error){
      console.error('Relystra Phase Zero lifecycle refresh failed',error);
      renderError(error);
      return null;
    }finally{refreshPromise=null}
  })();
  return refreshPromise;
}

function stageMarkup(){
  const index=STAGE_INDEX.get(current?.current_stage)??0;
  return STAGES.map(([code,label],i)=>`<div class="relystra-p0-stage ${i<index?'done':i===index?'current':'upcoming'}"><b>${esc(label)}</b><span>${i<index?'Done':i===index?'Now':'Next'}</span></div>`).join('');
}
function gateMarkup(){
  const gates=current?.gates||[];
  return gates.map(g=>`<div class="relystra-p0-gate ${esc(g.status||'pending')}"><div class="relystra-p0-gate-top"><b>${esc(g.label||g.gate_code)}</b><span class="relystra-p0-gate-status">${esc(g.status||'pending')}</span></div>${g.evidence_ref?`<small>Evidence: ${esc(g.evidence_ref)}</small>`:g.note?`<small>${esc(g.note)}</small>`:''}</div>`).join('');
}
function baseCard({admin=false}={}){
  const stage=current?.current_stage||'discovery';
  return `<section class="relystra-p0-card" data-phase-zero-project="${esc(current?.project_id||'')}"><div class="relystra-p0-head"><div><div class="kicker">${admin?'Phase Zero lifecycle control':'Engagement progress'}</div><h2>${admin?'Point A → Point B delivery control':'From diagnosis to a measured, accepted result'}</h2><p>${admin?'A stage advances only when its evidence gate passes. This keeps scope, payment, implementation, QA, measurement, and client acceptance distinct.':'Relystra does not treat work as complete just because implementation finished. The result is verified, measured, handed off, and accepted before closeout.'}</p></div><span class="relystra-p0-current">${esc(labelStage(stage))}</span></div><div class="relystra-p0-stages" aria-label="Engagement stages">${stageMarkup()}</div><div class="relystra-p0-next"><strong>Next required</strong><span>${esc(current?.next_required||'Review the engagement lifecycle.')}</span></div></section>`;
}

function renderClient(){
  const root=document.getElementById('nexus-client-today');if(!root||!current)return;
  let card=document.getElementById('relystraPhaseZeroClient');
  if(!card){card=document.createElement('div');card.id='relystraPhaseZeroClient';const head=root.querySelector('.nexus-client-page-head');head?.after(card)}
  if(!card.parentElement){root.prepend(card)}
  const stage=current.current_stage;
  card.innerHTML=baseCard({admin:false});
  const inner=card.querySelector('.relystra-p0-card');
  const summary=document.createElement('div');summary.className='relystra-p0-summary';summary.innerHTML=`<div><span>Implementation actions</span><b>${Number(current.implementation_tasks_open||0)} open / ${Number(current.implementation_tasks_total||0)} total</b></div><div><span>Measured evidence</span><b>${Number(current.measured_evidence_count||0)}</b></div><div><span>Project state</span><b>${esc(current.project_status||'planning')}</b></div>`;inner.appendChild(summary);
  if(stage==='acceptance'){
    const accepted=(current.gates||[]).find(g=>g.gate_code==='client_accepted'&&g.status==='passed');
    const box=document.createElement('div');box.className='relystra-p0-client-accept';
    box.innerHTML=accepted?'<div class="kicker">Acceptance recorded</div><h3>Thank you. Your acceptance is on record.</h3><p>Relystra will close the engagement once the handoff record is also complete.</p>':'<div class="kicker">Final client decision</div><h3>Does the delivered result meet the agreed outcome?</h3><p>Accept only after you have reviewed the measured result and handoff. If something remains unresolved, request changes instead.</p><div class="relystra-p0-actions"><button class="btn primary" type="button" data-p0-client-accept>Accept completed engagement →</button><button class="btn secondary" type="button" data-p0-client-changes>Request changes</button></div>';
    inner.appendChild(box);
    box.querySelector('[data-p0-client-accept]')?.addEventListener('click',()=>runBoundary('accept completed engagement',acceptClient));
    box.querySelector('[data-p0-client-changes]')?.addEventListener('click',()=>openClientChanges());
  }
  if(stage==='complete'){
    const note=document.createElement('div');note.className='relystra-p0-client-accept';note.innerHTML='<div class="kicker">Point B reached</div><h3>Engagement complete.</h3><p>Implementation, QA, measurement, handoff, and client acceptance are all recorded. This is the Phase Zero definition of a completed RELYSTRA delivery.</p>';inner.appendChild(note);
  }
}

function adminActionLabel(gate){return ({scope_signed:'Record signed scope',payment_confirmed:'Confirm payment',onboarding_complete:'Complete onboarding',implementation_complete:'Close implementation',qa_passed:'Record QA pass',measurement_complete:'Complete measurement',handoff_complete:'Complete handoff'})[gate]||`Record ${gate.replaceAll('_',' ')}`}
function renderAdmin(){
  const root=document.getElementById('adminJourneyRoot');if(!root||!current)return;
  let host=document.getElementById('relystraPhaseZeroAdmin');
  if(!host){host=document.createElement('div');host.id='relystraPhaseZeroAdmin';root.prepend(host)}
  host.innerHTML=baseCard({admin:true});
  const inner=host.querySelector('.relystra-p0-card');
  const gates=document.createElement('div');gates.className='relystra-p0-gates';gates.innerHTML=gateMarkup();inner.appendChild(gates);
  const summary=document.createElement('div');summary.className='relystra-p0-summary';summary.innerHTML=`<div><span>Implementation actions</span><b>${Number(current.implementation_tasks_open||0)} open / ${Number(current.implementation_tasks_total||0)} total</b></div><div><span>Measured evidence</span><b>${Number(current.measured_evidence_count||0)}</b></div><div><span>Lifecycle status</span><b>${esc(current.project_status||'planning')}</b></div>`;inner.appendChild(summary);
  const required=ADMIN_GATES[current.current_stage]||[];
  if(required.length){
    const actions=document.createElement('div');actions.className='relystra-p0-actions';
    const gmap=gateMap();
    for(const gate of required){const row=gmap.get(gate);const button=document.createElement('button');button.type='button';button.className=row?.status==='passed'?'btn secondary':'btn primary';button.textContent=row?.status==='passed'?`Update ${row.label}`:adminActionLabel(gate);button.dataset.p0Gate=gate;if(gate==='implementation_complete'&&Number(current.implementation_tasks_open||0)>0)button.disabled=true;if(gate==='measurement_complete'&&Number(current.measured_evidence_count||0)<1)button.disabled=true;actions.appendChild(button)}
    inner.appendChild(actions);
    actions.querySelectorAll('[data-p0-gate]').forEach(button=>button.addEventListener('click',()=>openAdminGate(button.dataset.p0Gate)));
  }
  if(current.current_stage==='acceptance'){
    const gmap=gateMap(),accepted=gmap.get('client_accepted');
    const note=document.createElement('div');note.className='relystra-p0-note';
    note.textContent=accepted?.status==='passed'?'Client acceptance is recorded. Complete any remaining handoff gate to close the engagement.':'Client acceptance must come from the client portal. If written acceptance was received outside the portal, use the controlled external-evidence fallback.';
    inner.appendChild(note);
    if(accepted?.status!=='passed'){
      const actions=document.createElement('div');actions.className='relystra-p0-actions';actions.innerHTML='<button class="btn secondary" type="button" data-p0-external-accept>Record external written acceptance</button>';inner.appendChild(actions);actions.querySelector('[data-p0-external-accept]').addEventListener('click',openExternalAcceptance)
    }
  }
}

function render(){if(!current)return;const clientMode=!state.admin||state.viewMode==='client';if(clientMode)renderClient();else renderAdmin()}
function renderError(error){const target=(!state.admin||state.viewMode==='client')?document.getElementById('nexus-client-today'):document.getElementById('adminJourneyRoot');if(!target)return;let host=document.getElementById('relystraPhaseZeroError');if(!host){host=document.createElement('div');host.id='relystraPhaseZeroError';target.prepend(host)}host.innerHTML=`<div class="relystra-p0-card"><div class="kicker">Engagement lifecycle unavailable</div><p class="small">${esc(error?.message||'Refresh the workspace and try again.')}</p></div>`}

function ensureModal(){
  let modal=document.getElementById('relystraPhaseZeroModal');if(modal)return modal;
  modal=document.createElement('div');modal.id='relystraPhaseZeroModal';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-hidden','true');
  modal.innerHTML='<div class="modal-card relystra-p0-modal-card"><div class="toolbar"><div><div class="eyebrow">Relystra lifecycle evidence</div><h2 id="relystraP0ModalTitle" style="margin:5px 0">Record gate</h2></div><button class="btn secondary" type="button" data-p0-close>Close</button></div><div id="relystraP0ModalBody"></div></div>';
  document.body.appendChild(modal);modal.querySelector('[data-p0-close]').onclick=closeModal;modal.onclick=e=>{if(e.target===modal)closeModal()};return modal;
}
function openModal(title,body){const modal=ensureModal();modal.querySelector('#relystraP0ModalTitle').textContent=title;modal.querySelector('#relystraP0ModalBody').innerHTML=body;modal.classList.add('open','show');modal.setAttribute('aria-hidden','false');return modal}
function closeModal(){const modal=document.getElementById('relystraPhaseZeroModal');modal?.classList.remove('open','show');modal?.setAttribute('aria-hidden','true')}

function openAdminGate(gate){
  const row=gateMap().get(gate)||{};const required=EVIDENCE_REQUIRED.has(gate);
  const modal=openModal(adminActionLabel(gate),`<div class="field"><label>Evidence reference ${required?'(required)':'(recommended)'}</label><input id="relystraP0Evidence" value="${esc(row.evidence_ref||'')}" placeholder="Signed SOW, invoice/payment reference, QA report, file name, ticket, or URL"></div><div class="field"><label>Operator note</label><textarea id="relystraP0Note" placeholder="What was verified, by whom, and what evidence supports it?">${esc(row.note||'')}</textarea></div><p class="relystra-p0-modal-help">Phase Zero records should point to real evidence. Do not paste passwords, payment credentials, or unrelated sensitive data here.</p><div class="relystra-p0-actions"><button class="btn primary" type="button" data-p0-save>Mark gate passed →</button><button class="btn secondary" type="button" data-p0-fail>Record failed / reopen</button></div>`);
  modal.querySelector('[data-p0-save]').onclick=()=>runBoundary(`record ${gate}`,()=>saveAdminGate(gate,'passed'));
  modal.querySelector('[data-p0-fail]').onclick=()=>runBoundary(`fail ${gate}`,()=>saveAdminGate(gate,'failed'));
}
async function saveAdminGate(gate,status){
  const evidence=document.getElementById('relystraP0Evidence')?.value.trim()||'',note=document.getElementById('relystraP0Note')?.value.trim()||'';
  const {data,error}=await sb.rpc('nexus_admin_record_engagement_gate',{p_project_id:activeProjectId,p_gate_code:gate,p_status:status,p_evidence_ref:evidence||null,p_note:note||null,p_evidence:{source:'portal_phase_zero'}});
  if(error)throw error;current=data;closeModal();toast?.(status==='passed'?'Lifecycle gate recorded.':'Lifecycle gate reopened.');await refresh({reloadWorkspace:true});
}

async function acceptClient(){
  if(!window.confirm('Confirm that the delivered result and handoff meet the agreed outcome? This records final client acceptance.'))return;
  const {data,error}=await sb.rpc('nexus_client_accept_engagement',{p_project_id:activeProjectId,p_decision:'accepted',p_note:null});if(error)throw error;current=data;toast?.('Acceptance recorded.');await refresh({reloadWorkspace:true});
}
function openClientChanges(){
  const modal=openModal('Request changes before acceptance','<div class="field"><label>What still needs to change?</label><textarea id="relystraP0ClientChanges" placeholder="Describe the specific unresolved item or result that prevents acceptance."></textarea></div><p class="relystra-p0-modal-help">This does not erase completed work. It records that the engagement is not yet accepted and alerts Relystra to review the requested change.</p><div class="relystra-p0-actions"><button class="btn primary" type="button" data-p0-request-changes>Send change request →</button></div>');
  modal.querySelector('[data-p0-request-changes]').onclick=()=>runBoundary('request engagement changes',requestClientChanges);
}
async function requestClientChanges(){
  const note=document.getElementById('relystraP0ClientChanges')?.value.trim()||'';if(!note){toast?.('Describe the change you need.');return}
  const {data,error}=await sb.rpc('nexus_client_accept_engagement',{p_project_id:activeProjectId,p_decision:'changes_requested',p_note:note});if(error)throw error;current=data;closeModal();toast?.('Change request recorded.');await refresh({reloadWorkspace:true});
}
function openExternalAcceptance(){
  const modal=openModal('Record external written acceptance','<div class="field"><label>Evidence reference (required)</label><input id="relystraP0ExternalEvidence" placeholder="Email thread, signed acceptance page, ticket, or stored document reference"></div><div class="field"><label>Note</label><textarea id="relystraP0ExternalNote" placeholder="Why this evidence is sufficient to represent the client’s written acceptance."></textarea></div><p class="relystra-p0-modal-help">Use this only when the client has actually provided written acceptance outside the portal. Verbal or assumed acceptance is not enough.</p><div class="relystra-p0-actions"><button class="btn primary" type="button" data-p0-save-external>Record acceptance →</button></div>');
  modal.querySelector('[data-p0-save-external]').onclick=()=>runBoundary('record external client acceptance',saveExternalAcceptance);
}
async function saveExternalAcceptance(){
  const evidence=document.getElementById('relystraP0ExternalEvidence')?.value.trim()||'',note=document.getElementById('relystraP0ExternalNote')?.value.trim()||'';if(!evidence){toast?.('Written acceptance evidence is required.');return}
  const {data,error}=await sb.rpc('nexus_admin_record_external_client_acceptance',{p_project_id:activeProjectId,p_evidence_ref:evidence,p_note:note||null});if(error)throw error;current=data;closeModal();toast?.('External client acceptance recorded.');await refresh({reloadWorkspace:true});
}

function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{if(current)render()},80)}
function bindRefreshEvents(){
  for(const name of ['nexus:resolution-plan-confirmed','nexus:diagnosis-changed','nexus:workspace-updated','nexus:task-changed'])window.addEventListener(name,()=>refresh({reloadWorkspace:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
  const app=document.getElementById('portalApp');if(app){observer=new MutationObserver(scheduleRender);observer.observe(app,{childList:true,subtree:true})}
}

await refresh();bindRefreshEvents();
window.RelystrPhaseZeroLifecycle={refresh,loadStatus,get status(){return current}};
