import assert from 'node:assert/strict';
import fs from 'node:fs';

async function importSource(path){const source=fs.readFileSync(path,'utf8');return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)}
const {projectTaskProjection}=await importSource('core/task-projection.js');
const COMPANY='04acb60c-0f99-4743-9b7e-effedfd1df18',ASSESSMENT='99762f18-ab2c-42b3-a480-a06d99d7d011',PILOT='e3984b11-2f63-40e2-b0de-952de1a9a0df';
const engagementContext={companyId:COMPANY,activeProjectId:PILOT,activeProject:{id:PILOT,company_id:COMPANY,engagement_stage:'diagnosis'},ambiguous:false,source:'explicit'};
const tasks=[
{id:'old-workflow',company_id:COMPANY,project_id:ASSESSMENT,title:'Provide current-workflow evidence',assignee:'client',status:'open',priority:'normal',task_type:'workflow_evidence',phase:'general'},
{id:'pilot-kpi',company_id:COMPANY,project_id:PILOT,title:'Provide current KPI or performance reports',assignee:'client',status:'not_started',priority:'normal',task_type:'upload',phase:'discovery'},
{id:'pilot-workflow',company_id:COMPANY,project_id:PILOT,title:'Provide current-workflow evidence',assignee:'client',status:'not_started',priority:'high',task_type:'workflow_evidence',phase:'general'},
{id:'pilot-baseline',company_id:COMPANY,project_id:PILOT,title:'Confirm systems, owners, and baseline period',assignee:'client',status:'not_started',priority:'high',task_type:'structured_form',phase:'general'},
{id:'pilot-diagnosis-approval',company_id:COMPANY,project_id:PILOT,title:'Approve diagnosis and first priority',assignee:'client',status:'draft',priority:'high',task_type:'approval',phase:'diagnosis'},
{id:'pilot-nexus-map',company_id:COMPANY,project_id:PILOT,title:'Map the current financial workflow',assignee:'nexus',status:'in_progress',priority:'high',task_type:'nexus_internal',phase:'diagnosis'},
{id:'pilot-future-access',company_id:COMPANY,project_id:PILOT,title:'Provide required system access',assignee:'client',status:'waiting_on_client',priority:'high',task_type:'access',phase:'solution_design'},
{id:'company-general',company_id:COMPANY,project_id:null,title:'Confirm billing contact',assignee:'client',status:'open',priority:'low',task_type:'structured_form',phase:'general'}];
const actionContexts=[
{task_id:'old-workflow',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},{task_id:'pilot-kpi',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},{task_id:'pilot-workflow',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},{task_id:'pilot-baseline',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true},{task_id:'pilot-diagnosis-approval',canonical_state:'UPCOMING',prerequisites_satisfied:false,blocked_by_title:'Nexus releases your diagnosis report'},{task_id:'pilot-future-access',canonical_state:'UPCOMING',prerequisites_satisfied:false,blocked_by_title:'Confirm workflow requirements'},{task_id:'company-general',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true}];
const documentRequests=[
{id:'old-monthly',company_id:COMPANY,project_id:ASSESSMENT,title:'Representative Monthly Volume Reports',status:'requested',evidence_status:'missing',is_required:true,owner_scope:'client'},
{id:'pilot-acuity',company_id:COMPANY,project_id:PILOT,title:'Acuity operational reports',status:'requested',evidence_status:'missing',is_required:true,owner_scope:'client'},
{id:'pilot-bookkeeping',company_id:COMPANY,project_id:PILOT,title:'Current bookkeeping process notes',status:'requested',evidence_status:'missing',is_required:true,owner_scope:'client'},
{id:'pilot-complete',company_id:COMPANY,project_id:PILOT,title:'Already supplied file',status:'received',evidence_status:'uploaded',is_required:true,owner_scope:'nexus',fulfilled_document_id:'doc-1'}];

{
 const p=projectTaskProjection({engagementContext,tasks,actionContexts,documentRequests});
 assert.equal(p.contextStatus,'ready');assert.equal(p.activeProjectId,PILOT);assert.ok(p.items.length>0);
 assert.equal(p.items.some(x=>x.projectId===ASSESSMENT),false);assert.equal(p.items.some(x=>x.sourceId==='old-workflow'),false);assert.equal(p.items.some(x=>x.sourceId==='old-monthly'),false);assert.equal(p.items.some(x=>x.sourceId==='company-general'),false);
 const primary=p.attention.primaryAction;assert.ok(primary);assert.equal(primary.attention,'waiting_on_you');assert.equal(primary.requiresAction,true);assert.equal(primary.priority,'high');
 const approval=p.items.find(x=>x.sourceId==='pilot-diagnosis-approval');assert.equal(approval.attention,'upcoming');assert.equal(approval.requiresAction,false);assert.match(approval.blockedBy,/releases your diagnosis/i);
 const nexus=p.items.find(x=>x.sourceId==='pilot-nexus-map');assert.equal(nexus.owner,'nexus');assert.equal(nexus.attention,'nexus_working');assert.equal(nexus.state,'in_progress');assert.equal(p.attention.nexusWorking.sourceId,'pilot-nexus-map');
 const request=p.items.find(x=>x.sourceId==='pilot-acuity');assert.equal(request.sourceType,'document_request');assert.equal(request.owner,'client');assert.equal(request.actionType,'upload');assert.equal(request.attention,'waiting_on_you');assert.equal(request.requiresAction,true);
 const supplied=p.items.find(x=>x.sourceId==='pilot-complete');assert.equal(supplied.state,'complete');assert.equal(supplied.requiresAction,false);
 assert.ok(p.attention.upNext);assert.equal(p.counts.waitingOnYou,5);
}
{
 const p=projectTaskProjection({engagementContext:{companyId:COMPANY,activeProjectId:null,activeProject:null,ambiguous:true,source:'ambiguous'},tasks,actionContexts,documentRequests});assert.equal(p.contextStatus,'ambiguous');assert.equal(p.items.length,0);assert.equal(p.attention.primaryAction,null);
}
{
 const p=projectTaskProjection({engagementContext:{companyId:COMPANY,activeProjectId:null,activeProject:null,ambiguous:false,source:'none'},tasks,actionContexts,documentRequests});assert.equal(p.contextStatus,'none');assert.equal(p.items.every(x=>x.projectId===null),true);
}

const clientCore=fs.readFileSync('portal-client-core.js','utf8'),shell=fs.readFileSync('portal-client-shell-v2.js','utf8');
assert.match(clientCore,/from ['"]\.\/core\/task-projection\.js['"]/);assert.match(clientCore,/projectTaskProjection\(/);assert.equal((clientCore.match(/nexus_get_client_action_context/g)||[]).length,1);assert.match(clientCore,/options\.engagementContext/);assert.match(clientCore,/options\.documentRequests/);assert.doesNotMatch(clientCore,/from\('nexus_document_requests'\)/);
assert.match(shell,/engagementContext:state\.engagementContext/);assert.match(shell,/documentRequests:state\.docRequests/);assert.doesNotMatch(shell,/from\('nexus_document_requests'\)/);assert.doesNotMatch(shell,/from\('nexus_tasks'\)\.select/);
assert.match(shell,/currentContext\?\.taskProjection/,'all simplified surfaces must read the one projected context');
assert.match(shell,/function renderHome\([\s\S]*projection\(\)/,'Home must consume the task projection');
assert.match(shell,/function renderTasks\([\s\S]*projection\(\)/,'Tasks must consume the same task projection');
assert.match(shell,/function askGuide\([\s\S]*projection\(\)/,'Guide must consume the same task projection');
assert.match(shell,/function actionable\([\s\S]*items\(\)/,'Inbox action eligibility must consume projected items');
assert.match(shell,/function renderFiles\(/,'Files must remain a first-class client surface');assert.match(shell,/function renderReports\(/,'Reports must remain a first-class client surface');
console.log('NEXUS TASK PROJECTION QAQC PASS');
