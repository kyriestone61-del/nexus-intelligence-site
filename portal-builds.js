// Build selection and curation component, mounted by the existing admin/client workspace owners.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=v=>Array.isArray(v)?v:[];
const money=(cents,currency='usd')=>new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(cents||0)/100);
const lines=value=>String(value||'').split('\n').map(v=>v.trim()).filter(Boolean);
const description=(title,values)=>list(values).length?`<div><b>${esc(title)}</b><ul>${values.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></div>`:'';
const field=(name,label,value,type='text',attrs='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area=(name,label,value)=>`<label>${esc(label)}<textarea name="${name}" rows="3">${esc(Array.isArray(value)?value.join('\n'):value||'')}</textarea></label>`;

function menuCard(build,selected,menu){
  return `<article class="relystra-build-card"><label class="relystra-build-selection"><input type="checkbox" data-build-select="${esc(build.id)}" ${selected.has(build.id)?'checked':''}><span><b>${esc(build.name)}</b><strong>${esc(money(build.price_cents,build.currency))}</strong></span></label>
    <p>${esc(build.outcome)}</p><p class="small">Estimated build time: ${esc(build.duration_min)}–${esc(build.duration_max)} business days</p>
    <details><summary>Scope and what to expect</summary>${description('Included',build.scope_in)}${description('Outside this Build',build.scope_out)}${description('Required inputs',build.inputs)}${description('Acceptance criteria',build.acceptance_criteria)}${description('Assumptions',build.assumptions)}</details>
    ${list(build.dependencies).length?description('Required Builds',build.dependencies.map(id=>menu.find(b=>b.id===id)?.name||'A prerequisite outside this menu; Relystra will confirm its delivery.')):''}
  </article>`;
}

function reviewCard(row,settings,opportunities){
  const spec=row.build_spec||{},scores=list(spec.complexity_scores).length===5?spec.complexity_scores:[1,1,1,1,1];
  const dimensions=['Input formats and count','Users and permissions','Automation depth','Integrations and tools','Operational risk'];
  return `<details class="relystra-build-card" ${row.build_review_state==='proposed'?'open':''}><summary><b>${esc(row.title)}</b> · ${esc(row.build_review_state)}</summary>
    <form data-build-review="${esc(row.id)}"><p>${esc(spec.problem)}</p>
      <details><summary>Diagnosis and accepted inputs</summary>${list(spec.source_finding_refs).map(ref=>`<p>${esc(ref.snapshot?.description||ref.snapshot?.problem||ref.snapshot?.title||ref.path)}</p><small>${esc(ref.ref)}</small>`).join('')}<p>Accepted input references: ${list(spec.completed_action_ids).map(esc).join(', ')||'Diagnosis evidence only'}</p></details>
      ${field('name','Build name',row.title)}${area('outcome','Expected outcome',spec.outcome)}
      ${area('scope_in','Included scope — one item per line',spec.scope_in)}${area('scope_out','Excluded scope — one item per line',spec.scope_out)}
      ${area('required_inputs','Required inputs — one per line',spec.required_inputs)}${area('acceptance_criteria','Acceptance criteria — one per line',spec.acceptance_criteria)}${area('assumptions','Assumptions — one per line',spec.assumptions)}
      <label>Priority<select name="priority">${['high','medium','low'].map(v=>`<option ${spec.priority===v?'selected':''}>${v}</option>`).join('')}</select></label>
      ${area('priority_reason','Why this priority',spec.priority_reason)}
      <fieldset><legend>Complexity</legend>${dimensions.map((label,i)=>`<label>${label}<select name="score_${i}">${[1,2,3].map(v=>`<option value="${v}" ${Number(scores[i])===v?'selected':''}>${v} — ${['Low','Moderate','High'][v-1]}</option>`).join('')}</select></label>`).join('')}
      <p data-complexity-guidance class="small"></p><label>Confirmed complexity<select name="complexity"><option value="">Choose after reviewing the scores</option>${['simple','standard','advanced'].map(v=>`<option value="${v}" ${spec.complexity===v?'selected':''}>${v}</option>`).join('')}</select></label></fieldset>
      <div class="relystra-build-fields">${field('price','Fixed price ('+settings.currency.toUpperCase()+')',spec.price_cents?spec.price_cents/100:'','number','min="0.01" step="0.01"')}
      ${field('duration_min','Minimum business days',spec.duration_min||'','number','min="1" step="1"')}${field('duration_max','Maximum business days',spec.duration_max||'','number','min="1" step="1"')}</div>
      <fieldset><legend>Dependencies</legend>${opportunities.filter(o=>o.id!==row.id&&o.build_review_state==='approved').map(o=>`<label><input type="checkbox" name="dependency" value="${esc(o.id)}" ${list(spec.dependencies).includes(o.id)?'checked':''}> ${esc(o.title)}</label>`).join('')||'<p class="small">No other approved Builds yet.</p>'}</fieldset>
      <div class="relystra-build-buttons"><button class="btn primary" name="decision" value="approve">Approve for client</button><button class="btn secondary" name="decision" value="propose">Save draft</button><button class="btn secondary" name="decision" value="postpone">Postpone</button><button class="btn secondary" name="decision" value="reject">Reject</button></div>
    </form></details>`;
}

function planCard(plan){
  return `<article class="relystra-build-card"><h3>${esc(plan.name)}</h3><p><b>${esc(money(plan.total_cents,plan.currency))}</b> · ${esc(plan.status.replaceAll('_',' '))}${plan.checkout_livemode===false?' · Test payment':''}</p>
    <ul>${list(plan.items).map(i=>`<li>${esc(i.name)} — ${esc(money(i.price_cents,plan.currency))}</li>`).join('')}</ul>
    ${plan.purchase_kind==='build_package'?`<p>Package estimate: <b>${esc(plan.duration_min)}–${esc(plan.duration_max)} business days</b>, including dependencies, capacity, QA and client review.</p><p class="small">Starts after Build briefs and required access are approved.</p>`:''}
    ${plan.status==='awaiting_payment'?`<div class="relystra-build-buttons"><button class="btn primary" type="button" data-plan-checkout="${esc(plan.id)}">Approve plan & continue to payment</button><button class="btn secondary" type="button" data-plan-cancel="${esc(plan.id)}">Cancel unpaid plan</button></div>`:''}
  </article>`;
}

export function mountBuilds(root,portal){
  const {sb,state,toast}=portal;
  let sequence=0,selected=new Set(),companyId=null,menu=[],plans=[],opportunities=[],settings=null,diagnosis=null,loading=false;
  async function refresh(){
    const company=state.companyId,version=++sequence;
    if(company!==companyId){selected=new Set();companyId=company;menu=[];plans=[];opportunities=[];diagnosis=null}
    if(!company){root.innerHTML='<p>Open a client workspace to review Builds.</p>';return}
    loading=true;root.setAttribute('aria-busy','true');
    try{
      const results=await Promise.all([
        sb.rpc('relystra_build_menu',{p_company_id:company}),
        sb.from('nexus_build_plans').select('*').eq('company_id',company).neq('status','cancelled').order('created_at',{ascending:false}),
        ...(state.admin?[
          sb.from('nexus_opportunities').select('*').eq('company_id',company).not('build_spec','is',null).order('created_at',{ascending:true}),
          sb.from('nexus_delivery_settings').select('*').single(),
          sb.from('nexus_diagnosis_runs').select('id,status').eq('company_id',company).eq('status','approved').order('created_at',{ascending:false}).limit(1).maybeSingle(),
        ]:[]),
      ]);
      if(version!==sequence||state.companyId!==company)return;
      const failed=results.find(result=>result.error);if(failed)throw failed.error;
      menu=results[0].data||[];plans=results[1].data||[];opportunities=results[2]?.data||[];settings=results[3]?.data;diagnosis=results[4]?.data;
      selected=new Set([...selected].filter(id=>menu.some(build=>build.id===id)));render();
    }catch(error){if(version===sequence&&state.companyId===company){root.innerHTML=`<p role="alert">${esc(error.message||'Builds could not be loaded.')}</p><button class="btn secondary" data-build-refresh>Retry</button>`}}
    finally{if(version===sequence){loading=false;root.removeAttribute('aria-busy')}}
  }
  function render(){
    const reserved=new Set(plans.filter(p=>p.status==='awaiting_payment').flatMap(p=>list(p.items).map(i=>i.id)));
    const available=menu.filter(b=>!reserved.has(b.id));
    root.innerHTML=`<header class="nexus-client-page-head"><div><div class="eyebrow">Builds</div><h1>Choose what we build next.</h1><p>Review the scope, fixed price and expected outcome. Your selected Builds become one paid package.</p></div><button class="btn secondary" data-build-refresh type="button">Refresh</button></header>
      ${state.admin?`<section><h2>Review recommendations</h2><p>Confirm the scope, complexity, fixed price and duration before a Build reaches the client.</p><button class="btn primary" data-generate-builds type="button" ${diagnosis?'':'disabled'}>Generate from accepted evidence</button>${!diagnosis?'<p class="small">Approve the diagnosis and finish the required pre-build Actions first.</p>':''}<div class="relystra-build-grid">${opportunities.filter(o=>!plans.some(p=>p.status==='paid'&&p.items.some(i=>i.id===o.id))).map(o=>reviewCard(o,settings,opportunities)).join('')}</div></section>`:''}
      ${plans.length?`<section><h2>Saved Build Plans</h2><div class="relystra-build-grid">${plans.map(planCard).join('')}</div></section>`:''}
      <section><h2>${state.admin?'Client Build Menu':'Recommended Builds'}</h2><div class="relystra-build-grid">${available.map(b=>menuCard(b,selected,menu)).join('')||'<p>Your approved recommendations will appear here. Relystra will let you know when they are ready.</p>'}</div>
      ${available.length?'<div class="relystra-build-selection-total" role="status" aria-live="polite"></div><button class="btn primary" type="button" data-create-build-plan>Review selected Build Plan</button>':''}</section>`;
    updateSelection();root.querySelectorAll('[data-build-review]').forEach(form=>updateComplexity(form));
  }
  function updateSelection(){
    const chosen=menu.filter(b=>selected.has(b.id));
    const total=root.querySelector('.relystra-build-selection-total');
    if(total)total.textContent=`${chosen.length} selected · ${money(chosen.reduce((n,b)=>n+b.price_cents,0),chosen[0]?.currency||'usd')}`;
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
    const patch={name:read('name'),outcome:read('outcome'),scope_in:lines(read('scope_in')),scope_out:lines(read('scope_out')),
      required_inputs:lines(read('required_inputs')),acceptance_criteria:lines(read('acceptance_criteria')),assumptions:lines(read('assumptions')),
      priority:read('priority'),priority_reason:read('priority_reason'),complexity_scores:[0,1,2,3,4].map(i=>Number(read(`score_${i}`))),
      complexity:read('complexity'),price_cents:Math.round(Number(read('price'))*100),currency:settings.currency,
      duration_min:Number(read('duration_min')),duration_max:Number(read('duration_max')),dependencies:data.getAll('dependency')};
    const controls=[...form.querySelectorAll('button,input,textarea,select')];controls.forEach(n=>n.disabled=true);
    try{
      const {error}=await sb.rpc('relystra_save_build',{p_company_id:company,p_id:form.dataset.buildReview,p_spec:patch,p_decision:button?.value||'propose'});
      if(error)throw error;
      if(state.companyId===company){toast('Build review saved.');await refresh();window.dispatchEvent(new CustomEvent('nexus:delivery-changed',{detail:{companyId:company}}))}
    }catch(error){toast(error.message||'The Build could not be saved.')}finally{controls.filter(n=>n.isConnected).forEach(n=>n.disabled=false)}
  });
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||button.closest('form'))return;
    if(button.hasAttribute('data-build-refresh'))return refresh();
    const company=state.companyId;if(company!==companyId||loading)return;
    button.disabled=true;
    try{
      if(button.hasAttribute('data-generate-builds')){
        button.textContent='Preparing evidence-backed recommendations…';
        const {data,error}=await sb.functions.invoke('nexus-diagnosis-execute',{body:{operation:'recommend_builds',company_id:company,run_id:diagnosis?.id}});
        if(error||data?.ok===false)throw new Error(data?.error||error?.message);
        if(state.companyId===company)toast(`${data.build_ids?.length||0} recommendations ready for review.`);
      }else if(button.hasAttribute('data-create-build-plan')){
        const {error}=await sb.rpc('relystra_create_build_plan',{p_company_id:company,p_build_ids:[...selected],p_name:'Build Package'});if(error)throw error;selected.clear();
      }else if(button.dataset.planCheckout||button.dataset.planCancel){
        const {data,error}=await sb.functions.invoke('nexus-diagnosis-execute?handler=checkout',{body:{plan_id:button.dataset.planCheckout||button.dataset.planCancel,operation:button.dataset.planCancel?'cancel':'checkout'}});
        if(error||data?.error)throw new Error(data?.message||error?.message||'Checkout could not be updated.');
        if(state.companyId!==company)return;
        if(data.url){const destination=new URL(data.url);if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw new Error('Unexpected checkout destination.');location.assign(destination.href);return}
        toast(data.status==='processing'?'Payment is being verified. Refresh this plan shortly.':data.status==='paid'?'Payment confirmed.':'Plan updated.');
      }else return;
      if(state.companyId===company){await refresh();window.dispatchEvent(new CustomEvent('nexus:delivery-changed',{detail:{companyId:company}}))}
    }catch(error){toast(error.message||'Builds could not be updated.')}finally{if(button.isConnected)button.disabled=false}
  });
  return {refresh,destroy(){sequence++;root.replaceChildren()}};
}
