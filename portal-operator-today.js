const COMPLETE=new Set(['complete','completed','cancelled','declined','archived']);
const WAITING=new Set(['waiting_client','waiting_on_client','awaiting_client','client_review']);
const CURRENT=new Set(['active','in_progress','working','building','analyzing','processing','ready_for_review','internal_qa','final_qa']);
const title=v=>String(v||'Untitled item');
const status=v=>String(v||'open').replaceAll('_',' ');
const isComplete=row=>COMPLETE.has(String(row?.status||'').toLowerCase());
const clientOwned=row=>String(row?.assignee||row?.owner_scope||'').toLowerCase()==='client'||WAITING.has(String(row?.status||'').toLowerCase());
const item=(row,kind,section,detail)=>({id:`${kind}:${row?.id||title(row?.title||row?.name)}`,title:title(row?.title||row?.name),detail:detail||`${kind} · ${status(row?.status)}`,section,status:status(row?.status),kind});
const unique=rows=>[...new Map(rows.map(row=>[row.id,row])).values()];

export function emptyOperatorTodayRecords(){return {requests:[],approvals:[],automations:[],documentRequests:[]}}

export async function loadOperatorTodayRecords(sb,companyId){
  if(!companyId)return {records:emptyOperatorTodayRecords(),errors:[]};
  const specs=[
    ['requests','nexus_client_requests'],
    ['documentRequests','nexus_document_requests']
  ];
  const results=await Promise.all(specs.map(([,table])=>sb.from(table).select('*').eq('company_id',companyId).order('created_at',{ascending:false})));
  const records=emptyOperatorTodayRecords(),errors=[];
  results.forEach((result,index)=>{const [key,table]=specs[index];records[key]=result?.data||[];if(result?.error)errors.push({table,message:result.error.message||String(result.error)})});
  return {records,errors};
}

export function operatorTodayModel({snapshot,state,records=emptyOperatorTodayRecords(),next}){
  const tasks=(state?.tasks||[]).filter(row=>!isComplete(row));
  const currentWork=[];
  const activePackage=snapshot?.package;
  if(activePackage&&!COMPLETE.has(String(activePackage.stage||activePackage.status||'').toLowerCase())){
    const project=(snapshot?.projects||[]).find(row=>row.id===snapshot.project_id)||(state?.projects||[]).find(row=>row.id===snapshot.project_id);
    currentWork.push({id:`package:${snapshot.project_id||activePackage.id||'active'}`,title:title(project?.name||activePackage.name||'Active paid engagement'),detail:`Project stage · ${status(activePackage.stage||activePackage.status)}`,section:'progress',status:status(activePackage.stage||activePackage.status),kind:'Project'});
  }else if(snapshot?.diagnosis?.access===true&&CURRENT.has(String(snapshot.diagnosis.status||'').toLowerCase())){
    currentWork.push({id:`diagnosis:${snapshot.diagnosis.id||'active'}`,title:'Full Diagnosis report',detail:`Diagnosis · ${status(snapshot.diagnosis.status)}`,section:'diagnosis',status:status(snapshot.diagnosis.status),kind:'Diagnosis'});
  }
  tasks.filter(row=>!clientOwned(row)&&CURRENT.has(String(row.status||'').toLowerCase())).forEach(row=>currentWork.push(item(row,'Action','actions',`Action · ${status(row.status)}${row.assignee?` · ${row.assignee}`:''}`)));
  records.requests.filter(row=>!isComplete(row)&&!clientOwned(row)&&CURRENT.has(String(row.status||'').toLowerCase())).forEach(row=>currentWork.push(item(row,'Request','requests',`Client request · ${status(row.status)}`)));

  const nextActions=[];
  if(next&&next.actor==='ADMIN'&&next.stage!=='completed')nextActions.push({id:`journey:${next.stage}`,title:title(next.title),detail:next.detail||'Current journey action',section:next.section,status:'next',kind:'Journey'});
  tasks.filter(row=>!clientOwned(row)&&!CURRENT.has(String(row.status||'').toLowerCase())).forEach(row=>nextActions.push(item(row,'Action','actions',`Action · ${status(row.status)}${row.due_date?` · due ${row.due_date}`:''}`)));
  records.requests.filter(row=>!isComplete(row)&&!clientOwned(row)&&!CURRENT.has(String(row.status||'').toLowerCase())).forEach(row=>nextActions.push(item(row,'Request','requests',`Client request · ${status(row.status)}`)));
  records.automations.filter(row=>['attention','action_required'].includes(String(row.status||'').toLowerCase())).forEach(row=>nextActions.push(item(row,'Automation','automations',`Automation · ${status(row.status)}`)));

  const waitingOnClient=[];
  if(next&&next.actor==='CLIENT')waitingOnClient.push({id:`journey:${next.stage}`,title:title(next.title),detail:next.detail||'Waiting for the client',section:next.section,status:'waiting on client',kind:'Journey'});
  tasks.filter(clientOwned).forEach(row=>waitingOnClient.push(item(row,'Action','actions',`Client action · ${status(row.status)}${row.due_date?` · due ${row.due_date}`:''}`)));
  records.approvals.filter(row=>String(row.status||'').toLowerCase()==='pending').forEach(row=>waitingOnClient.push(item(row,'Approval','approvals',`Client approval${row.due_date?` · due ${row.due_date}`:' · pending'}`)));
  records.documentRequests.filter(row=>String(row.status||'').toLowerCase()==='requested').forEach(row=>waitingOnClient.push(item(row,'Document','files','Requested file · outstanding')));
  records.requests.filter(row=>WAITING.has(String(row.status||'').toLowerCase())).forEach(row=>waitingOnClient.push(item(row,'Request','requests',`Client request · ${status(row.status)}`)));

  return {currentWork:unique(currentWork).slice(0,8),nextActions:unique(nextActions).slice(0,8),waitingOnClient:unique(waitingOnClient).slice(0,8)};
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function listMarkup(rows,emptyMessage){
  if(!rows.length)return `<div class="nepsis-today-empty"><b>Nothing here right now.</b><span>${esc(emptyMessage)}</span></div>`;
  return `<div class="nepsis-today-list">${rows.map(row=>`<button type="button" class="nepsis-today-item" data-delivery-nav="${esc(row.section)}"><span><b>${esc(row.title)}</b><small>${esc(row.detail)}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div>`;
}
export function operatorTodayMarkup(model,{companyName='Client workspace',errors=[]}={}){
  return `<div class="nepsis-operator-today"><header><div class="eyebrow">Operator workspace · Today</div><h1>What needs attention now</h1><p>${esc(companyName)} · Live work and decisions from the current workspace record.</p></header>${errors.length?`<p class="nepsis-today-load-warning" role="status">Some operator records could not be loaded. Existing journey state remains available; retry before acting on this view.</p>`:''}<div class="nepsis-today-summary" aria-label="Today counts"><span><b>${model.currentWork.length}</b> current work</span><span><b>${model.nextActions.length}</b> next actions</span><span><b>${model.waitingOnClient.length}</b> waiting on client</span></div><div class="nepsis-today-grid"><section class="nepsis-today-column"><div class="nepsis-today-column-head"><span>01</span><div><h2>Current work</h2><p>Work already moving in this client workspace.</p></div></div>${listMarkup(model.currentWork,'No active diagnosis, paid package, request, or action is currently in progress.')}</section><section class="nepsis-today-column"><div class="nepsis-today-column-head"><span>02</span><div><h2>Next actions</h2><p>The next verified Nepsis-owned moves.</p></div></div>${listMarkup(model.nextActions,'No Nepsis-owned next action is recorded.')}</section><section class="nepsis-today-column"><div class="nepsis-today-column-head"><span>03</span><div><h2>Waiting on client</h2><p>Decisions, files, and actions currently owned by the client.</p></div></div>${listMarkup(model.waitingOnClient,'No approval, document request, or client-owned action is waiting.')}</section></div></div>`;
}
