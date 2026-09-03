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
const a={...child,id:'a',title:'A',dependency_task_id:'b'},b={...child,id:'b',title:'B',dependency_task_id:'a'};
evaluated=core.evaluateClientActionState([a,b]);assert.ok(evaluated.every(x=>x.state==='UPCOMING'&&x.cycleDetected));

const independent={...child,id:'ready',title:'Ready now',dependency_task_id:null,priority:'high'},second={...child,id:'second',title:'Second ready',dependency_task_id:null,priority:'normal'},blocked={...child,id:'blocked-child',title:'Future task',dependency_task_id:'p'};
const ctx=core.buildWorkspaceContextFromTasks([incompleteParent,independent,second,blocked]);
assert.equal(ctx.primaryAction.taskId,'ready');assert.equal(ctx.secondaryActionable.length,1);assert.equal(ctx.next.length,1);
const hiddenParentChild={...child,id:'hidden-parent-child',dependency_task_id:'internal-parent'};
const rpcMock={rpc:async name=>({data:name==='nexus_get_client_action_context'?[{task_id:'hidden-parent-child',canonical_state:'WAITING_ON_YOU',prerequisites_satisfied:true,blocked_by_title:null,cycle_detected:false}]:[],error:null})};
const rpcContext=await core.getWorkspaceCurrentActionContext('c',{sb:rpcMock,tasks:[hiddenParentChild]});
assert.equal(rpcContext.primaryAction?.taskId,'hidden-parent-child');assert.equal(rpcContext.next.length,0);

const app=fs.readFileSync('portal-app.js','utf8');
const client=fs.readFileSync('portal-client.js','utf8');
const runtime=fs.readFileSync('portal-runtime-core.js','utf8');
const shell=fs.readFileSync('portal-client-shell-v2.js','utf8');
const css=fs.readFileSync('portal-client-shell-v2.css','utf8');
const simpleCss=fs.readFileSync('portal-client-shell-simple.css','utf8');
const upload=fs.readFileSync('portal-client-upload-service.js','utf8');
const documents=fs.readFileSync('core/document-service.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260901_nexus_atomic_client_workspace_activation.sql','utf8');

assert.match(app,/const BUILD='20260903-simple-client-shell1'/);
assert.match(app,/const platformAdmin=!!portal\.state\?\.admin/);
assert.match(app,/preparePerspective\?\.\(portal\)[\s\S]*const useClientShell=isSignedIn&&\(!platformAdmin\|\|portal\.state\?\.viewMode==='client'\)/);
assert.match(app,/portal-client-shell-v2\.css/);assert.match(app,/portal-client-shell-simple\.css/);assert.match(app,/portal-client-upload-service\.js/);assert.match(app,/portal-client-shell-v2\.js/);
const clientBranch=app.match(/if\(useClientShell\)\{([\s\S]*?)\}\s*else if\(useAdminShell\)/)?.[1]||'';assert.ok(clientBranch);
for(const legacy of ['portal-client-shell.js','portal-simplify.js','portal-action-workflow.js','portal-vnext-experience.js','portal-approval-inbox.js','portal-workflow-cohesion.js','portal-buildingblok-cohesion.js','portal-client-guide.js','portal-ux-refinement.js'])assert.equal(clientBranch.includes(legacy),false,`client branch must not load ${legacy}`);
assert.ok(clientBranch.indexOf('portal-client-upload-service.js')<clientBranch.indexOf('portal-client-shell-v2.js'),'upload facade must load before client shell');

assert.match(client,/createPortalRuntime/);assert.match(client,/stateController\.patch/);assert.match(client,/workspaceRequests\.begin\(\)/);assert.match(client,/workspaceRequests\.isCurrent\(token\)/);assert.match(client,/nexus_activate_client_workspace/);
assert.equal(client.includes("from '/portal-ops.js'"),false);assert.equal(client.includes('initOps('),false);assert.equal(/\.onclick\s*=|\.onchange\s*=/.test(client),false);
assert.match(runtime,/createStateController/);assert.match(runtime,/createEventRegistry/);assert.match(runtime,/createModalManager/);assert.match(runtime,/event\.shiftKey/);assert.match(runtime,/event\.key === 'Escape'/);
assert.match(migration,/pg_advisory_xact_lock/);assert.match(migration,/insert into public\.nexus_companies/);assert.match(migration,/insert into public\.nexus_company_members/);assert.match(migration,/insert into public\.nexus_projects/);

assert.match(shell,/PRIMARY_VIEWS=\[\['home','Home'\],\['tasks','Tasks'\],\['files','Files'\],\['reports','Reports'\]\]/);
assert.match(shell,/activeView='home'/);
assert.match(shell,/What needs your attention\./);assert.match(shell,/Work, without the noise\./);assert.match(shell,/Secure Data Room\./);assert.match(shell,/Progress and released findings\./);
assert.match(shell,/YOUR NEXT STEP/);assert.match(shell,/Complete this step →/);assert.match(shell,/nexus-client-today/,'Home must preserve the action-execution compatibility anchor during this bounded phase');
assert.match(shell,/nexusClientHelpButton/);assert.match(shell,/nexusClientInboxButton/);assert.match(shell,/nexusClientReportsButton'\)\?\.remove/,'Reports must be a primary surface, not a duplicate utility');
assert.match(shell,/engagementContext:state\.engagementContext/);assert.match(shell,/documentRequests:state\.docRequests/);assert.doesNotMatch(shell,/from\('nexus_document_requests'\)/);assert.doesNotMatch(shell,/from\('nexus_tasks'\)\.select/);
assert.equal((shell.match(/nexus_get_inbox/g)||[]).length,1,'shell must retain one inbox RPC path');
assert.equal(/new MutationObserver|\.onclick\s*=|\.onchange\s*=/.test(shell),false);
assert.match(shell,/portal\.prepareUpload\?\.\(/);assert.match(shell,/portal\.downloadDocument\?\.\(/);

assert.match(upload,/documents\.uploadFile/);assert.match(upload,/documents\.uploadFilesForTask/);assert.doesNotMatch(upload,/from\('nexus_documents'\)/);assert.doesNotMatch(upload,/\.storage\.from\([^)]*\)\.upload/);
assert.match(documents,/request_id:requestId\|\|null/);assert.match(documents,/data_requirement_id:requirementId\|\|null/);assert.match(documents,/task_id:task\?\.id\|\|null/);assert.match(documents,/remove\(\[path\]\)/);

assert.match(css,/min-height:44px/);assert.match(css,/env\(safe-area-inset-bottom\)/);assert.match(css,/overflow-x:hidden/);assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(max-width:390px\)/);
assert.match(simpleCss,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);assert.match(simpleCss,/@media\(max-width:760px\)/);assert.match(simpleCss,/@media\(max-width:390px\)/);assert.match(simpleCss,/font-size:16px!important/);

console.log('NEXUS SIMPLIFIED CLIENT SHELL QAQC PASS');
