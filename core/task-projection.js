const COMPLETE=new Set(['complete','completed','done','resolved','approved','released','implemented','closed','accepted']);
const BLOCKED=new Set(['blocked','failed','delayed','attention','action_required']);
const REVIEW=new Set(['ready_for_review','in_review','pending_review','submitted','reviewing']);
const PRIORITY={urgent:0,critical:0,high:1,normal:2,medium:2,low:3};
const PHASE={intake:0,general:1,discovery:2,diagnosis:3,approval:4,solution_design:5,implementation:6,results:7,complete:8};

const norm=value=>String(value??'').trim().toLowerCase();
const rankPriority=value=>PRIORITY[norm(value)]??2;
const rankPhase=value=>PHASE[norm(value)]??50;
const projectMatches=(row,activeProjectId)=>activeProjectId?String(row?.project_id||'')===String(activeProjectId):row?.project_id==null;

function actionContextMap(rows){return new Map((Array.isArray(rows)?rows:[]).map(row=>[String(row.task_id),row]));}
function productStateForClientTask(task,context){
  const canonical=String(context?.canonical_state||'').toUpperCase();
  if(canonical==='COMPLETE'||COMPLETE.has(norm(task.status)))return {state:'complete',attention:'complete',requiresAction:false};
  if(canonical==='BLOCKED'||BLOCKED.has(norm(task.status)))return {state:'waiting',attention:'blocked',requiresAction:false};
  if(canonical==='UPCOMING')return {state:'waiting',attention:'upcoming',requiresAction:false};
  if(canonical==='NEXUS_WORKING'||REVIEW.has(norm(task.status)))return {state:'waiting',attention:'nexus_working',requiresAction:false};
  const progress=norm(task.status)==='in_progress';
  return {state:progress?'in_progress':'todo',attention:'waiting_on_you',requiresAction:true};
}
function productStateForNexusTask(task){
  const status=norm(task.status);
  if(COMPLETE.has(status))return {state:'complete',attention:'complete',requiresAction:false};
  if(BLOCKED.has(status))return {state:'waiting',attention:'blocked',requiresAction:false};
  if(status==='in_progress'||REVIEW.has(status))return {state:'in_progress',attention:'nexus_working',requiresAction:false};
  return {state:'waiting',attention:'upcoming',requiresAction:false};
}
function productStateForRequest(request){
  const status=norm(request.status),evidence=norm(request.evidence_status);
  if(request.fulfilled_document_id||COMPLETE.has(status)||['accepted','verified','complete','completed'].includes(evidence))return {state:'complete',attention:'complete',requiresAction:false};
  if(['revision_requested','changes_requested','rejected'].includes(status)||['revision_requested','rejected'].includes(evidence))return {state:'todo',attention:'waiting_on_you',requiresAction:true};
  if(['received','uploaded','under_review','reviewing'].includes(status)||['uploaded','under_review','reviewing'].includes(evidence)||norm(request.owner_scope)==='nexus')return {state:'waiting',attention:'nexus_working',requiresAction:false};
  if(status==='draft')return null;
  return {state:'todo',attention:'waiting_on_you',requiresAction:true};
}
function itemSort(a,b){
  const attentionRank={waiting_on_you:0,nexus_working:1,blocked:2,upcoming:3,complete:4};
  return (attentionRank[a.attention]??9)-(attentionRank[b.attention]??9)
    ||rankPriority(a.priority)-rankPriority(b.priority)
    ||rankPhase(a.phase)-rankPhase(b.phase)
    ||String(a.dueDate||'9999-12-31').localeCompare(String(b.dueDate||'9999-12-31'))
    ||String(a.title).localeCompare(String(b.title));
}
function taskItem(task,context){
  const client=norm(task.assignee)==='client';
  const product=client?productStateForClientTask(task,context):productStateForNexusTask(task);
  return Object.freeze({
    id:`task:${task.id}`,
    sourceType:'task',
    sourceId:String(task.id),
    companyId:String(task.company_id),
    projectId:task.project_id?String(task.project_id):null,
    owner:client?'client':'nexus',
    title:String(task.title||'Action'),
    description:task.description||task.instructions||null,
    actionType:norm(task.task_type)||'task',
    state:product.state,
    attention:product.attention,
    requiresAction:product.requiresAction,
    priority:norm(task.priority)||'normal',
    phase:norm(task.phase)||'general',
    dueDate:task.due_date||null,
    blockedBy:context?.blocked_by_title||null,
    source:task
  });
}
function requestItem(request){
  const product=productStateForRequest(request);if(!product)return null;
  return Object.freeze({
    id:`document_request:${request.id}`,
    sourceType:'document_request',
    sourceId:String(request.id),
    companyId:String(request.company_id),
    projectId:request.project_id?String(request.project_id):null,
    owner:'client',
    title:String(request.title||'Provide requested file'),
    description:request.purpose||null,
    actionType:'upload',
    state:product.state,
    attention:product.attention,
    requiresAction:product.requiresAction,
    priority:request.is_required===false?'low':'normal',
    phase:'discovery',
    dueDate:request.due_date||null,
    blockedBy:null,
    source:request
  });
}

/**
 * Product-level work projection for the authenticated application.
 *
 * Raw database records remain authoritative for persistence/audit. This service
 * decides what active-engagement work means to the product surface without
 * mutating, deleting, or reclassifying those records in the database.
 */
export function projectTaskProjection({engagementContext,tasks=[],actionContexts=[],documentRequests=[]}={}){
  const companyId=engagementContext?.companyId||null;
  if(!companyId)throw new Error('Engagement context is required for task projection.');
  if(engagementContext?.ambiguous){
    return Object.freeze({companyId:String(companyId),activeProjectId:null,contextStatus:'ambiguous',items:Object.freeze([]),counts:Object.freeze({waitingOnYou:0,nexusWorking:0,upcoming:0,blocked:0,complete:0}),attention:Object.freeze({primaryAction:null,nexusWorking:null,upNext:null,blocked:null})});
  }

  const activeProjectId=engagementContext?.activeProjectId||null;
  const contexts=actionContextMap(actionContexts);
  const items=[];

  for(const task of Array.isArray(tasks)?tasks:[]){
    if(String(task?.company_id)!==String(companyId))continue;
    if(!projectMatches(task,activeProjectId))continue;
    items.push(taskItem(task,contexts.get(String(task.id))));
  }
  for(const request of Array.isArray(documentRequests)?documentRequests:[]){
    if(String(request?.company_id)!==String(companyId))continue;
    if(!projectMatches(request,activeProjectId))continue;
    const item=requestItem(request);if(item)items.push(item);
  }

  items.sort(itemSort);
  const waiting=items.filter(item=>item.attention==='waiting_on_you'&&item.requiresAction);
  const nexus=items.filter(item=>item.attention==='nexus_working');
  const upcoming=items.filter(item=>item.attention==='upcoming');
  const blocked=items.filter(item=>item.attention==='blocked');
  const complete=items.filter(item=>item.attention==='complete');
  const attention=Object.freeze({
    primaryAction:waiting[0]||null,
    nexusWorking:nexus[0]||null,
    upNext:upcoming[0]||null,
    blocked:blocked[0]||null
  });
  return Object.freeze({
    companyId:String(companyId),
    activeProjectId:activeProjectId?String(activeProjectId):null,
    contextStatus:activeProjectId?'ready':'none',
    items:Object.freeze(items),
    counts:Object.freeze({waitingOnYou:waiting.length,nexusWorking:nexus.length,upcoming:upcoming.length,blocked:blocked.length,complete:complete.length}),
    attention
  });
}
