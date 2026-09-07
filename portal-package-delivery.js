// Purchased Build delivery UI. The existing shell chooses the workspace and owns navigation.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const lines=v=>String(v||'').split('\n').map(s=>s.trim()).filter(Boolean);
const area=(key,label,value,required=false)=>`<label>${esc(label)}<textarea name="${key}" rows="3" ${required?'required':''}>${esc(Array.isArray(value)?value.join('\n'):value||'')}</textarea></label>`;
const input=(key,label,value,type='text')=>`<label>${esc(label)}<input name="${key}" type="${type}" value="${esc(value)}"></label>`;
const bullet=(label,values)=>arr(values).length?`<div><b>${esc(label)}</b><ul>${values.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></div>`:'';
const link=(url,label)=>{try{return new URL(url).protocol==='https:'?`<a class="btn secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:''}catch{return''}};
const briefFields=[['tools_platforms','Tools and platforms'],['users_roles','Users and roles'],['automation_requirements','Automation requirements'],['integrations','Integrations'],['assumptions','Assumptions'],['risks','Risks'],['test_inputs','Representative test inputs']];
const qaFields=['functionality','outputs','permissions','integrations','links','error_states','input_validation','data_behavior','mobile_usability','client_usability','documentation','faq','support_grounding'];
const label=s=>({briefs:'Preparing Builds',ready:'Ready to build',internal_qa:'Internal review',client_review:'Client review',final_qa:'Final delivery checks',faq:'FAQ',support_grounding:'Support sources',completed:'Completed'}[s]||s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()));

function briefCard(build){
  const raw=build.build_brief||{},scope=raw.scope||{};
  const b={problem:scope.problem,desired_outcome:scope.outcome,approved_scope:scope.scope_in,exclusions:scope.scope_out,success_criteria:scope.acceptance_criteria,diagnosis_source:scope.source_finding_refs,required_inputs:scope.inputs,price_cents:scope.price_cents,currency:scope.currency,duration_min:scope.duration_min,duration_max:scope.duration_max,...raw};
  return `<details class="relystra-build-card" ${build.brief_approved_at?'':'open'}><summary><b>${esc(build.name)}</b> · ${build.brief_approved_at?'Brief approved':'Brief needs review'}</summary>
    <p>${esc(b.problem)}</p><p>${esc(b.desired_outcome)}</p>${bullet('Purchased scope',b.approved_scope)}${bullet('Excluded',b.exclusions)}${bullet('Success criteria',b.success_criteria)}${bullet('Required inputs',b.required_inputs)}<p>Fixed price: ${esc(new Intl.NumberFormat(undefined,{style:'currency',currency:b.currency||'usd'}).format(Number(b.price_cents||0)/100))} · ${esc(b.duration_min)}–${esc(b.duration_max)} business days</p>
    <details><summary>Retained source evidence</summary>${arr(b.diagnosis_source).map(r=>`<p>${esc(r.snapshot?.title||r.snapshot?.problem||r.path)}</p>`).join('')}${arr(b.supplied_inputs).map(i=>`<p>${esc(i.title)} — accepted ${esc(i.accepted_at)}</p>`).join('')}</details>
    ${build.brief_approved_at?briefFields.map(([key,title])=>bullet(title,b[key])).join(''):`<form data-delivery-form="brief" data-build="${esc(build.id)}"><p>One item per line. Record “None” where a requirement does not apply.</p>${briefFields.map(([key,title])=>area(key,title,b[key],true)).join('')}${area('checklist','Internal Build checklist — leave blank to use the approved template',b.checklist)}<div class="relystra-build-buttons"><button class="btn secondary" name="decision" value="save">Save brief</button><button class="btn primary" name="decision" value="approve">Approve brief & create internal tasks</button></div></form>`}</details>`;
}

function contentForm(build,docs){
  const c=build.delivery_content||{},t=c.tutorial||{};
  return `<details class="relystra-build-card"><summary>Delivery materials · ${esc(build.name)}</summary><form data-delivery-form="content" data-build="${esc(build.id)}">
    ${area('description','What this Build does',c.description,true)}${input('preview_url','Build or preview link',c.preview_url,'url')}${input('walkthrough_url','Optional walkthrough link',c.walkthrough_url,'url')}
    ${area('what_to_test','What the client should test — one step per line',c.what_to_test,true)}
    <fieldset><legend>Usage tutorial</legend>${area('tutorial_what','What it does',t.what,true)}${area('tutorial_steps','How to use it — one step per line',t.steps,true)}${area('tutorial_when','When to use it',t.when,true)}${area('tutorial_troubleshooting','If something goes wrong',t.troubleshooting,true)}</fieldset>
    <fieldset data-faq-list><legend>Frequently asked questions</legend>${(arr(c.faq).length?c.faq:[{}]).map((faq,i)=>faqFields(faq,i)).join('')}</fieldset><button class="btn secondary" type="button" data-add-faq>Add FAQ</button>
    ${area('known_limitations','Known limitations — one per line',c.known_limitations)}
    <fieldset><legend>Shared supporting files</legend>${docs.map(d=>`<label><input type="checkbox" name="supporting_file" value="${esc(d.id)}" ${arr(c.supporting_files).includes(d.id)?'checked':''}> ${esc(d.file_name||'Shared file')}</label>`).join('')||'<p>Upload shared files in Files before attaching them here.</p>'}</fieldset>
    <p class="small">Saving changes requires fresh QA and client approval of the changed Build.</p><button class="btn primary">Save delivery materials</button></form></details>`;
}
function faqFields(faq,i){return `<div data-faq-row>${input('faq_question_'+i,'Question',faq.question)}${area('faq_answer_'+i,'Answer',faq.answer)}</div>`}
function qaForm(build,kind){
  const evidence=build[kind==='final'?'final_qa':'internal_qa'];
  return `<details class="relystra-build-card"><summary>${kind==='final'?'Final':'Internal'} QA · ${esc(build.name)}${evidence?' · recorded':''}</summary>
    <form data-delivery-form="qa" data-build="${esc(build.id)}" data-kind="${kind}"><p>Record the actual test result and evidence for each check.</p>
    ${qaFields.slice(0,kind==='final'?13:10).map(key=>`<fieldset><legend>${esc(label(key))}</legend><label>Result<select name="${key}_status" required><option value="">Choose a result</option><option value="pass">Passed</option>${['functionality','outputs','client_usability','documentation','faq','support_grounding'].includes(key)?'':'<option value="not_applicable">Not applicable — explain why</option>'}</select></label>${area(key+'_evidence','Test evidence or reason',null,true)}</fieldset>`).join('')}
    <button class="btn primary">Record ${kind==='final'?'final':'internal'} QA</button></form></details>`;
}
function deliveredCard(item,draftId,reviewable,status){
  const c=item.content||{},t=c.tutorial||{};
  return `<article class="relystra-build-card"><h2>${esc(item.name)}</h2><p>${esc(item.outcome)}</p><p>${esc(c.description)}</p><div class="relystra-build-buttons">${link(c.preview_url,'Open Build')}${link(c.walkthrough_url,'Watch walkthrough')}</div>
    ${bullet('What to test',c.what_to_test)}<details ${draftId?'':'open'}><summary>Usage guide</summary><p>${esc(t.what)}</p>${bullet('How to use it',t.steps)}<p><b>When:</b> ${esc(t.when)}</p><p><b>Troubleshooting:</b> ${esc(t.troubleshooting)}</p></details>
    <details><summary>FAQs and limitations</summary>${arr(c.faq).map(f=>`<h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p>`).join('')}${bullet('Known limitations',c.known_limitations)}</details>
    ${arr(c.supporting_files).length?'<p>Supporting files are available in Files.</p>':''}
    ${draftId&&reviewable&&status==='revision'?'<p role="status">Your feedback has been received. Relystra will review the scope and prepare the next draft.</p>':''}
    ${reviewable&&status==='ready_for_review'?`<form data-delivery-form="review" data-build="${esc(item.build_id)}" data-draft="${esc(draftId)}">${area('feedback','Feedback — required for a revision or problem','')}<div class="relystra-build-buttons"><button class="btn primary" name="decision" value="approve">Approve Build</button><button class="btn secondary" name="decision" value="minor_revision">Request minor revision</button><button class="btn secondary" name="decision" value="problem">Report a problem</button></div></form>`:''}</article>`;
}

export function mountPackageDelivery(root,portal){
  const {sb,state}=portal;let sequence=0,company=null,projectId=null,section='progress',project=null,progress=null,builds=[],tasks=[],requests=[],docs=[],busy=false;
  async function refresh(options={}){
    if('projectId' in options)projectId=options.projectId;if(options.section)section=options.section;
    const co=state.companyId,id=projectId,version=++sequence;company=co;
    root.setAttribute('aria-busy','true');
    if(!co||!id){root.innerHTML='<p>Choose a paid Build Package to see its delivery progress.</p>';root.removeAttribute('aria-busy');return}
    try{
      const rows=await Promise.all([
        sb.from('nexus_projects').select('id,name,company_id,project_type,package_stage,draft_package,final_package,support_starts_at,support_ends_at').eq('company_id',co).eq('id',id).single(),
        sb.rpc('relystra_package_progress',{p_project_id:id}),
        sb.from('nexus_client_requests').select('id,title,status,description,support_answer,support_context,created_at').eq('company_id',co).eq('project_id',id).not('support_context','is',null).order('created_at',{ascending:false}),
        ...(state.admin?[
          sb.from('nexus_system_cards').select('*').eq('company_id',co).eq('project_id',id).not('opportunity_id','is',null).order('created_at'),
          sb.from('nexus_tasks').select('id,build_id,title,status,dependency_task_id,sort_order').eq('company_id',co).eq('project_id',id).eq('work_kind','build_task').is('archived_at',null).order('sort_order'),
          sb.from('nexus_documents').select('id,file_name').eq('company_id',co).or(`project_id.is.null,project_id.eq.${id}`).in('document_area',['nexus_shared','company_library']).neq('status','archived'),
        ]:[]),
      ]);
      if(version!==sequence||co!==state.companyId)return;
      const error=rows.find(r=>r.error)?.error;if(error)throw error;
      [project,progress,requests,builds,tasks,docs]=rows.map(r=>r.data);builds=builds||[];tasks=tasks||[];docs=docs||[];render();
    }catch(error){if(version===sequence)root.innerHTML=`<p role="alert">${esc(error.message||'Delivery could not be loaded.')}</p><button class="btn secondary" data-delivery-refresh>Retry</button>`}
    finally{if(version===sequence)root.removeAttribute('aria-busy')}
  }
  function render(){
    if(section==='support')return renderSupport();
    const expanded=new Set([...root.querySelectorAll('details[open]')].map(el=>el.querySelector('summary')?.textContent));
    const final=section==='final-package',pkg=final?project.final_package:project.draft_package;
    root.innerHTML=`<header><h1>${esc(final?'Final Package':project.name)}</h1><p>${esc(label(project.package_stage||'Preparing delivery'))}${progress.livemode===false?' · Test package':''}</p>${!state.admin&&project.package_stage==='final_qa'?'<p>Your approval is recorded. Relystra is completing the final delivery checks.</p>':''}<button class="btn secondary" data-delivery-refresh>Refresh</button></header>
      ${!final?`<label>Package progress <b>${progress.percent}%</b><progress max="100" value="${progress.percent}">${progress.percent}%</progress></label><div class="relystra-build-grid">${arr(progress.builds).map(b=>`<article class="relystra-build-card"><b>${esc(b.name)}</b><p>${esc(label(b.status||b.stage||'Preparing'))} · ${b.percent}%</p></article>`).join('')}</div>`:''}
      ${pkg?`<section><h2>${final?'Delivered Builds':'Draft Package'}</h2><div class="relystra-build-grid">${arr(pkg.items).map(i=>deliveredCard(i,final?null:pkg.id,!state.admin&&!final&&['client_review','revisions'].includes(project.package_stage),arr(progress.builds).find(b=>b.id===i.build_id)?.status)).join('')}</div></section>`:final?'<p>The Final Package becomes available after client approval and final QA.</p>':''}
      ${state.admin&&!final?`<section><h2>Build Briefs</h2>${builds.map(briefCard).join('')}</section>
        <section><h2>Internal Build Tasks</h2>${builds.map(b=>`<details class="relystra-build-card"><summary>${esc(b.name)}</summary>${tasks.filter(t=>t.build_id===b.id).map(t=>`<label><input type="checkbox" data-build-task="${esc(t.id)}" ${t.status==='completed'?'checked':''} ${!['briefs','building','revisions'].includes(project.package_stage)||(t.dependency_task_id&&tasks.some(d=>d.id===t.dependency_task_id&&d.status!=='completed'))?'disabled':''}>${esc(t.title)}</label>`).join('')||'<p>Approve the brief to generate internal work.</p>'}</details>`).join('')}</section>
        ${builds.filter(b=>b.build_status==='revision'&&!b.revision_resolution).map(b=>`<form class="relystra-build-card" data-delivery-form="revision" data-build="${esc(b.id)}"><h3>Review feedback · ${esc(b.name)}</h3><p>${esc(b.client_review?.note||b.client_review?.feedback)}</p><label>Scope decision<select name="decision"><option value="in_scope">Within purchased scope</option><option value="separate_build">Separate Build required</option><option value="approved_exception">Admin-approved exception</option></select></label>${area('note','Explain the scope decision','',true)}<button class="btn primary">Confirm revision scope</button></form>`).join('')}
        ${['building','internal_qa','revisions'].includes(project.package_stage)?builds.filter(b=>b.brief_approved_at).map(b=>contentForm(b,docs)+qaForm(b,'internal')).join(''):''}
        ${project.package_stage==='final_qa'?builds.map(b=>qaForm(b,'final')).join(''):''}
        <div class="relystra-build-buttons">${['building','internal_qa','revisions'].includes(project.package_stage)?'<button class="btn primary" data-publish="draft">Publish unified Draft Package</button>':''}${project.package_stage==='final_qa'?'<button class="btn primary" data-publish="final">Publish Final Package & start support</button>':''}</div>`:''}`;
    root.querySelectorAll('details').forEach(el=>{if(expanded.has(el.querySelector('summary')?.textContent))el.open=true});
  }
  function renderSupport(){
    root.innerHTML=`<header><h1>Support</h1><p>${project.package_stage==='completed'?'The seven-day light support period has ended. Your materials and request history remain available.':`Light support ends ${esc(new Date(project.support_ends_at).toLocaleDateString())}.`}</p><p>Ask about your delivered Builds. Questions without a verified answer are sent to Relystra for review.</p></header>
      <form data-delivery-form="support">${area('question','Your question','',true)}<button class="btn primary">Ask Relystra</button></form>
      ${arr(requests).map(r=>`<article class="relystra-build-card"><h2>${esc(r.description)}</h2><p>${esc(label(r.status))}</p><p class="relystra-support-answer">${esc(r.support_answer)}</p>${state.admin?`<form data-delivery-form="support-answer" data-request="${esc(r.id)}">${area('answer','Relystra response',r.support_answer,true)}<button class="btn secondary">Save support answer</button></form>`:''}</article>`).join('')}`;
  }
  async function mutate(fn){
    if(busy||company!==state.companyId)return;busy=true;const co=company,id=projectId;
    const disabledStates=[...root.querySelectorAll('button,input,textarea,select')].map(el=>[el,el.disabled]);
    disabledStates.forEach(([el])=>el.disabled=true);
    try{const result=await fn();if(result?.error)throw result.error;if(co!==state.companyId||id!==projectId)return;
      await refresh();window.dispatchEvent(new CustomEvent('relystra:delivery-changed',{detail:{companyId:co,projectId:id}}));
    }catch(error){if(co===state.companyId){portal.toast?.(error.message||'The change could not be saved.');const note=document.createElement('p');note.setAttribute('role','alert');note.textContent=error.message||'The change could not be saved.';root.prepend(note)}}
    finally{busy=false;if(co===state.companyId)disabledStates.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled})}
  }
  const onClick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-delivery-refresh'))refresh();
    if(button.hasAttribute('data-add-faq')){const fieldset=button.form.querySelector('[data-faq-list]');fieldset.insertAdjacentHTML('beforeend',faqFields({},fieldset.querySelectorAll('[data-faq-row]').length))}
    if(button.dataset.publish)mutate(()=>sb.rpc('relystra_publish_'+button.dataset.publish,{p_project_id:projectId}));
  };
  const onChange=event=>{if(event.target.name==='question')delete event.target.form.dataset.turnId;if(event.target.dataset.buildTask){const el=event.target;mutate(()=>sb.rpc('relystra_set_build_task',{p_task_id:el.dataset.buildTask,p_complete:el.checked}))}};
  const onSubmit=event=>{
    const form=event.target.closest('[data-delivery-form]');if(!form)return;event.preventDefault();
    const fd=new FormData(form),get=key=>String(fd.get(key)||'').trim(),type=form.dataset.deliveryForm,build=form.dataset.build,decision=event.submitter?.value;
    if(type==='brief'){const patch=Object.fromEntries(briefFields.map(([key])=>[key,lines(get(key))]));if(get('checklist'))patch.checklist=lines(get('checklist'));return mutate(()=>sb.rpc('relystra_save_brief',{p_build_id:build,p_patch:patch,p_approve:decision==='approve'}))}
    if(type==='content'){
      const content={description:get('description'),preview_url:get('preview_url'),what_to_test:lines(get('what_to_test')),tutorial:{what:get('tutorial_what'),steps:lines(get('tutorial_steps')),when:get('tutorial_when'),troubleshooting:get('tutorial_troubleshooting')},
        faq:[...form.querySelectorAll('[data-faq-row]')].map((_,i)=>({question:get('faq_question_'+i),answer:get('faq_answer_'+i)})).filter(f=>f.question||f.answer),known_limitations:lines(get('known_limitations')),supporting_files:fd.getAll('supporting_file')};
      if(get('walkthrough_url'))content.walkthrough_url=get('walkthrough_url');
      return mutate(()=>sb.rpc('relystra_save_delivery',{p_build_id:build,p_content:content}));
    }
    if(type==='qa')return mutate(()=>sb.rpc('relystra_record_qa',{p_build_id:build,p_kind:form.dataset.kind,p_checks:Object.fromEntries(qaFields.slice(0,form.dataset.kind==='final'?13:10).map(key=>[key,{status:get(key+'_status'),evidence:get(key+'_evidence')}]))}));
    if(type==='review')return mutate(()=>sb.rpc('relystra_review_build',{p_build_id:build,p_draft_id:form.dataset.draft,p_decision:decision,p_note:get('feedback')||null}));
    if(type==='revision')return mutate(()=>sb.rpc('relystra_resolve_revision',{p_build_id:build,p_resolution:get('decision'),p_note:get('note')}));
    if(type==='support-answer')return mutate(()=>sb.rpc('relystra_answer_support',{p_request_id:form.dataset.request,p_answer:get('answer')}));
    if(type==='support'){const turnId=form.dataset.turnId||(form.dataset.turnId=crypto.randomUUID());return mutate(()=>sb.functions.invoke('nexus-diagnosis-execute',{body:{operation:'ask_support',project_id:projectId,question:get('question'),turn_id:turnId}}))}
  };
  root.addEventListener('click',onClick);root.addEventListener('change',onChange);root.addEventListener('submit',onSubmit);
  return {refresh,destroy(){sequence++;root.removeEventListener('click',onClick);root.removeEventListener('change',onChange);root.removeEventListener('submit',onSubmit)}};
}
