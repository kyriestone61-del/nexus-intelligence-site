import assert from 'node:assert/strict';
import fs from 'node:fs';

const COMPANY='04acb60c-0f99-4743-9b7e-effedfd1df18';
const ASSESSMENT='99762f18-ab2c-42b3-a480-a06d99d7d011';
const PILOT='e3984b11-2f63-40e2-b0de-952de1a9a0df';

async function importSource(path){
  const source=fs.readFileSync(path,'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const {resolveEngagementContext,requireActiveProject}=await importSource('core/engagement-context.js');
const {createWorkspaceQueryCoordinator}=await importSource('core/workspace-query-coordinator.js');

const projects=[
  {id:PILOT,company_id:COMPANY,name:'One-period financial reconciliation evidence pilot',status:'planning',engagement_stage:'diagnosis'},
  {id:ASSESSMENT,company_id:COMPANY,name:'Nexus Opportunity Assessment',status:'planning',engagement_stage:'diagnosis'}
];

// Moon Wax regression: two open projects exist, so array order must never select the engagement.
{
  const context=resolveEngagementContext({
    companyId:COMPANY,
    projects,
    activeEngagement:{company_id:COMPANY,project_id:PILOT}
  });
  assert.equal(context.activeProjectId,PILOT);
  assert.equal(context.activeProject.id,PILOT);
  assert.equal(context.source,'explicit');
  assert.equal(context.ambiguous,false);
  assert.deepEqual(context.openProjectIds,[PILOT,ASSESSMENT]);
}

// Explicit active engagement must win even if projects are reordered.
{
  const context=resolveEngagementContext({
    companyId:COMPANY,
    projects:[...projects].reverse(),
    activeEngagement:{company_id:COMPANY,project_id:PILOT}
  });
  assert.equal(context.activeProjectId,PILOT);
}

// A single open project is a safe compatibility fallback.
{
  const context=resolveEngagementContext({companyId:COMPANY,projects:[projects[1]],activeEngagement:null});
  assert.equal(context.activeProjectId,ASSESSMENT);
  assert.equal(context.source,'single_open_project');
  assert.equal(context.ambiguous,false);
}

// Multiple open projects without an explicit pointer must fail closed, never pick projects[0].
{
  const context=resolveEngagementContext({companyId:COMPANY,projects,activeEngagement:null});
  assert.equal(context.activeProjectId,null);
  assert.equal(context.activeProject,null);
  assert.equal(context.ambiguous,true);
  assert.equal(context.source,'ambiguous');
  assert.throws(()=>requireActiveProject(context),/active engagement|multiple open projects|ambiguous/i);
}

assert.throws(
  ()=>resolveEngagementContext({companyId:COMPANY,projects,activeEngagement:{company_id:'other-company',project_id:PILOT}}),
  /company/i,
  'cross-company active engagement must fail closed'
);

assert.throws(
  ()=>resolveEngagementContext({companyId:COMPANY,projects,activeEngagement:{company_id:COMPANY,project_id:'missing-project'}}),
  /project.*not found|active engagement.*project/i,
  'stale active-engagement pointers must fail closed'
);

// Single-flight workspace queries: concurrent duplicate loads share one underlying request.
{
  const coordinator=createWorkspaceQueryCoordinator();
  let calls=0;
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  const loader=async()=>{calls+=1;await gate;return {revision:calls}};
  const one=coordinator.run(`company:${COMPANY}`,loader);
  const two=coordinator.run(`company:${COMPANY}`,loader);
  assert.equal(calls,1,'duplicate in-flight workspace loads must coalesce');
  release();
  const [a,b]=await Promise.all([one,two]);
  assert.deepEqual(a,b);
  assert.equal(calls,1);

  await coordinator.run(`company:${COMPANY}`,async()=>{calls+=1;return {revision:calls}});
  assert.equal(calls,2,'a completed load must not become a permanent cache');
}

// Explicit invalidation creates a fresh generation instead of reusing an older request.
{
  const coordinator=createWorkspaceQueryCoordinator();
  let calls=0;
  let releaseFirst;
  const first=coordinator.run('company:test',async()=>{calls+=1;await new Promise(resolve=>{releaseFirst=resolve});return 'old'});
  coordinator.invalidate('company:test');
  const second=coordinator.run('company:test',async()=>{calls+=1;return 'fresh'});
  assert.equal(await second,'fresh');
  assert.equal(calls,2);
  releaseFirst();
  assert.equal(await first,'old');
}

const portal=fs.readFileSync('portal-client.js','utf8');
assert.match(portal,/resolveEngagementContext/,'base portal must resolve a canonical engagement context');
assert.match(portal,/nexus_active_engagements/,'base portal must read the explicit active-engagement pointer');
assert.match(portal,/engagementContext/,'workspace state must carry canonical engagement context');
assert.match(portal,/activeProjectId/,'workspace state must expose the canonical active project id');
assert.match(portal,/createWorkspaceQueryCoordinator/,'workspace must use the single-flight query coordinator');
assert.match(portal,/workspaceQueryCoordinator\.run/,'workspace loads must be coalesced through the coordinator');
assert.match(portal,/fetchDataRequirements\(engagementContext\.activeProject\)/,'project-scoped preparation must load from the canonical active engagement');
assert.match(portal,/state\.engagementContext\?\.activeProject/,'project rendering must consume canonical engagement context');
assert.doesNotMatch(portal,/state\.projects\[0\]/,'base portal must not use projects[0] as business context');
assert.doesNotMatch(portal,/state\.projects\?\.\[0\]\?\.id/,'base portal must not infer project ids from projects[0]');

console.log('NEXUS ENGAGEMENT CONTEXT + WORKSPACE DEDUP QAQC PASS');
