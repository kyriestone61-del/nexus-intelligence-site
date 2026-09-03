import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveDocumentContext} from '../core/document-context.js';
import {createDocumentService} from '../core/document-service.js';

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

// Context resolver remains independently testable.
{
  const resolved=resolveDocumentContext({...base,requestId:'request-monthly-volume'});
  assert.equal(resolved.projectId,ASSESSMENT,'request-bound upload must use the request project, not projects[0]');
}
{
  const resolved=resolveDocumentContext({...base,requirementId:'requirement-assessment'});
  assert.equal(resolved.projectId,ASSESSMENT);
}
{
  const resolved=resolveDocumentContext({...base,taskId:'task-pilot'});
  assert.equal(resolved.projectId,PILOT);
}
assert.throws(()=>resolveDocumentContext({...base,taskId:'task-pilot',requestId:'request-monthly-volume'}),/multiple projects|one project/i);
assert.throws(()=>resolveDocumentContext({...base,requestId:'missing-request'}),/request.*not found|could not be found/i);
assert.throws(()=>resolveDocumentContext({...base,docRequests:[{id:'other-company-request',company_id:'other-company',project_id:ASSESSMENT}],requestId:'other-company-request'}),/company/i);

// Transaction-level regression executes canonical DocumentService, not the UI facade.
{
  let storageUploads=0,storageRemovals=0;
  const insertedRows=[];
  const state={user:{id:'client-user'},...base,docs:[]};
  const sb={
    storage:{from:()=>({
      upload:async()=>{storageUploads+=1;return {error:null}},
      remove:async()=>{storageRemovals+=1;return {error:null}},
      createSignedUrl:async()=>({data:{signedUrl:'https://example.invalid'},error:null}),
      download:async()=>({data:{},error:null})
    })},
    from:table=>({insert:row=>({select:()=>({single:async()=>{assert.equal(table,'nexus_documents');insertedRows.push(row);return {data:{id:`doc-${insertedRows.length}`,...row},error:null}}})})})
  };
  const documents=createDocumentService({sb,state,now:()=>1,uuid:()=> 'u'});
  await documents.uploadFile({file:{name:'Representative_Monthly_Volume_Reports.xlsx',size:1024,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},requestId:'request-monthly-volume',refreshAfter:false});
  assert.equal(storageUploads,1);
  assert.equal(insertedRows[0].project_id,ASSESSMENT);
  assert.equal(insertedRows[0].request_id,'request-monthly-volume');

  const before=storageUploads;
  await assert.rejects(documents.uploadFile({file:{name:'conflicting.xlsx',size:100,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},taskId:'task-pilot',requestId:'request-monthly-volume',refreshAfter:false}),/multiple projects|one project/i);
  assert.equal(storageUploads,before,'conflicting context must fail before storage');
  assert.equal(storageRemovals,0,'pre-storage rejection must not need rollback');
}

const canonical=fs.readFileSync('core/document-service.js','utf8');
const facade=fs.readFileSync('portal-client-upload-service.js','utf8');
assert.match(canonical,/resolveDocumentContext/,'DocumentService must own lineage resolution');
assert.match(canonical,/const context=contextFor\(/,'DocumentService must resolve context before persistence');
const contextIndex=canonical.indexOf('const context=contextFor('),storageIndex=canonical.indexOf('storage.from(bucket).upload');
assert.ok(contextIndex>=0&&storageIndex>=0&&contextIndex<storageIndex,'context must resolve before storage upload');
assert.match(facade,/documents\.uploadFile/,'client upload facade must delegate uploads');
assert.doesNotMatch(facade,/resolveDocumentContext/,'UI facade must not own lineage resolution');
assert.doesNotMatch(facade,/state\.projects\?\.\[0\]\?\.id/,'UI facade must never infer project lineage from array order');

console.log('NEXUS CLIENT UPLOAD CONTEXT QAQC PASS');
