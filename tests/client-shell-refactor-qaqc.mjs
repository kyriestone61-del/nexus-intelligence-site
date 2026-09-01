import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window={};
const core=await import('../portal-client-core.js');

const completeParent={id:'p',company_id:'c',project_id:null,title:'Parent',description:null,assignee:'nexus',status:'completed',priority:'high',due_date:null,dependency_task_id:null,task_type:null,phase:null,instructions:null,form_schema:null,response_data:null,completed_at:'2026-09-01T00:00:00Z',created_at:'2026-08-31T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
const incompleteParent={...completeParent,status:'not_started',completed_at:null};
const child={id:'child',company_id:'c',project_id:null,title:'Provide required system access',description:'Provide access.',assignee:'client',status:'waiting_on_client',priority:'high',due_date:'2026-09-04',dependency_task_id:'p',task_type:'access',phase:'solution_design',instructions:'Follow secure access instructions.',form_schema:[],response_data:null,completed_at:null,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};

let evaluated=core.evaluateClientActionState([incompleteParent,child]);
assert.equal(evaluated.find(x=>x.task.id==='child').state,'UPCOMING');
assert.equal(evaluated.find(x=>x.task.id==='child').blockedByTitle,'Parent');
evaluated=core.evaluateClientActionState([completeParent,child]);
assert.equal(evaluated.find(x=>x.task.id==='child').state,'WAITING_ON_YOU');
const grand={...completeParent,id:'g',title:'Grandparent'},middle={...completeParent,id:'p',dependency_task_id:'g'};
evaluated=core.evaluateClientActionState([grand,middle,child]);
assert.equal(evaluated.find(x=>x.task.id==='child').state,'WAITING_ON_YOU');
const a={...child,id:'a',title:'A',dependency_task_id:'b'},b={...child,id:'b',title:'B',dependency_task_id:'a'};
evaluated=core.evaluateClientActionState([a,b]);assert.ok(evaluated.every(x=>x.state==='UPCOMING'&&x.cycleDetected));

const independent={...child,id:'ready',title:'Ready now',dependency_task_id:null,priority:'high'},second={...child,id:'second',title:'Second ready',dependency_task_id:null,priority:'normal'},blocked={...child,id:'blocked-child',title:'Future task',dependency_task_id:'p'};
const ctx=core.buildWorkspaceContextFromTasks([incompleteParent,independent,second,blocked]);
assert.equal(ctx.primaryAction.taskId,'ready');assert.equal(ctx.secondaryActionable.length,1);assert.equal(ctx.next.length,1);
const hiddenParentChild={...child,id:'hidden-parent-child',dependency_task_id:'internal-parent'};
const rpcMock={rpc:async name=>({data:name==='nexus_get_client_action_context'?[{task_id:'hidden-parent-child',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true,blocked_by_title:null,cycle_detected:false}]:[],error:null})};
const rpcContext=await core.getWorkspaceCurrentActionContext('c',{sb:rpcMock,tasks:[hiddenParentChild]});
assert.equal(rpcContext.primaryAction?.taskId,'hidden-parent-child');assert.equal(rpcContext.next.length,0);

const notifications=[
{id:'n1',notification_type:'document_request',title:'Square pilot-month transaction export',message:'Financial export',created_at:'2026-09-01T01:00:00Z',read_at:null},
{id:'n2',notification_type:'document_request',title:'Novo pilot-month statement',message:'Bank records',created_at:'2026-09-01T02:00:00Z',read_at:null},
{id:'n3',notification_type:'document_request',title:'American Express business statement',message:'Expenses',created_at:'2026-09-01T03:00:00Z',read_at:null},
{id:'n4',notification_type:'document_request',title:'Existing profit-and-loss template',message:'P&L',created_at:'2026-09-01T04:00:00Z',read_at:null},
{id:'n5',notification_type:'document_request',title:'Stripe pilot-month export',message:'Revenue',created_at:'2026-09-01T05:00:00Z',read_at:null}];
const rollups=core.aggregateNotifications(notifications);assert.equal(rollups.length,1);assert.equal(rollups[0].title,'Financial pilot information requested');assert.equal(rollups[0].itemCount,5);assert.equal(rollups[0].cta,'Review request →');
const report=core.serializeReleasedClientReport({id:'r',status:'released',revoked_at:null,report_version:2,released_at:'2026-09-01T00:00:00Z',client_report:{title:'Client report',executive_summary:'Safe',agent_code:'secret',evidence_score:99,findings:[{title:'Finding',review_state:'internal',summary:'Safe nested'}]}});
assert.equal(report.executive_summary,'Safe');assert.equal('agent_code'in report,false);assert.equal('evidence_score'in report,false);assert.equal('review_state'in report.findings[0],false);

const app=fs.readFileSync('portal-app.js','utf8');
const client=fs.readFileSync('portal-client.js','utf8');
const runtime=fs.readFileSync('portal-runtime-core.js','utf8');
const shell=fs.readFileSync('portal-client-shell-v2.js','utf8');
const css=fs.readFileSync('portal-client-shell-v2.css','utf8');
const upload=fs.readFileSync('portal-client-upload-service.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260901_nexus_atomic_client_workspace_activation.sql','utf8');

assert.match(app,/const platformAdmin=!!portal\.state\?\.admin/);
assert.match(app,/preparePerspective\?\.\(portal\)[\s\S]*const useClientShell=isSignedIn&&\(!platformAdmin\|\|portal\.state\?\.viewMode==='client'\)/);
assert.match(app,/portal-client-shell-v2\.css/);assert.match(app,/portal-client-upload-service\.js/);assert.match(app,/portal-client-shell-v2\.js/);
const clientBranch=app.match(/if\(useClientShell\)\{([\s\S]*?)\}\s*else if\(useAdminShell\)/)?.[1]||'';assert.ok(clientBranch);
for(const legacy of ['portal-client-shell.js','portal-simplify.js','portal-action-workflow.js','portal-vnext-experience.js','portal-approval-inbox.js','portal-workflow-cohesion.js','portal-buildingblok-cohesion.js','portal-client-guide.js','portal-ux-refinement.js'])assert.equal(clientBranch.includes(legacy),false,`client branch must not load ${legacy}`);
assert.ok(clientBranch.indexOf('portal-client-upload-service.js')<clientBranch.indexOf('portal-client-shell-v2.js'),'upload service must load before V2 shell');

assert.match(client,/createPortalRuntime/);assert.match(client,/stateController\.patch/);assert.match(client,/workspaceRequests\.begin\(\)/);assert.match(client,/workspaceRequests\.isCurrent\(token\)/);assert.match(client,/nexus_activate_client_workspace/);
assert.equal(client.includes("from '/portal-ops.js'"),false,'base portal must not import Operations');assert.equal(client.includes('initOps('),false,'base portal must not initialize Operations');
assert.equal(/\.onclick\s*=/.test(client),false,'base portal must not use onclick rebinding');assert.equal(/\.onchange\s*=/.test(client),false,'base portal must not use onchange rebinding');assert.equal(client.includes('closeAll()'),false,'base portal must not use global close-all modal behavior');
assert.match(runtime,/createStateController/);assert.match(runtime,/createEventRegistry/);assert.match(runtime,/createModalManager/);assert.match(runtime,/event\.shiftKey/);assert.match(runtime,/event\.key === 'Escape'/);assert.match(runtime,/document\.body\.classList\.add\('nexus-modal-open'\)/);
assert.match(migration,/pg_advisory_xact_lock/);assert.match(migration,/insert into public\.nexus_companies/);assert.match(migration,/insert into public\.nexus_company_members/);assert.match(migration,/insert into public\.nexus_projects/);

assert.match(shell,/PRIMARY_VIEWS=\[\['today','01 Today'\],\['files','02 Secure Data Room'\],\['improvement','03 Improvement Record'\]\]/);
assert.match(shell,/YOUR NEXT STEP/);assert.match(shell,/Complete this step →/);assert.match(shell,/UP NEXT —/);assert.match(shell,/Reports/);assert.match(shell,/Help/);assert.match(shell,/Inbox/);
assert.equal(shell.includes('new MutationObserver'),false);assert.equal(/\.onclick\s*=/.test(shell),false);assert.equal(/\.onchange\s*=/.test(shell),false);
assert.match(shell,/runtime/);assert.match(shell,/events\.bind/);assert.match(shell,/boundary\.run|boundary\.wrap/);assert.match(shell,/modals\.open/);
assert.match(shell,/portal\.prepareUpload\?\.\(\{requestId,title\}\)/,'V2 shell must use the explicit upload facade');
assert.match(upload,/event\.stopImmediatePropagation\(\)/);assert.match(upload,/request_id:selection\.requestId/);assert.match(upload,/remove\(\[path\]\)/);
assert.match(upload,/portal\.services\.clientUpload=service/,'upload service must remain the single upload owner');
assert.match(upload,/Object\.defineProperty\(portal,'prepareUpload',\{value:prepare/,'upload facade must delegate to the upload owner');
assert.match(css,/min-height:44px/);assert.match(css,/env\(safe-area-inset-bottom\)/);assert.match(css,/overflow-x:hidden/);assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(max-width:390px\)/);

console.log('NEXUS CONTROL ROOM RECONCILIATION QAQC PASS');
