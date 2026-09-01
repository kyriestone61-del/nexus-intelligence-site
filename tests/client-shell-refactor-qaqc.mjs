import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window={};
const core=await import('../portal-client-core.js');

const completeParent={id:'p',company_id:'c',project_id:null,title:'Parent',description:null,assignee:'nexus',status:'completed',priority:'high',due_date:null,dependency_task_id:null,task_type:null,phase:null,instructions:null,form_schema:null,response_data:null,completed_at:'2026-09-01T00:00:00Z',created_at:'2026-08-31T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
const incompleteParent={...completeParent,status:'not_started',completed_at:null};
const child={id:'child',company_id:'c',project_id:null,title:'Provide required system access',description:'Provide access.',assignee:'client',status:'waiting_on_client',priority:'high',due_date:'2026-09-04',dependency_task_id:'p',task_type:'access',phase:'solution_design',instructions:'Follow secure access instructions.',form_schema:[],response_data:null,completed_at:null,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};

let evaluated=core.evaluateClientActionState([incompleteParent,child]);
assert.equal(evaluated.find(x=>x.task.id==='child').state,'UPCOMING','incomplete ancestor must force UPCOMING');
assert.equal(evaluated.find(x=>x.task.id==='child').blockedByTitle,'Parent');

evaluated=core.evaluateClientActionState([completeParent,child]);
assert.equal(evaluated.find(x=>x.task.id==='child').state,'WAITING_ON_YOU','complete ancestor must unlock client task');

const grand={...completeParent,id:'g',title:'Grandparent'};
const middle={...completeParent,id:'p',dependency_task_id:'g'};
evaluated=core.evaluateClientActionState([grand,middle,child]);
assert.equal(evaluated.find(x=>x.task.id==='child').state,'WAITING_ON_YOU','multi-hop complete dependency chain must unlock');

const a={...child,id:'a',title:'A',dependency_task_id:'b'};
const b={...child,id:'b',title:'B',dependency_task_id:'a'};
evaluated=core.evaluateClientActionState([a,b]);
assert.ok(evaluated.every(x=>x.state==='UPCOMING'&&x.cycleDetected),'dependency cycles must never become actionable');

const independent={...child,id:'ready',title:'Ready now',dependency_task_id:null,priority:'high'};
const second={...child,id:'second',title:'Second ready',dependency_task_id:null,priority:'normal'};
const blocked={...child,id:'blocked-child',title:'Future task',dependency_task_id:'p'};
const ctx=core.buildWorkspaceContextFromTasks([incompleteParent,independent,second,blocked]);
assert.equal(ctx.primaryAction.taskId,'ready','Home must choose exactly one primary action');
assert.equal(ctx.secondaryActionable.length,1,'only other dependency-cleared actions belong in UP NEXT');
assert.equal(ctx.next.length,1,'blocked future task must live in Next');

const notifications=[
  {id:'n1',notification_type:'document_request',title:'Square pilot-month transaction export',message:'Financial export',created_at:'2026-09-01T01:00:00Z',read_at:null},
  {id:'n2',notification_type:'document_request',title:'Novo pilot-month statement',message:'Bank records',created_at:'2026-09-01T02:00:00Z',read_at:null},
  {id:'n3',notification_type:'document_request',title:'American Express business statement',message:'Expenses',created_at:'2026-09-01T03:00:00Z',read_at:null},
  {id:'n4',notification_type:'document_request',title:'Existing profit-and-loss template',message:'P&L',created_at:'2026-09-01T04:00:00Z',read_at:null},
  {id:'n5',notification_type:'document_request',title:'Stripe pilot-month export',message:'Revenue',created_at:'2026-09-01T05:00:00Z',read_at:null}
];
const rollups=core.aggregateNotifications(notifications);
assert.equal(rollups.length,1,'financial evidence noise must roll up to one display group');
assert.equal(rollups[0].title,'Financial pilot information requested');
assert.equal(rollups[0].itemCount,5);
assert.equal(rollups[0].completedCount,0);
assert.equal(rollups[0].cta,'Review request →');

const report=core.serializeReleasedClientReport({id:'r',status:'released',revoked_at:null,report_version:2,released_at:'2026-09-01T00:00:00Z',client_report:{title:'Client report',executive_summary:'Safe',agent_code:'secret',evidence_score:99,findings:[{title:'Finding',review_state:'internal',summary:'Safe nested'}],recommendations:['Do this']}});
assert.equal(report.executive_summary,'Safe');
assert.equal('agent_code' in report,false,'internal agent mechanics must be stripped');
assert.equal('evidence_score' in report,false,'evidence score must be stripped');
assert.equal('review_state' in report.findings[0],false,'nested internal review state must be stripped');
assert.equal(core.serializeReleasedClientReport({status:'draft',client_report:{executive_summary:'x'}}),null,'unreleased reports must never serialize');

const app=fs.readFileSync('portal-app.js','utf8');
const shell=fs.readFileSync('portal-client-shell.js','utf8');
const css=fs.readFileSync('portal-client-shell.css','utf8');
assert.match(app,/window\.__nexusOpsInit=true/,'legacy ops bootstrap must be suppressed before identity');
assert.match(app,/const platformAdmin=!!portal\.state\?\.admin/,'real administrator authorization must be captured before view-mode mutation');
assert.match(app,/preparePerspective\?\.\(portal\)[\s\S]*const useClientShell=isSignedIn&&\(!platformAdmin\|\|portal\.state\?\.viewMode==='client'\)/,'perspective must resolve before choosing client versus admin runtime');
assert.match(app,/const useAdminShell=isSignedIn&&platformAdmin&&!useClientShell/,'administrator runtime must be excluded while Client View is active');
assert.match(app,/if\(useClientShell\)\{[\s\S]*portal-client-shell\.css[\s\S]*portal-client-core\.js[\s\S]*portal-client-shell\.js[\s\S]*if\(platformAdmin\)perspectiveModule\?\.mountPerspectiveSwitcher/,'real clients and administrator Client View must share the consolidated Client Shell');
const clientBranch=app.match(/if\(useClientShell\)\{([\s\S]*?)\}\s*else if\(useAdminShell\)/)?.[1]||'';
assert.ok(clientBranch,'consolidated client runtime branch must be discoverable');
for(const legacy of ['portal-simplify.js','portal-action-workflow.js','portal-vnext-experience.js','portal-approval-inbox.js','portal-workflow-cohesion.js','portal-buildingblok-cohesion.js','portal-client-guide.js','portal-ux-refinement.js']) assert.equal(clientBranch.includes(legacy),false,`client branch must not load ${legacy}`);
assert.match(shell,/if \(state\.admin\) throw new Error\('Client Shell must not load in the Nexus admin workspace\.'\)/,'client shell must reject actual admin mode after perspective resolution');
assert.match(shell,/\[\['home', 'Home'\], \['files', 'Files'\], \['reports', 'Reports'\], \['progress', 'Progress'\], \['help', 'Help'\]\]/,'client shell must expose exactly five primary views');
assert.match(shell,/YOUR NEXT STEP/);
assert.match(shell,/Complete this step →/);
assert.match(shell,/UP NEXT — \$\{secondary\.length\}/);
assert.match(shell,/Needs action/);
assert.match(shell,/Updates/);
assert.match(shell,/Available after Nexus completes/);
assert.equal(shell.includes('new MutationObserver'),false,'consolidated client shell must not use MutationObserver patch loops');
assert.match(shell,/event\.shiftKey && document\.activeElement === first/,'focus trap must support Shift+Tab');
assert.match(shell,/event\.key === 'Escape'/,'focus manager must close on Escape');
assert.match(shell,/restoreLastFocus/,'focus manager must restore trigger focus');
assert.match(css,/min-height:44px/,'mobile controls must include 44px touch targets');
assert.match(css,/env\(safe-area-inset-bottom\)/,'mobile shell must account for bottom safe area');
assert.match(css,/overflow-x:hidden/,'mobile shell must prevent horizontal page overflow');
assert.match(css,/@media\(max-width:760px\)/,'phone breakpoint must exist');
assert.match(css,/@media\(max-width:390px\)/,'narrow phone breakpoint must exist');

console.log('NEXUS CLIENT SHELL REFACTOR QAQC PASS');