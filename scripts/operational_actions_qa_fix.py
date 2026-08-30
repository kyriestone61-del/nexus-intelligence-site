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
print('client completion guard applied')
