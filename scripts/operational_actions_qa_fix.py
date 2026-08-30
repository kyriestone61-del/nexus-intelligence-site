from pathlib import Path

p=Path('portal-action-workflow.js')
s=p.read_text()
old="""async function updateTaskStatus(id,status){
  const {error}=await sb.from('nexus_tasks').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message||'Action status could not be updated.');
  await workspace();taskStamp='';
}
"""
new="""async function updateTaskStatus(id,status){
  const task=state.tasks.find(t=>t.id===id);if(!task)return;
  if(!state.admin&&status==='done'){
    if(task.task_type==='preparation_checklist'){
      const remaining=(state.dataRequirements||[]).filter(r=>!addressed(r.status));
      if(remaining.length){taskStamp='';enhanceTaskSection();return toast(`Address ${remaining.length} remaining checklist item${remaining.length===1?'':'s'} before completing this action.`)}
    }
    const schema=Array.isArray(task.form_schema)?task.form_schema:[];const data=task.response_data||{};
    const missing=schema.filter(f=>f.required&&!String(data[f.key]??'').trim());
    if(missing.length){taskStamp='';enhanceTaskSection();return toast('Save the required action responses before marking this complete.')}
  }
  const {error}=await sb.from('nexus_tasks').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error){taskStamp='';enhanceTaskSection();return toast(error.message||'Action status could not be updated.');}
  await workspace();taskStamp='';
}
"""
if old not in s: raise SystemExit('updateTaskStatus block not found')
s=s.replace(old,new)
p.write_text(s)

q=Path('.github/workflows/qa.yml')
y=q.read_text()
start=y.index('      - name: Operational client action assertions\n')
end=y.index('      - name: SMB customer journey assertions\n',start)
block="""      - name: Operational client action assertions
        shell: bash
        run: |
          set -euo pipefail
          grep -Fq 'preparation_checklist' portal-action-workflow.js
          grep -Fq 'workflow_evidence' portal-action-workflow.js
          grep -Fq 'structured_form' portal-action-workflow.js
          grep -Fq 'embedded-checklist' portal-action-workflow.js
          grep -Fq 'nexus_assign_action_template' portal-action-workflow.js
          grep -Fq 'nexus_action_templates' portal-action-workflow.js
          grep -Fq 'nexus_diagnosis_request_drafts' portal-action-workflow.js
          grep -Fq 'nexus_send_diagnosis_request_draft' portal-action-workflow.js
          grep -Fq 'Nexus has been notified' portal-action-workflow.js
          grep -Fq 'Address ${remaining.length} remaining checklist item' portal-action-workflow.js
          grep -Fq 'Save the required action responses before marking this complete.' portal-action-workflow.js
          grep -Fq 'setInterval(()=>reconcile(false).catch(console.error),1200);' portal-action-workflow.js
          if grep -Fq 'new MutationObserver' portal-action-workflow.js; then
            echo 'Operational action workflow must not use a self-observing DOM mutation loop.' >&2
            exit 1
          fi
"""
y=y[:start]+block+y[end:]
q.write_text(y)
print('operational action QA fix applied')
