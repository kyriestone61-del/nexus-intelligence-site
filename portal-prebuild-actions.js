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
