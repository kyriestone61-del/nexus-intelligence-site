(function(){
  const portal=window.NexusPortal;
  if(!portal)return;
  const {sb,state,toast}=portal;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr=v=>Array.isArray(v)?v:[];
  const title=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());

  function ensureModal(){
    let modal=document.getElementById('diagnosisReviewModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='diagnosisReviewModal';
    modal.className='modal diagnosis-review-modal';
    modal.innerHTML='<div class="modal-card diagnosis-review-card"><div class="toolbar"><div><div class="eyebrow">Internal Nexus review</div><h2 style="margin:5px 0">Client Diagnosis</h2></div><button class="btn secondary" id="closeDiagnosisReview" type="button">Close</button></div><div id="diagnosisReviewBody"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#closeDiagnosisReview')?.addEventListener('click',()=>modal.classList.remove('open'));
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
    return modal;
  }

  const refs=x=>arr(x?.evidence_refs).length?`<div class="diagnosis-refs">Evidence: ${arr(x.evidence_refs).map(esc).join(' · ')}</div>`:'';
  const cards=(items,render)=>items.length?`<div class="diagnosis-review-grid">${items.map(render).join('')}</div>`:'<div class="empty">No items were produced for this section.</div>';
  function section(label,content,open=false){return `<details class="diagnosis-review-section" ${open?'open':''}><summary>${esc(label)}</summary><div class="diagnosis-review-content">${content}</div></details>`}

  function resultMarkup(run){
    const r=run.analysis_result||{};
    const summary=r.executive_summary?`<div class="diagnosis-executive"><div class="kicker">Executive summary</div><p>${esc(r.executive_summary)}</p></div>`:'';
    const factual=cards(arr(r.facts),x=>`<div class="diagnosis-review-item"><b>${esc(x.statement)}</b>${refs(x)}</div>`);
    const statements=cards(arr(r.client_statements),x=>`<div class="diagnosis-review-item"><b>${esc(x.statement)}</b>${refs(x)}</div>`);
    const inferences=cards(arr(r.inferences),x=>`<div class="diagnosis-review-item"><b>${esc(x.statement)}</b><p>${esc(x.basis||'')}</p><span class="pill">${esc(x.confidence||'unrated')} confidence</span></div>`);
    const unknowns=cards(arr(r.unknowns),x=>`<div class="diagnosis-review-item"><b>${esc(x.question)}</b><p>${esc(x.why_it_matters||'')}</p></div>`);
    const process=cards(arr(r.process_map),x=>`<div class="diagnosis-review-item"><div class="kicker">Step ${esc(x.step||'—')}</div><b>${esc(x.name||'Process step')}</b><p>${esc(x.current_state||'')}</p><small>Owner: ${esc(x.owner||'unknown')}</small>${refs(x)}</div>`);
    const bottlenecks=cards(arr(r.bottlenecks),x=>`<div class="diagnosis-review-item"><b>${esc(x.title)}</b><p>${esc(x.description||'')}</p><small>${esc(x.impact||'')}</small>${refs(x)}</div>`);
    const gaps=cards(arr(r.baseline_gaps),x=>`<div class="diagnosis-review-item"><b>${esc(x.metric)}</b><p>${esc(x.gap||'')}</p><small>Needed: ${esc(x.needed_evidence||'')}</small></div>`);
    const opps=cards(arr(r.opportunity_backlog),x=>`<div class="diagnosis-review-item"><div class="kicker">Priority ${esc(x.rank||'—')}</div><b>${esc(x.title)}</b><p>${esc(x.problem||'')}</p><small>${esc(x.recommendation||'')}</small><div class="diagnosis-score-row"><span>Value ${esc(x.value_score||'—')}</span><span>Effort ${esc(x.effort_score||'—')}</span><span>Readiness ${esc(x.readiness_score||'—')}</span></div>${refs(x)}</div>`);
    const risks=cards(arr(r.risks),x=>`<div class="diagnosis-review-item"><b>${esc(x.risk)}</b><p>Control: ${esc(x.control||'')}</p><span class="pill">${esc(x.severity||'unrated')}</span></div>`);
    const questions=cards(arr(r.follow_up_questions),x=>`<div class="diagnosis-review-item"><b>${esc(x.question)}</b><p>${esc(x.reason||'')}</p></div>`);
    const pilot=r.smallest_safe_pilot||{};
    const pilotMarkup=`<div class="diagnosis-pilot"><div class="kicker">Smallest safe pilot</div><h3>${esc(pilot.title||'Pilot not defined')}</h3><p>${esc(pilot.summary||'')}</p><div class="diagnosis-list-pair"><div><b>In scope</b><ul>${arr(pilot.scope_in).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><b>Out of scope</b><ul>${arr(pilot.scope_out).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div><b>Acceptance criteria</b><ul>${arr(pilot.acceptance_criteria).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><b>Human controls</b><ul>${arr(pilot.human_controls).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
    const error=run.execution_error?`<div class="note error"><b>Execution issue:</b> ${esc(run.execution_error)}</div>`:'';
    const orchestration=run.orchestrated_at?`<div class="diagnosis-generated"><div class="kicker">Generated after approval</div><div class="diagnosis-counts">${Object.entries(run.orchestration_summary||{}).map(([k,v])=>`<span><b>${esc(v)}</b>${esc(title(k))}</span>`).join('')}</div><div class="actions"><button class="btn secondary diagnosis-goto" data-section="overview" type="button">Today →</button><button class="btn secondary diagnosis-goto" data-section="tasks" type="button">Action Items →</button><button class="btn secondary diagnosis-goto" data-section="timeline" type="button">Projects →</button></div></div>`:'';
    const canReview=run.status==='ready_for_review';
    const actions=canReview?`<div class="diagnosis-review-actions"><div class="field"><label>Review note <span class="small">(optional for approval; required for revision/block)</span></label><textarea id="diagnosisReviewNote" placeholder="Record the reason for this decision or what needs to change."></textarea></div><div class="actions"><button class="btn primary" data-diagnosis-action="approve" data-id="${esc(run.id)}" type="button">Approve diagnosis →</button><button class="btn secondary" data-diagnosis-action="revision" data-id="${esc(run.id)}" type="button">Request revision</button><button class="btn secondary" data-diagnosis-action="block" data-id="${esc(run.id)}" type="button">Block</button><button class="btn secondary" data-diagnosis-action="archive" data-id="${esc(run.id)}" type="button">Archive</button></div><p class="small">Approval creates controlled downstream workspace records once. No external action is taken automatically.</p></div>`:'';
    return `${error}${summary}${section('Facts',factual,true)}${section('Client statements',statements)}${section('Inferences',inferences)}${section('Unknowns',unknowns)}${section('Current-state process map',process,true)}${section('Bottlenecks',bottlenecks,true)}${section('Baseline gaps',gaps)}${section('Ranked AI / automation opportunities',opps,true)}${section('Risks and controls',risks)}${section('Follow-up questions',questions)}${pilotMarkup}${orchestration}${actions}`;
  }

  async function loadRun(id){
    const {data,error}=await sb.from('nexus_diagnosis_runs').select('*').eq('id',id).single();
    if(error)throw error; return data;
  }
  async function openReview(id){
    const modal=ensureModal(),body=modal.querySelector('#diagnosisReviewBody');
    body.innerHTML='<div class="empty">Loading diagnosis…</div>'; modal.classList.add('open');
    try{const run=await loadRun(id);body.innerHTML=`<div class="diagnosis-review-meta"><span class="diagnosis-status ${esc(run.status)}">${esc(title(run.status))}</span><span class="small">${run.analysis_completed_at?new Date(run.analysis_completed_at).toLocaleString():''}</span></div>${resultMarkup(run)}`}
    catch(e){body.innerHTML=`<div class="note error">${esc(e.message||'Diagnosis could not be loaded.')}</div>`}
  }
  async function execute(id){
    toast?.('Diagnosis analysis started.');
    const {data,error}=await sb.functions.invoke('nexus-diagnosis-execute',{body:{run_id:id}});
    if(error||data?.ok===false)throw new Error(data?.error||error?.message||'Diagnosis execution failed.');
    toast?.('Diagnosis is ready for review.'); await openReview(id); window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));
  }
  async function decision(action,id){
    const note=document.getElementById('diagnosisReviewNote')?.value?.trim()||'';
    const calls={approve:['nexus_approve_diagnosis',{p_run_id:id,p_note:note||null}],revision:['nexus_request_diagnosis_revision',{p_run_id:id,p_note:note}],block:['nexus_block_diagnosis',{p_run_id:id,p_reason:note}],archive:['nexus_archive_diagnosis',{p_run_id:id,p_note:note||null}]};
    if((action==='revision'||action==='block')&&!note)return toast?.('Add a review note explaining what needs to change.');
    const [fn,args]=calls[action]||[];if(!fn)return;
    const {data,error}=await sb.rpc(fn,args);if(error)throw error;
    if(action==='revision'){
      toast?.('Revision requested. Re-running the diagnosis with your review note.');
      await execute(id);return;
    }
    toast?.(action==='approve'?'Diagnosis approved. Workspace records generated.':`Diagnosis ${action}ed.`);
    await openReview(id); window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));
  }

  document.addEventListener('click',async e=>{
    const review=e.target.closest?.('.diagnosis-review-btn');if(review){e.preventDefault();return openReview(review.dataset.id)}
    const retry=e.target.closest?.('.diagnosis-retry-btn');if(retry){e.preventDefault();retry.disabled=true;try{await execute(retry.dataset.id)}catch(err){toast?.(err.message||'Diagnosis could not be re-run.')}finally{retry.disabled=false}return}
    const action=e.target.closest?.('[data-diagnosis-action]');if(action){action.disabled=true;try{await decision(action.dataset.diagnosisAction,action.dataset.id)}catch(err){toast?.(err.message||'Diagnosis decision could not be saved.')}finally{action.disabled=false}return}
    const go=e.target.closest?.('.diagnosis-goto');if(go){document.getElementById('diagnosisReviewModal')?.classList.remove('open');document.querySelector(`.side-nav button[data-section="${go.dataset.section}"]`)?.click()}
  });
})();
