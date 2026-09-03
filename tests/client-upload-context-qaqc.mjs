import assert from 'node:assert/strict';
import fs from 'node:fs';

const contextSource=fs.readFileSync('core/document-context.js','utf8');
const contextDataUrl=`data:text/javascript;base64,${Buffer.from(contextSource).toString('base64')}`;
const contextModule=await import(contextDataUrl);
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

// Browser-module transaction harness. It executes the actual uploadFile implementation
// with mocked Supabase adapters and strips only the unrelated task-file dynamic-import tail.
{
  let storageUploads=0;
  let storageRemovals=0;
  const insertedRows=[];
  const state={
    user:{id:'client-user'},
    companyId:COMPANY,
    projects:base.projects,
    tasks:base.tasks,
    docRequests:base.docRequests,
    dataRequirements:base.dataRequirements
  };
  const sb={
    storage:{from:()=>({
      upload:async()=>{storageUploads+=1;return {error:null}},
      remove:async()=>{storageRemovals+=1;return {error:null}}
    })},
    from:table=>({
      insert:row=>({select:()=>({single:async()=>{
        assert.equal(table,'nexus_documents');
        insertedRows.push(row);
        return {data:{id:`doc-${insertedRows.length}`,...row},error:null};
      }})})
    })
  };
  const runtime={events:{bind:()=>{}},boundary:{wrap:(_label,fn)=>fn}};
  globalThis.document={getElementById:()=>null,querySelector:()=>null,head:{appendChild:()=>{}},createElement:()=>({})};
  globalThis.window={NexusPortal:{sb,state,runtime,toast:()=>{},log:async()=>{},workspace:async()=>{}}};

  const executableUpload=upload
    .replace("from '/core/document-context.js'",`from '${contextDataUrl}'`)
    .replace(/\nconst TASK_FILE_BUILD=[\s\S]*$/,'');
  await import(`data:text/javascript;base64,${Buffer.from(executableUpload).toString('base64')}`);
  const service=globalThis.window.NexusClientUploadService;
  assert.ok(service,'actual upload module must expose the client upload service');

  await service.uploadFile({
    file:{name:'Representative_Monthly_Volume_Reports.xlsx',size:1024,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
    requestId:'request-monthly-volume',
    refresh:false
  });
  assert.equal(storageUploads,1,'valid request-bound upload should write storage exactly once');
  assert.equal(insertedRows.length,1,'valid request-bound upload should write one document row');
  assert.equal(insertedRows[0].project_id,ASSESSMENT,'document metadata must use the selected request project');
  assert.equal(insertedRows[0].request_id,'request-monthly-volume');

  const beforeConflictUploads=storageUploads;
  await assert.rejects(
    service.uploadFile({
      file:{name:'conflicting.xlsx',size:100,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
      taskId:'task-pilot',
      requestId:'request-monthly-volume',
      refresh:false
    }),
    /multiple projects|same project|conflicting/i
  );
  assert.equal(storageUploads,beforeConflictUploads,'conflicting lineage must fail before storage is called');
  assert.equal(storageRemovals,0,'pre-storage context rejection must not require rollback cleanup');
}

console.log('NEXUS CLIENT UPLOAD CONTEXT QAQC PASS');
