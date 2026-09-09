import {loadBuildLibrary} from './portal-commercial-admin.js';
import {requestBuildRecommendations} from '/portal-build-request.js';
// Build selection and curation component, mounted by the existing admin/client workspace owners.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=v=>Array.isArray(v)?v:[];
const money=(cents,currency='usd')=>new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(cents||0)/100);
const lines=value=>String(value||'').split('\n').map(v=>v.trim()).filter(Boolean);
const description=(title,values)=>list(values).length?`<div><b>${esc(title)}</b><ul>${values.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></div>`:'';
const field=(name,label,value,type='text',attrs='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area=(name,label,value)=>`<label>${esc(label)}<textarea name="${name}" rows="3">${esc(Array.isArray(value)?value.join('\n'):value||'')}</textarea></label>`;

function menuCard(build,selected,menu){
 const ready=build.commercial_state==='commercially_ready',later=build.placement==='later';
 return `<article class="relystra-build-card"><h3>${esc(build.name)}</h3><span class="relystra-readiness">${ready?'Scope and price approved':'Confirm scope with Relystra'}</span><p>${esc(build.outcome||build.problem)}</p><p>${esc(build.why_recommended||build.operational_benefit)}</p><p class="relystra-factors"><b>${esc(build.impact||'Unconfirmed')} impact</b><span>${esc(build.effort||'Unconfirmed')} effort</span></p><p><strong>${build.price_cents?esc(money(build.price_cents,build.currency)):'Scope discussion required'}</strong> · ${esc(build.offer_name||'Offer to be confirmed')}</p><p class="small">${esc(build.price_basis)} · ${build.duration_min?`${esc(build.duration_min)}–${esc(build.duration_max)} business days`:'Duration confirmed with scope'}</p>
 <p>${esc(build.dependency_reason||'No prerequisite identified in the approved scope.')}</p>${list(build.dependencies).length?description('Prerequisites',build.dependencies.map(id=>menu.find(b=>b.id===id)?.name||'A previously approved Build; Relystra will confirm readiness.')):''}
 <details><summary>Scope, deliverables and required inputs</summary>${description('Included',build.scope_in)}${description('Deliverables',build.deliverables)}${description('Outside this Build',build.scope_out)}${description('Required inputs',build.inputs)}${description('Acceptance criteria',build.acceptance_criteria)}${description('Assumptions',build.assumptions)}</details>
 <div class="relystra-build-buttons">${ready?`<label><input type="checkbox" data-build-select="${esc(build.id)}" ${selected.has(build.id)?'checked':''}> Add this Build to the scope review</label>`:`<button class="btn secondary" data-interest="discuss" data-build="${esc(build.id)}">Discuss this Build / confirm scope</button>`}${!later?`<button class="btn secondary" data-interest="later" data-build="${esc(build.id)}">Leave for later</button>`:''}</div></article>`;
}
function includedCard(b){return `<article class="relystra-build-card"><h3>${esc(b.name)}</h3><p>${esc(b.outcome||b.problem)}</p><p><b>${esc(money(b.price_cents,b.currency))} committed</b> · ${esc((b.status||'Preparing').replaceAll('_',' '))}</p><p>${esc(b.duration_min)}–${esc(b.duration_max)} business days</p>${description('Approved scope',b.scope_in)}${description('What we need',b.inputs)}<p><b>Next milestone:</b> ${esc(b.next_milestone)}</p><button class="btn secondary" data-continue-original="${esc(b.project_id)}">View implementation progress</button></article>`}

function reviewCard(row,settings,opportunities,acceptedActions,library,offers){
  const template=library.find(t=>t.code===row.build_spec?.template_code)?.default_recipe||{};
  const spec={price_cents:template.default_price_cents,offer_code:template.default_offer,duration_min:template.typical_duration?.min,duration_max:template.typical_duration?.max,deliverables:template.deliverables,...row.build_spec},scores=list(spec.complexity_scores).length===5?spec.complexity_scores:[1,1,1,1,1];
  const dimensions=['Input formats and count','Users and permissions','Automation depth','Integrations and tools','Operational risk'];
  return `<details class="relystra-build-card" ${row.build_review_state==='proposed'?'open':''}><summary><b>${esc(row.title)}</b> · ${esc(row.build_review_state)}</summary>
    <form data-build-review="${esc(row.id)}"><p>${esc(spec.problem)}</p>
      <details><summary>Diagnosis and accepted inputs</summary>${list(spec.source_finding_refs).map(ref=>`<p>${esc(ref.snapshot?.description||ref.snapshot?.problem||ref.snapshot?.title||ref.path)}</p><small>${esc(ref.ref)}</small>`).join('')}<p>Accepted input references: ${list(spec.completed_action_ids).map(esc).join(', ')||'Diagnosis evidence only'}</p></details>
      <fieldset><legend>Accepted inputs used by this Build</legend>${acceptedActions.map(a=>`<label><input type="checkbox" name="completed_action" value="${esc(a.id)}" ${list(spec.completed_action_ids).includes(a.id)?'checked':''}> ${esc(a.title)}</label>`).join('')||'<p class="small">No accepted pre-build input yet.</p>'}</fieldset>
      ${field('name','Build name',row.title)}${area('outcome','Expected outcome',spec.outcome)}
      ${area('scope_in','Included scope — one item per line',spec.scope_in)}${area('scope_out','Excluded scope — one item per line',spec.scope_out)}
      ${area('required_inputs','Required inputs — one per line',spec.required_inputs)}${area('acceptance_criteria','Acceptance criteria — one per line',spec.acceptance_criteria)}${area('assumptions','Assumptions — one per line',spec.assumptions)}
      ${area('risks','Risks and mitigations — one per line',spec.risks)}
      <fieldset><legend>Roadmap judgment</legend><label>Client placement<select name="placement"><option value="next" ${spec.placement!=='later'?'selected':''}>Recommended Next</option><option value="later" ${spec.placement==='later'?'selected':''}>Later</option></select></label>
      <label>Commercial readiness<select name="commercial_state">${[['qualified','Qualified — review scope'],['needs_discussion','Needs discussion'],['commercially_ready','Commercially ready']].map(([v,t])=>`<option value="${v}" ${spec.commercial_state===v?'selected':''}>${t}</option>`).join('')}</select></label>
      <label>Offer<select name="offer_code">${offers.filter(o=>list(template.eligible_offers).includes(o.code)).map(o=>`<option value="${esc(o.code)}" ${spec.offer_code===o.code?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label>
      ${area('operational_benefit','Concrete operational benefit',spec.operational_benefit)}${area('deliverables','Deliverables — one per line',spec.deliverables)}
      <details><summary>Evidence-backed qualification and ranking</summary>${['impact','urgency','effort','dependency_readiness','client_readiness','confidence'].map(k=>`<label>${esc(k.replaceAll('_',' '))}<select name="qualification_${k}">${['unknown','low','medium','high'].map(v=>`<option ${spec.qualification?.[k]?.level===v?'selected':''}>${v}</option>`).join('')}</select></label>${area('reason_'+k,'Evidence / uncertainty',spec.qualification?.[k]?.reason)}`).join('')}<p>Deterministic score: ${esc(spec.ranking?.score??'Calculated on save')}. Higher impact, urgency, confidence and readiness raise priority; greater effort lowers it.</p>${field('rank_override','Optional explicit rank override',spec.rank_override??'','number','min="0" max="99999"')}${area('rank_override_reason','Recorded judgment for rank override',spec.rank_override_reason)}</details></fieldset>
      <label>Priority<select name="priority">${['high','medium','low'].map(v=>`<option ${spec.priority===v?'selected':''}>${v}</option>`).join('')}</select></label>
      ${area('priority_reason','Why this priority',spec.priority_reason)}
      <fieldset><legend>Complexity</legend>${dimensions.map((label,i)=>`<label>${label}<select name="score_${i}">${[1,2,3].map(v=>`<option value="${v}" ${Number(scores[i])===v?'selected':''}>${v} — ${['Low','Moderate','High'][v-1]}</option>`).join('')}</select></label>`).join('')}
      <p data-complexity-guidance class="small"></p><label>Confirmed complexity<select name="complexity"><option value="">Choose after reviewing the scores</option>${['simple','standard','advanced'].map(v=>`<option value="${v}" ${spec.complexity===v?'selected':''}>${v}</option>`).join('')}</select></label></fieldset>
      <div class="relystra-build-fields">${field('price','Fixed price ('+settings.currency.toUpperCase()+')',spec.price_cents?spec.price_cents/100:'','number','min="0.01" step="0.01"')}
      ${field('deposit','Required deposit',spec.deposit_cents?spec.deposit_cents/100:(spec.price_cents?spec.price_cents/100:''),'number','min="0.01" step="0.01"')}${field('duration_min','Minimum business days',spec.duration_min||'','number','min="1" step="1"')}${field('duration_max','Maximum business days',spec.duration_max||'','number','min="1" step="1"')}</div>
      ${area('price_override_reason','Reason for price outside Library guidance',spec.price_override_reason)}${area('dependency_reason','Why this sequence is appropriate',spec.dependency_reason)}${area('dependency_override_reason','Explain any typical Library prerequisite that does not apply',spec.dependency_override_reason)}${area('repeat_scope_reason','If this capability was purchased before, explain this distinct additional scope',spec.repeat_scope_reason)}
      <p>Typical Library prerequisites: ${esc(list(template.prerequisite_builds).map(code=>library.find(t=>t.code===code)?.title||code).join(', ')||'None')}.</p>
      <fieldset><legend>Dependencies</legend>${opportunities.filter(o=>o.id!==row.id&&o.build_review_state==='approved').map(o=>`<label><input type="checkbox" name="dependency" value="${esc(o.id)}" ${list(spec.dependencies).includes(o.id)?'checked':''}> ${esc(o.title)}</label>`).join('')||'<p class="small">No other approved Builds yet.</p>'}</fieldset>
      <div class="relystra-build-buttons"><button class="btn primary" name="decision" value="approve">Approve for client</button><button class="btn secondary" name="decision" value="propose">Save draft</button><button class="btn secondary" name="decision" value="postpone">Postpone</button><button class="btn secondary" name="decision" value="reject">Reject</button></div>
    </form></details>`;
}

function planCard(plan){
  return `<article class="relystra-build-card"><h3>${esc(plan.name)}</h3><p><b>${esc(money(plan.total_cents,plan.currency))}</b> · ${esc(plan.status.replaceAll('_',' '))}${plan.checkout_livemode===false?' · Test payment':''}</p>
    <p>Required payment now: <b>${esc(money(plan.deposit_cents??plan.total_cents,plan.currency))}</b>${(plan.deposit_cents??plan.total_cents)<plan.total_cents?` · Remaining balance: ${esc(money(plan.total_cents-plan.deposit_cents,plan.currency))}`:''}</p><ul>${list(plan.items).map(i=>`<li><b>${esc(i.name)} — ${esc(money(i.price_cents,plan.currency))}</b>${description('Scope',i.scope_in)}${description('Deliverables',i.deliverables)}${i.duration_min?`<p>${esc(i.duration_min)}–${esc(i.duration_max)} business days</p>`:''}</li>`).join('')}</ul>${list(plan.duration_assumptions?.items).length?`<details><summary>Expected delivery sequence</summary><ol>${plan.duration_assumptions.items.map(step=>`<li>${esc(plan.items.find(i=>i.id===step.id)?.name)}: start ${step.start_min}–${step.start_max} business days after readiness; finish ${step.finish_min}–${step.finish_max}.</li>`).join('')}</ol><p>QA and client review follow. Relystra confirms the queue before work starts.</p></details>`:''}
    ${plan.purchase_kind==='build_package'?`<p>Package estimate: <b>${esc(plan.duration_min)}–${esc(plan.duration_max)} business days</b>, including dependencies, capacity, QA and client review.</p><p class="small">Starts after Build briefs and required access are approved.</p>`:''}
    ${plan.status==='awaiting_payment'?`<div class="relystra-build-buttons"><button class="btn primary" type="button" data-plan-checkout="${esc(plan.id)}">Approve plan & continue to payment</button><button class="btn secondary" type="button" data-plan-cancel="${esc(plan.id)}">Cancel unpaid plan</button></div>`:''}
  </article>`;
}

async function runtimeError(error,data){
  let detail=data;
  if(!detail&&error?.context?.clone)try{detail=await error.context.clone().json()}catch{}
  const code=detail?.error||error?.message||'The request could not be completed.';
  const friendly={MODEL_TIMEOUT:'The AI request timed out. Your existing recommendations and accepted inputs are saved. Retry generation or continue curating an existing recommendation.',COMPLETE_AND_REVIEW_PREBUILD_ACTIONS_FIRST:'Review suggested Actions and accept the required inputs before generating Builds.'};
  return new Error(detail?.message||friendly[code]||code);
}

export function mountBuilds(root,portal){
  const {sb,state,toast}=portal;
  let stage='builds',sequence=0,selected=new Set(),companyId=null,menu=[],plans=[],opportunities=[],settings=null,diagnosis=null,acceptedActions=[],loading=false,roadmap={included:[],payments:[]},library=[],offers=[];
  async function refresh(options={}){
    if(options.stage)stage=options.stage;
    const company=state.companyId,version=++sequence;
    if(company!==companyId){selected=new Set();companyId=company;menu=[];plans=[];opportunities=[];diagnosis=null;acceptedActions=[]}
    if(!company){root.innerHTML='<p>Open a client workspace to review Builds.</p>';return}
    loading=true;root.setAttribute('aria-busy','true');
    try{
      const results=await Promise.all([
        sb.rpc('relystra_roadmap',{p_company_id:company}),
        sb.from('nexus_build_plans').select('*').eq('company_id',company).neq('status','cancelled').order('created_at',{ascending:false}),
        ...(state.admin?[
          sb.from('nexus_opportunities').select('*').eq('company_id',company).not('build_spec','is',null).order('created_at',{ascending:true}),
          sb.from('nexus_delivery_settings').select('*').single(),
          sb.from('nexus_diagnosis_runs').select('id,status').eq('company_id',company).eq('status','approved').order('created_at',{ascending:false}).limit(1).maybeSingle(),
          sb.from('nexus_tasks').select('id,title').eq('company_id',company).eq('work_kind','prebuild_action').eq('action_review_state','approved').is('archived_at',null).in('status',['completed','approved','done']),
          loadBuildLibrary(sb).then(data=>({data})),sb.from('nexus_commercial_offerings').select('*').eq('active',true).order('sort_order'),
        ]:[]),
      ]);
      if(version!==sequence||state.companyId!==company)return;
      const failed=results.find(result=>result.error);if(failed)throw failed.error;
      roadmap=results[0].data||{included:[],payments:[]};menu=roadmap.recommendations||[];plans=results[1].data||[];opportunities=results[2]?.data||[];settings=results[3]?.data;diagnosis=results[4]?.data;acceptedActions=results[5]?.data||[];library=results[6]?.data||[];offers=results[7]?.data||[];
      selected=new Set([...selected].filter(id=>menu.some(build=>build.id===id&&build.commercial_state==='commercially_ready')));render();
    }catch(error){if(version===sequence&&state.companyId===company){root.innerHTML=`<p role="alert">${esc(error.message||'Builds could not be loaded.')}</p><button class="btn secondary" data-build-refresh>Retry</button>`}}
    finally{if(version===sequence){loading=false;root.removeAttribute('aria-busy')}}
  }
  function render(){
    const reserved=new Set(plans.filter(p=>p.status==='awaiting_payment').flatMap(p=>list(p.items).map(i=>i.id)));
    const available=menu.filter(b=>!reserved.has(b.id));
    root.innerHTML=`<header class="nexus-client-page-head"><div><div class="eyebrow">${stage==='scope'?'Additional scope & payment':'Your improvement Roadmap'}</div><h1>${stage==='scope'?'Review your additional scope and payment.':'Included now. Your next improvements.'}</h1><p>Your included Build keeps moving. You can keep the original scope, add one recommendation or approve several additional Builds with their own scope and price.</p></div><button class="btn secondary" data-build-refresh type="button">Refresh</button></header>
      ${state.admin&&stage!=='scope'?`<section><h2>Review recommendations</h2><p>Confirm the scope, complexity, fixed price and duration before a Build reaches the client.</p><button class="btn primary" data-generate-builds type="button" ${diagnosis?'':'disabled'}>Generate from accepted evidence</button>${!diagnosis?'<p class="small">Approve the Full Diagnosis before qualifying recommendations. Unknown inputs should remain explicit.</p>':''}<div class="relystra-build-grid">${opportunities.filter(o=>!plans.some(p=>p.status==='paid'&&p.items.some(i=>i.id===o.id))).map(o=>reviewCard(o,settings,opportunities,acceptedActions,library,offers)).join('')}</div></section>`:''}
      <p data-build-message role="alert" hidden></p>
      ${plans.some(p=>p.status==='awaiting_payment'&&p.purchase_kind!=='diagnosis')?`<section data-saved-plans><h2>Additional scope awaiting payment</h2><div class="relystra-build-grid">${plans.filter(p=>p.status==='awaiting_payment'&&p.purchase_kind!=='diagnosis').map(planCard).join('')}</div></section>`:''}
      ${stage!=='scope'?`<section><h2>Included Now</h2><p>No additional purchase is required to continue your approved work.</p><div class="relystra-build-grid">${list(roadmap.included).map(includedCard).join('')||'<p>Your first purchased Build will appear here.</p>'}</div>${list(roadmap.payments).filter(p=>plans.some(plan=>plan.id===p.plan_id&&plan.status==='paid')).map(p=>`<p>Committed: ${esc(money(p.total_cents,p.currency))} · Paid: ${esc(money(p.paid_cents,p.currency))} · Balance: ${esc(money(p.balance_cents,p.currency))}${p.balance_cents>0?` <button class="btn secondary" data-balance="${esc(p.plan_id)}">Review remaining balance</button>`:''}</p>`).join('')}</section>`:''}
      <section data-build-menu><h2>Recommended Next</h2><p>${esc(roadmap.schedule_note||'Review the approved recommendations below.')}</p><div class="relystra-build-grid">${available.filter(b=>b.placement!=='later').slice(0,4).map(b=>menuCard(b,selected,menu)).join('')||'<p>No additional approved recommendations yet.</p>'}</div>
      ${available.filter(b=>b.placement!=='later').length>4?`<details><summary>More recommended Builds · ${available.filter(b=>b.placement!=='later').length-4}</summary><div class="relystra-build-grid">${available.filter(b=>b.placement!=='later').slice(4).map(b=>menuCard(b,selected,menu)).join('')}</div></details>`:''}
      ${available.some(b=>b.placement==='later')?`<details><summary>Later · ${available.filter(b=>b.placement==='later').length} other qualified opportunities</summary><div class="relystra-build-grid">${available.filter(b=>b.placement==='later').map(b=>menuCard(b,selected,menu)).join('')}</div></details>`:''}
      ${available.some(b=>b.commercial_state==='commercially_ready')?'<div class="relystra-build-selection-total" role="status" aria-live="polite"></div><button class="btn primary" type="button" data-create-build-plan>Review additional scope and payment</button>':''}</section>`;
    if(stage==='scope'){
      root.querySelector('[data-build-menu]')?.remove();
      if(!plans.some(p=>p.status==='awaiting_payment'))root.insertAdjacentHTML('beforeend','<p>No Build Plan is saved yet. Return to the Roadmap to review optional additions. Your included Build keeps moving.</p>');
    }
    updateSelection();root.querySelectorAll('[data-build-review]').forEach(form=>updateComplexity(form));
  }
  function updateSelection(){
    const chosen=menu.filter(b=>selected.has(b.id)&&b.commercial_state==='commercially_ready');
    const total=root.querySelector('.relystra-build-selection-total');
    if(total)total.textContent=`${chosen.length} selected · ${money(chosen.reduce((n,b)=>n+b.price_cents,0),chosen[0]?.currency||'usd')} additional scope · ${money(chosen.reduce((n,b)=>n+(b.deposit_cents??b.price_cents),0),chosen[0]?.currency||'usd')} required deposit/payment`;
    const button=root.querySelector('[data-create-build-plan]');if(button)button.disabled=!chosen.length;
  }
  function updateComplexity(form){
    const total=[0,1,2,3,4].reduce((n,i)=>n+Number(form.elements.namedItem(`score_${i}`).value),0);
    const tier=total<=settings.simple_max?'simple':total<=settings.standard_max?'standard':'advanced';
    const range=settings.price_guidance?.[tier]||[],duration=settings.duration_guidance?.[tier]||[];
    form.querySelector('[data-complexity-guidance]').textContent=`Score ${total}/15 suggests ${tier}. Guidance: ${range.map(v=>money(v,settings.currency)).join('–')}${tier==='advanced'?'+':''}; ${duration.join('–')} business days. Confirm the final terms below.`;
  }
  root.addEventListener('change',event=>{
    const input=event.target;if(input.dataset.buildSelect){input.checked?selected.add(input.dataset.buildSelect):selected.delete(input.dataset.buildSelect);updateSelection()}
    const form=input.closest('[data-build-review]');if(form&&input.name.startsWith('score_'))updateComplexity(form);
  });
  root.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-build-review]');if(!form)return;event.preventDefault();
    const company=state.companyId;if(company!==companyId||loading)return;
    const data=new FormData(form),read=name=>String(data.get(name)||'').trim(),button=event.submitter;
    const patch={commercial_state:read('commercial_state'),placement:read('placement'),offer_code:read('offer_code'),operational_benefit:read('operational_benefit'),deliverables:lines(read('deliverables')),qualification:Object.fromEntries(['impact','urgency','effort','dependency_readiness','client_readiness','confidence'].map(k=>[k,{level:read('qualification_'+k),reason:read('reason_'+k)}])),rank_override:read('rank_override')?Number(read('rank_override')):null,rank_override_reason:read('rank_override_reason'),price_override_reason:read('price_override_reason'),dependency_reason:read('dependency_reason'),dependency_override_reason:read('dependency_override_reason'),repeat_scope_reason:read('repeat_scope_reason'),deposit_cents:Math.round(Number(read('deposit'))*100),name:read('name'),outcome:read('outcome'),scope_in:lines(read('scope_in')),scope_out:lines(read('scope_out')),
      required_inputs:lines(read('required_inputs')),acceptance_criteria:lines(read('acceptance_criteria')),assumptions:lines(read('assumptions')),risks:lines(read('risks')),
      priority:read('priority'),priority_reason:read('priority_reason'),complexity_scores:[0,1,2,3,4].map(i=>Number(read(`score_${i}`))),
      complexity:read('complexity'),price_cents:Math.round(Number(read('price'))*100),currency:settings.currency,
      duration_min:Number(read('duration_min')),duration_max:Number(read('duration_max')),dependencies:data.getAll('dependency'),completed_action_ids:data.getAll('completed_action')};
    const controls=[...form.querySelectorAll('button,input,textarea,select')];controls.forEach(n=>n.disabled=true);
    try{
      const {error}=await sb.rpc('relystra_save_build',{p_company_id:company,p_id:form.dataset.buildReview,p_spec:patch,p_decision:button?.value||'propose'});
      if(error)throw error;
      if(state.companyId===company){toast('Build review saved.');await refresh();window.dispatchEvent(new CustomEvent('nexus:delivery-changed',{detail:{companyId:company}}));if(button.hasAttribute('data-create-build-plan')){if(state.admin)await window.NexusAdminJourney?.navigate('scope');else await window.NexusClientShell?.activateView('scope')}}
    }catch(error){toast(error.message||'The Build could not be saved.')}finally{controls.filter(n=>n.isConnected).forEach(n=>n.disabled=false)}
  });
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||button.closest('form'))return;
    if(button.hasAttribute('data-build-refresh'))return refresh();
    const company=state.companyId;if(company!==companyId||loading)return;
    button.disabled=true;const originalLabel=button.textContent;const message=root.querySelector('[data-build-message]');if(message){message.textContent='';message.hidden=true}
    try{
      if(button.hasAttribute('data-continue-original')){if(state.admin)await window.NexusAdminJourney?.openPackage(button.dataset.continueOriginal,'progress');else await window.NexusClientShell?.openPackage(button.dataset.continueOriginal,'progress');return;}
      if(button.dataset.interest){const {error}=await sb.rpc('relystra_build_interest',{p_company_id:company,p_build_id:button.dataset.build,p_intent:button.dataset.interest,p_note:''});if(error)throw error;toast('Your preference is recorded. Your existing scope continues.');}
      else if(button.dataset.balance){const {error}=await sb.rpc('relystra_create_balance_plan',{p_plan_id:button.dataset.balance});if(error)throw error;stage='scope';}
      else if(button.hasAttribute('data-generate-builds')){
        button.textContent='Preparing evidence-backed recommendations…';
        const data=await requestBuildRecommendations(sb,company,diagnosis?.id,p=>{if(button.isConnected)button.textContent=`Reviewing Library · ${p.reviewed_batches} batches · ${p.count} qualified recommendations`;});
        if(state.companyId===company)toast(`${data.build_ids?.length||0} recommendations ready for review.`);
      }else if(button.hasAttribute('data-create-build-plan')){
        const {error}=await sb.rpc('relystra_create_build_plan',{p_company_id:company,p_build_ids:[...selected],p_name:'Additional implementation scope'});if(error)throw error;selected.clear();stage='scope';
      }else if(button.dataset.planCheckout||button.dataset.planCancel){
        const {data,error}=await sb.functions.invoke('nexus-diagnosis-execute?handler=checkout',{body:{plan_id:button.dataset.planCheckout||button.dataset.planCancel,operation:button.dataset.planCancel?'cancel':'checkout'}});
        if(error||data?.error)throw await runtimeError(error,data);
        if(state.companyId!==company)return;
        if(data.url){const destination=new URL(data.url);if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw new Error('Unexpected checkout destination.');location.assign(destination.href);return}
        toast(data.status==='processing'?'Payment is being verified. Refresh this plan shortly.':data.status==='paid'?'Payment confirmed.':'Plan updated.');
      }else return;
      if(state.companyId===company){await refresh();window.dispatchEvent(new CustomEvent('nexus:delivery-changed',{detail:{companyId:company}}));if(button.hasAttribute('data-create-build-plan')){if(state.admin)await window.NexusAdminJourney?.navigate('scope');else await window.NexusClientShell?.activateView('scope')}}
    }catch(error){const text=error.message||'Builds could not be updated.';toast(text);if(company===state.companyId&&message?.isConnected){message.textContent=text;message.hidden=false}}finally{if(button.isConnected){button.disabled=false;button.textContent=originalLabel}}
  });
  return {refresh,destroy(){sequence++;root.replaceChildren()}};
}
