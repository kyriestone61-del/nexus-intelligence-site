import assert from 'node:assert/strict';
import fs from 'node:fs';

const contextSource=fs.readFileSync('app/services/document-context.js','utf8');
const contextModule=await import(`data:text/javascript;base64,${Buffer.from(contextSource).toString('base64')}`);
const {resolveDocumentContext}=contextModule;

const COMPANY='04acb60c-0f99-4743-9b7e-effedfd1df18';
const ASSESSMENT='99762f18-ab2c-42b3-a480-a06d99d7d011';
const PILOT='e3984b11-2f63-40e2-b0de-952de1a9a0df';

const base={
  companyId:COMPANY,
  projects:[
    {id:PILOT,company_id:COMPANY,name:'One-period financial reconciliation evidence pilot'},
    {id:ASSESSMENT,company_id:COMPANY,name:'Nexus Opportunity Assessment'}
  ],
  tasks:[
    {id:'task-pilot',company_id:COMPANY,project_id:PILOT,assignee:'client',title:'Pilot task'},
    {id:'task-assessment',company_id:COMPANY,project_id:ASSESSMENT,assignee:'client',title:'Assessment task'}
  ],
  docRequests:[
    {id:'request-monthly-volume',company_id:COMPANY,project_id:ASSESSMENT,title:'Representative Monthly Volume Reports'},
    {id:'request-pilot',company_id:COMPANY,project_id:PILOT,title:'Pilot evidence'}
  ],
  dataRequirements:[
    {id:'requirement-assessment',company_id:COMPANY,project_id:ASSESSMENT},
    {id:'requirement-pilot',company_id:COMPANY,project_id:PILOT}
  ]
};

// Production regression: the selected request belongs to the Opportunity Assessment,
// while the first project in state is the financial reconciliation pilot. The request
// must own context; array order must never decide document lineage.
{
  const resolved=resolveDocumentContext({...base,requestId:'request-monthly-volume'});
  assert.equal(resolved.projectId,ASSESSMENT,'request-bound upload must use the request project, not projects[0]');
  assert.equal(resolved.request.id,'request-monthly-volume');
}

{
  const resolved=resolveDocumentContext({...base,requirementId:'requirement-assessment'});
  assert.equal(resolved.projectId,ASSESSMENT,'requirement-bound upload must use the requirement project');
}

{
  const resolved=resolveDocumentContext({...base,taskId:'task-pilot'});
  assert.equal(resolved.projectId,PILOT,'task-bound upload must use the task project');
}

{
  const resolved=resolveDocumentContext({...base,taskId:'task-assessment',requestId:'request-monthly-volume',requirementId:'requirement-assessment'});
  assert.equal(resolved.projectId,ASSESSMENT,'consistent multi-source context must resolve to one project');
}

assert.throws(
  ()=>resolveDocumentContext({...base,taskId:'task-pilot',requestId:'request-monthly-volume'}),
  /multiple projects|same project|conflicting/i,
  'conflicting task/request projects must fail before storage upload'
);

assert.throws(
  ()=>resolveDocumentContext({...base,requestId:'missing-request'}),
  /request.*not found|could not be found/i,
  'unknown request ids must fail closed'
);

assert.throws(
  ()=>resolveDocumentContext({...base,docRequests:[{id:'other-company-request',company_id:'other-company',project_id:ASSESSMENT}],requestId:'other-company-request'}),
  /company/i,
  'cross-company request context must fail closed'
);

{
  const resolved=resolveDocumentContext({...base});
  assert.equal(resolved.projectId,null,'unbound general evidence must remain company-level instead of guessing a project');
}

const upload=fs.readFileSync('portal-client-upload-service.js','utf8');
assert.match(upload,/resolveDocumentContext/,'upload service must delegate lineage selection to the canonical context resolver');
assert.doesNotMatch(upload,/state\.projects\?\.\[0\]\?\.id/,'upload service must never infer document project from projects[0]');
const contextIndex=upload.indexOf('resolveDocumentContext({');
const storageIndex=upload.indexOf('.storage.from(BUCKET).upload');
assert.ok(contextIndex>=0&&storageIndex>=0&&contextIndex<storageIndex,'document context must be resolved before any storage upload begins');

console.log('NEXUS CLIENT UPLOAD CONTEXT QAQC PASS');
