// Rendering and transitions for the existing Actions screen, using nexus_tasks throughout.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owner=party=>({client:'Client',admin:'Admin',ai:'AI / System'}[party]||'Admin');
const done=task=>['completed','approved','done'].includes(task.status);

export function prebuildActionCard(task,documents=[]){
  const proposed=task.action_review_state!=='approved';
  const files=documents.filter(doc=>doc.task_id===task.id&&doc.company_id===task.company_id);
  const source=task.source_finding_refs?.[0];
  return `<article class="action-v2-card relystra-prebuild-action" data-prebuild-id="${esc(task.id)}">
    <div class="action-v2-tags"><span>${esc(owner(task.responsible_party))}</span><span>${esc(proposed?task.action_review_state:done(task)?'Completed':task.status.replaceAll('_',' '))}</span></div>
    <h3>${esc(task.title)}</h3><p>${esc(task.description||'')}</p><p>${esc(task.instructions||'')}</p>
    <div class="small">Done when: ${(task.completion_criteria||[]).map(esc).join(' · ')||'Relystra accepts the submitted input.'}</div>
    ${source?`<details><summary>Diagnosis source</summary><p>${esc(source.snapshot?.description||source.snapshot?.instructions||source.snapshot?.title||source.path)}</p><small>${esc(source.ref)}</small></details>`:''}
    ${Object.keys(task.response_data||{}).length?`<details open><summary>Submitted input</summary>${Object.entries(task.response_data).map(([key,value])=>`<p><b>${esc(key.replaceAll('_',' '))}</b><br>${esc(typeof value==='object'?JSON.stringify(value):value)}</p>`).join('')}</details>`:''}
    ${files.map(file=>`<button class="btn secondary" data-prebuild-file="${esc(file.id)}" type="button">${esc(file.file_name)}</button>`).join('')}
    ${task.review_note?`<p><b>Review note</b><br>${esc(task.review_note)}</p>`:''}
    ${done(task)?`<p class="small">Completed ${esc(new Date(task.completed_at||task.updated_at).toLocaleString())}. Inputs and diagnosis references remain available.</p>`:''}
    ${!done(task)&&task.status!=='ready_for_review'?`<details><summary>Edit action and owner</summary>
      <label>Title<input data-action-field="title" value="${esc(task.title)}"></label>
      <label>Instructions<textarea data-action-field="instructions">${esc(task.instructions||'')}</textarea></label>
      <label>Owner<select data-action-field="responsible_party">${['client','admin','ai'].map(p=>`<option value="${p}" ${task.responsible_party===p?'selected':''}>${owner(p)}</option>`).join('')}</select></label>
      <label>Due date<input type="date" data-action-field="due_date" value="${esc(task.due_date||'')}"></label>
      <button class="btn secondary" data-prebuild-decision="edit" type="button">Save changes</button></details>`:''}
    <div class="action-v2-actions">${proposed?'<button class="btn primary" data-prebuild-decision="approve" type="button">Approve Action</button><button class="btn secondary" data-prebuild-decision="postpone" type="button">Postpone</button><button class="btn secondary" data-prebuild-decision="reject" type="button">Reject</button>':
      task.status==='ready_for_review'?'<button class="btn primary" data-prebuild-review="accept" type="button">Accept input</button><button class="btn secondary" data-prebuild-review="revise" type="button">Request clarification</button>':
      !done(task)&&task.responsible_party==='admin'?'<label>Evidence and conclusion<textarea data-internal-response></textarea></label><button class="btn primary" data-prebuild-submit type="button">Submit for review</button>':
      !done(task)&&task.responsible_party==='ai'?'<button class="btn primary" data-prebuild-ai type="button">Prepare with AI</button>':''}</div>
  </article>`;
}

export function bindPrebuildActions(root,portal,refresh){
  const {sb,state,toast}=portal;
  root.querySelectorAll('[data-prebuild-id]').forEach(card=>{
    const task=state.tasks.find(row=>row.id===card.dataset.prebuildId);
    card.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button||!task)return;
      const companyId=state.companyId;
      try{
        if(button.dataset.prebuildFile)return await portal.downloadDocument(button.dataset.prebuildFile);
        const patch=Object.fromEntries([...card.querySelectorAll('[data-action-field]')].map(input=>[input.dataset.actionField,input.value.trim()]));
        let result;
        button.disabled=true;
        if(button.dataset.prebuildDecision)result=await sb.rpc('relystra_review_action',{p_task_id:task.id,p_decision:button.dataset.prebuildDecision,p_patch:patch});
        else if(button.dataset.prebuildReview){
          const note=button.dataset.prebuildReview==='revise'?prompt('What information needs clarification?'):null;
          if(button.dataset.prebuildReview==='revise'&&!note?.trim())return;
          result=await sb.rpc(button.dataset.prebuildReview==='revise'?'nexus_request_task_revision':'nexus_approve_task',{p_task_id:task.id,p_note:note});
        }else if(button.hasAttribute('data-prebuild-submit'))result=await sb.rpc('relystra_submit_internal_action',{p_task_id:task.id,p_expected_at:task.updated_at,p_response:{response:card.querySelector('[data-internal-response]')?.value.trim()||''}});
        else if(button.hasAttribute('data-prebuild-ai'))result=await sb.functions.invoke('nexus-diagnosis-execute',{body:{operation:'prepare_action',task_id:task.id}});
        else return;
        if(result?.error||result?.data?.ok===false)throw new Error(result?.data?.error||result?.error?.message||'Action could not be updated.');
        if(state.companyId===companyId){toast('Action updated.');await portal.workspace();refresh()}
      }catch(error){toast(error.message||'Action could not be updated.')}finally{if(button.isConnected)button.disabled=false}
    });
  });
}

export async function openPrebuildActionCreator(portal,refresh){
  const {sb,state,toast}=portal;
  if(!state.admin||!state.companyId)return;
  const companyId=state.companyId;
  try{
    const [catalog,diagnoses]=await Promise.all([
      sb.from('nexus_action_templates').select('*').eq('active',true).eq('workflow_metadata->>work_kind','prebuild_action').order('sort_order'),
      sb.from('nexus_diagnosis_runs').select('id,created_at,analysis_result').eq('company_id',companyId).eq('status','approved').order('created_at',{ascending:false})
    ]);
    if(catalog.error||diagnoses.error)throw new Error(catalog.error?.message||diagnoses.error?.message);
    if(state.companyId!==companyId)return;
    const templates=catalog.data||[],sources=[];
    for(const run of diagnoses.data||[])for(const collection of ['client_action_items','nexus_actions'])
      for(const [index,action] of (run.analysis_result?.[collection]||[]).entries())if(action?.title)
        sources.push({run:run.id,path:`${collection}/${index}`,title:action.title,date:run.created_at});
    if(!templates.length||!sources.length)return toast('An approved diagnosis with source actions is required before adding pre-build work.');
    document.getElementById('relystraCreateAction')?.remove();
    const dialog=document.createElement('dialog');dialog.id='relystraCreateAction';dialog.className='modal-card';
    dialog.style.cssText='width:min(640px,calc(100vw - 32px));max-height:90dvh;overflow:auto;color:var(--text,#fff);background:var(--panel,#171523);border:1px solid #575160;border-radius:16px';
    dialog.innerHTML=`<form><h2>Add pre-build Action</h2><p>Adapt a template to an approved diagnosis. The Action stays suggested until you approve it.</p>
      <label>Diagnosis source<select name="source">${sources.map((s,i)=>`<option value="${i}">${esc(s.title)} · ${esc(new Date(s.date).toLocaleDateString())}</option>`).join('')}</select></label>
      <label>Action template<select name="template">${templates.map(t=>`<option value="${esc(t.code)}">${esc(t.category)} · ${esc(t.title)}</option>`).join('')}</select></label>
      <label>Title<input name="title" required maxlength="300"></label>
      <label>Instructions<textarea name="instructions" required rows="5"></textarea></label>
      <label>Owner<select name="responsible_party"><option value="client">Client</option><option value="admin">Admin</option><option value="ai">AI / System</option></select></label>
      <label>Due date<input name="due_date" type="date"></label><p role="status"></p>
      <button class="btn primary" type="submit">Create suggested Action</button> <button class="btn secondary" type="button" data-close>Cancel</button></form>`;
    document.body.appendChild(dialog);
    const form=dialog.querySelector('form'),field=name=>form.elements.namedItem(name),requestId=crypto.randomUUID();
    const applyTemplate=()=>{const t=templates.find(t=>t.code===field('template').value);field('title').value=t.title;field('instructions').value=t.instructions||'';field('responsible_party').value=t.workflow_metadata.responsible_party};
    field('template').onchange=applyTemplate;applyTemplate();
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;
      try{
        if(state.companyId!==companyId)throw new Error('The workspace changed. Close this form and try again.');
        const source=sources[Number(field('source').value)];
        const {error}=await sb.rpc('relystra_create_template_action',{p_company_id:companyId,p_run_id:source.run,p_source_path:source.path,p_template_code:field('template').value,p_request_id:requestId,
          p_patch:Object.fromEntries(['title','instructions','responsible_party','due_date'].map(name=>[name,field(name).value.trim()]))});
        if(error)throw error;
        dialog.close();toast('Suggested Action created. Review and approve it before work begins.');
        if(state.companyId===companyId){await portal.workspace();refresh()}
      }catch(error){form.querySelector('[role="status"]').textContent=error.message||'Action could not be created.'}finally{button.disabled=false}
    };
    dialog.showModal();
  }catch(error){toast(error.message||'Action templates could not be loaded.')}
}
