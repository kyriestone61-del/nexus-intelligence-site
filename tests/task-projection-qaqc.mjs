import assert from 'node:assert/strict';
import fs from 'node:fs';

async function importSource(path){
  const source=fs.readFileSync(path,'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const {projectTaskProjection}=await importSource('core/task-projection.js');

const COMPANY='04acb60c-0f99-4743-9b7e-effedfd1df18';
const ASSESSMENT='99762f18-ab2c-42b3-a480-a06d99d7d011';
const PILOT='e3984b11-2f63-40e2-b0de-952de1a9a0df';
const engagementContext={companyId:COMPANY,activeProjectId:PILOT,activeProject:{id:PILOT,company_id:COMPANY,engagement_stage:'diagnosis'},ambiguous:false,source:'explicit'};

const tasks=[
  {id:'old-workflow',company_id:COMPANY,project_id:ASSESSMENT,title:'Provide current-workflow evidence',assignee:'client',status:'open',priority:'normal',task_type:'workflow_evidence',phase:'general',notify_client:false},
  {id:'pilot-kpi',company_id:COMPANY,project_id:PILOT,title:'Provide current KPI or performance reports',assignee:'client',status:'not_started',priority:'normal',task_type:'upload',phase:'discovery',notify_client:true},
  {id:'pilot-workflow',company_id:COMPANY,project_id:PILOT,title:'Provide current-workflow evidence',assignee:'client',status:'not_started',priority:'high',task_type:'workflow_evidence',phase:'general',notify_client:true},
  {id:'pilot-baseline',company_id:COMPANY,project_id:PILOT,title:'Confirm systems, owners, and baseline period',assignee:'client',status:'not_started',priority:'high',task_type:'structured_form',phase:'general',notify_client:true},
  {id:'pilot-diagnosis-approval',company_id:COMPANY,project_id:PILOT,title:'Approve diagnosis and first priority',assignee:'client',status:'draft',priority:'high',task_type:'approval',phase:'diagnosis',notify_client:false},
  {id:'pilot-nexus-map',company_id:COMPANY,project_id:PILOT,title:'Map the current financial workflow',assignee:'nexus',status:'in_progress',priority:'high',task_type:'nexus_internal',phase:'diagnosis',notify_client:false},
  {id:'pilot-future-access',company_id:COMPANY,project_id:PILOT,title:'Provide required system access',assignee:'client',status:'waiting_on_client',priority:'high',task_type:'access',phase:'solution_design',notify_client:true},
  {id:'company-general',company_id:COMPANY,project_id:null,title:'Confirm billing contact',assignee:'client',status:'open',priority:'low',task_type:'structured_form',phase:'general',notify_client:true}
];

const actionContexts=[
  {task_id:'old-workflow',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},
  {task_id:'pilot-kpi',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},
  {task_id:'pilot-workflow',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},
  {task_id:'pilot-baseline',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},
  {task_id:'pilot-diagnosis-approval',canonical_state:'UPCOMING',prerequisites_satisfied:false,blocked_by_title:'Nexus releases your diagnosis report'},
  {task_id:'pilot-future-access',canonical_state:'UPCOMING',prerequisites_satisfied:false,blocked_by_title:'Confirm workflow requirements'},
  {task_id:'company-general',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true}
];

const documentRequests=[
  {id:'old-monthly',company_id:COMPANY,project_id:ASSESSMENT,title:'Representative Monthly Volume Reports',status:'requested',evidence_status:'missing',is_required:true,owner_scope:'client'},
  {id:'pilot-acuity',company_id:COMPANY,project_id:PILOT,title:'Acuity operational reports',status:'requested',evidence_status:'missing',is_required:true,owner_scope:'client'},
  {id:'pilot-bookkeeping',company_id:COMPANY,project_id:PILOT,title:'Current bookkeeping process notes',status:'requested',evidence_status:'missing',is_required:true,owner_scope:'client'},
  {id:'pilot-complete',company_id:COMPANY,project_id:PILOT,title:'Already supplied file',status:'received',evidence_status:'uploaded',is_required:true,owner_scope:'nexus',fulfilled_document_id:'doc-1'}
];

{
  const projection=projectTaskProjection({engagementContext,tasks,actionContexts,documentRequests});
  assert.equal(projection.contextStatus,'ready');
  assert.equal(projection.activeProjectId,PILOT);
  assert.ok(projection.items.length>0);
  assert.equal(projection.items.some(item=>item.projectId===ASSESSMENT),false,'inactive-project work must not leak into the active engagement projection');
  assert.equal(projection.items.some(item=>item.sourceId==='old-workflow'),false);
  assert.equal(projection.items.some(item=>item.sourceId==='old-monthly'),false);
  assert.equal(projection.items.some(item=>item.sourceId==='company-general'),false,'company-level backlog must not dilute an active project projection');

  const primary=projection.attention.primaryAction;
  assert.ok(primary,'a waiting-on-client item should become the primary action');
  assert.equal(primary.attention,'waiting_on_you');
  assert.equal(primary.requiresAction,true);
  assert.equal(primary.priority,'high','high-priority client work should outrank normal document requests');

  const diagnosisApproval=projection.items.find(item=>item.sourceId==='pilot-diagnosis-approval');
  assert.equal(diagnosisApproval.attention,'upcoming');
  assert.equal(diagnosisApproval.requiresAction,false,'unreleased diagnosis approval must not be presented as actionable');
  assert.match(diagnosisApproval.blockedBy,/releases your diagnosis/i);

  const nexus=projection.items.find(item=>item.sourceId==='pilot-nexus-map');
  assert.equal(nexus.owner,'nexus');
  assert.equal(nexus.attention,'nexus_working');
  assert.equal(nexus.state,'in_progress');
  assert.equal(projection.attention.nexusWorking.sourceId,'pilot-nexus-map');

  const request=projection.items.find(item=>item.sourceId==='pilot-acuity');
  assert.equal(request.sourceType,'document_request');
  assert.equal(request.owner,'client');
  assert.equal(request.actionType,'upload');
  assert.equal(request.attention,'waiting_on_you');
  assert.equal(request.requiresAction,true);

  const supplied=projection.items.find(item=>item.sourceId==='pilot-complete');
  assert.equal(supplied.state,'complete');
  assert.equal(supplied.requiresAction,false);

  assert.ok(projection.attention.upNext,'projection should expose one deterministic next item');
  assert.equal(projection.counts.waitingOnYou,5,'active client tasks plus active requested documents should be counted without inactive-project leakage');
}

{
  const projection=projectTaskProjection({engagementContext:{companyId:COMPANY,activeProjectId:null,activeProject:null,ambiguous:true,source:'ambiguous'},tasks,actionContexts,documentRequests});
  assert.equal(projection.contextStatus,'ambiguous');
  assert.equal(projection.items.length,0,'ambiguous project state must not emit project-scoped actions');
  assert.equal(projection.attention.primaryAction,null);
}

{
  const projection=projectTaskProjection({engagementContext:{companyId:COMPANY,activeProjectId:null,activeProject:null,ambiguous:false,source:'none'},tasks,actionContexts,documentRequests});
  assert.equal(projection.contextStatus,'none');
  assert.equal(projection.items.every(item=>item.projectId===null),true,'without an active project only explicit company-level work may project');
}

// Integration contract: the existing client-core consumer owns the one governed
// action-context RPC, then feeds that result plus workspace-loaded tasks/requests into
// projectTaskProjection. Home, Guide and Inbox must consume the same projection.
const clientCore=fs.readFileSync('portal-client-core.js','utf8');
const shell=fs.readFileSync('portal-client-shell-v2.js','utf8');
assert.match(clientCore,/from '\/core\/task-projection\.js'/,'client core must import the canonical task projection');
assert.match(clientCore,/projectTaskProjection\(/,'client core must build the projection inside the existing action-context consumer');
assert.equal((clientCore.match(/nexus_get_client_action_context/g)||[]).length,1,'client core must retain exactly one governed action-context RPC path');
assert.match(clientCore,/options\.engagementContext/,'client core must accept the already-resolved EngagementContext');
assert.match(clientCore,/options\.documentRequests/,'client core must accept already-loaded document requests');
assert.doesNotMatch(clientCore,/from\('nexus_document_requests'\)/,'client core must not add another document-request query');

assert.match(shell,/engagementContext:state\.engagementContext/,'client shell must pass the base EngagementContext into the existing consumer');
assert.match(shell,/documentRequests:state\.docRequests/,'client shell must reuse base workspace document requests');
assert.doesNotMatch(shell,/from\('nexus_document_requests'\)/,'client shell must not re-fetch the full document-request collection');
assert.match(shell,/currentContext\?\.taskProjection/,'Home\/Guide\/Inbox must have one canonical task projection on current context');
assert.match(shell,/function renderToday\([\s\S]*taskProjection/,'Home must consume the task projection');
assert.match(shell,/function askGuide\([\s\S]*taskProjection/,'Guide must consume the task projection');
assert.match(shell,/function actionableInbox\([\s\S]*taskProjection/,'Inbox action eligibility must consume the task projection');

console.log('NEXUS TASK PROJECTION QAQC PASS');
