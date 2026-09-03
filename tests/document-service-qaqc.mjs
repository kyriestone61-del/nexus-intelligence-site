import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDocumentService,DEFAULT_MAX_DOCUMENT_BYTES} from '../core/document-service.js';

const COMPANY='04acb60c-0f99-4743-9b7e-effedfd1df18';
const ASSESSMENT='99762f18-ab2c-42b3-a480-a06d99d7d011';
const PILOT='e3984b11-2f63-40e2-b0de-952de1a9a0df';

function baseState(){return {
  user:{id:'client-user'},
  companyId:COMPANY,
  projects:[
    {id:PILOT,company_id:COMPANY,name:'Financial reconciliation pilot'},
    {id:ASSESSMENT,company_id:COMPANY,name:'Opportunity Assessment'}
  ],
  tasks:[
    {id:'task-pilot',company_id:COMPANY,project_id:PILOT,assignee:'client',title:'Pilot evidence'},
    {id:'task-assessment',company_id:COMPANY,project_id:ASSESSMENT,assignee:'client',title:'Assessment evidence'},
    {id:'task-nexus',company_id:COMPANY,project_id:PILOT,assignee:'nexus',title:'Internal Nexus work'}
  ],
  docRequests:[
    {id:'request-monthly-volume',company_id:COMPANY,project_id:ASSESSMENT,title:'Representative Monthly Volume Reports',sensitivity:'standard'},
    {id:'request-pilot',company_id:COMPANY,project_id:PILOT,title:'Pilot evidence',sensitivity:'financial'}
  ],
  dataRequirements:[
    {id:'requirement-pilot',company_id:COMPANY,project_id:PILOT,catalog:{sensitivity:'confidential'}}
  ],
  docs:[
    {id:'existing-doc',company_id:COMPANY,project_id:PILOT,storage_path:`${COMPANY}/existing.pdf`,file_name:'existing.pdf'}
  ]
}}

function mockSupabase({insertError=null,signedUrl='https://signed.example/file',signedError=null,downloadData={blob:true}}={}){
  const calls={uploads:[],removals:[],inserts:[],signed:[],downloads:[]};
  const storage={
    upload:async(path,file,options)=>{calls.uploads.push({path,file,options});return {data:{path},error:null}},
    remove:async(paths)=>{calls.removals.push(paths);return {data:null,error:null}},
    createSignedUrl:async(path,expiresIn,options)=>{calls.signed.push({path,expiresIn,options});return signedError?{data:null,error:signedError}:{data:{signedUrl},error:null}},
    download:async path=>{calls.downloads.push(path);return {data:downloadData,error:null}}
  };
  const sb={
    storage:{from:bucket=>{assert.equal(bucket,'nexus-client-documents');return storage}},
    from:table=>({insert:row=>({select:()=>({single:async()=>{assert.equal(table,'nexus_documents');calls.inserts.push(row);return insertError?{data:null,error:insertError}:{data:{id:`doc-${calls.inserts.length}`,...row},error:null}}})})})
  };
  return {sb,calls};
}

const file=(name='evidence.xlsx',size=1024,type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')=>({name,size,type});

// Moon Wax regression: request lineage owns project selection even when another project is first.
{
  const state=baseState();
  const {sb,calls}=mockSupabase();
  const service=createDocumentService({sb,state,now:()=>123,uuid:()=> 'uuid',refresh:async()=>{}});
  const row=await service.uploadFile({file:file('Representative_Monthly_Volume_Reports.xlsx'),requestId:'request-monthly-volume',refreshAfter:false});
  assert.equal(calls.uploads.length,1);
  assert.equal(calls.inserts.length,1);
  assert.equal(row.project_id,ASSESSMENT);
  assert.equal(row.request_id,'request-monthly-volume');
  assert.equal(row.task_id,null);
  assert.match(row.storage_path,/Representative_Monthly_Volume_Reports\.xlsx$/);
}

// Conflicting task/request lineage must fail before storage is touched.
{
  const state=baseState();
  const {sb,calls}=mockSupabase();
  const service=createDocumentService({sb,state});
  await assert.rejects(service.uploadFile({file:file(),taskId:'task-pilot',requestId:'request-monthly-volume',refreshAfter:false}),/multiple projects|one project/i);
  assert.equal(calls.uploads.length,0);
  assert.equal(calls.inserts.length,0);
  assert.equal(calls.removals.length,0);
}

// Client task attachment enforcement belongs in the canonical service.
{
  const state=baseState();
  const {sb,calls}=mockSupabase();
  const service=createDocumentService({sb,state});
  await assert.rejects(service.uploadFile({file:file(),taskId:'task-nexus',enforceClientTask:true,refreshAfter:false}),/client-owned action/i);
  assert.equal(calls.uploads.length,0);
}

// 25 MB boundary is centralized.
{
  const state=baseState();
  const {sb,calls}=mockSupabase();
  const service=createDocumentService({sb,state});
  await assert.rejects(service.uploadFile({file:file('too-big.zip',DEFAULT_MAX_DOCUMENT_BYTES+1,'application/zip')}),/25 MB/i);
  assert.equal(calls.uploads.length,0);
}

// Metadata failure after storage upload must roll back exactly once.
{
  const state=baseState();
  const {sb,calls}=mockSupabase({insertError:new Error('metadata rejected')});
  const service=createDocumentService({sb,state,now:()=>1,uuid:()=> 'rollback'});
  await assert.rejects(service.uploadFile({file:file(),requestId:'request-pilot',refreshAfter:false}),/metadata rejected/);
  assert.equal(calls.uploads.length,1);
  assert.equal(calls.removals.length,1);
  assert.equal(calls.removals[0][0],calls.uploads[0].path);
}

// Successful task batch uploads refresh once after the batch and preserve task lineage.
{
  const state=baseState();
  const {sb,calls}=mockSupabase();
  let refreshes=0;
  const progress=[];
  const service=createDocumentService({sb,state,refresh:async()=>{refreshes+=1},now:()=>2,uuid:()=>`u-${calls.uploads.length}`});
  const rows=await service.uploadFilesForTask({taskId:'task-pilot',files:[file('one.csv',20,'text/csv'),file('two.csv',20,'text/csv')],onProgress:p=>progress.push(p)});
  assert.equal(rows.length,2);
  assert.equal(calls.inserts.length,2);
  assert.ok(calls.inserts.every(row=>row.task_id==='task-pilot'&&row.project_id===PILOT&&row.category==='Action Attachment'));
  assert.equal(refreshes,1);
  assert.deepEqual(progress.map(p=>p.index),[1,2]);
}

// Download ownership: signed URL first, blob fallback only when signing fails.
{
  const state=baseState();
  const signed=mockSupabase();
  const signedService=createDocumentService({sb:signed.sb,state});
  const target=await signedService.createDownloadTarget('existing-doc');
  assert.equal(target.kind,'signed_url');
  assert.equal(target.fileName,'existing.pdf');
  assert.equal(signed.calls.downloads.length,0);

  const fallback=mockSupabase({signedError:new Error('signing unavailable'),downloadData:{kind:'blob'}});
  const fallbackService=createDocumentService({sb:fallback.sb,state});
  const fallbackTarget=await fallbackService.createDownloadTarget('existing-doc');
  assert.equal(fallbackTarget.kind,'blob');
  assert.deepEqual(fallbackTarget.blob,{kind:'blob'});
  assert.equal(fallback.calls.downloads.length,1);
}

// Architecture ownership contract: after facade migration, persistence belongs only to core DocumentService.
const canonical=fs.readFileSync('core/document-service.js','utf8');
const facade=fs.readFileSync('portal-client-upload-service.js','utf8');
assert.match(canonical,/from\('nexus_documents'\)/,'canonical DocumentService must own document metadata insertion');
assert.match(canonical,/\.storage\.from\(bucket\)\.upload/,'canonical DocumentService must own storage upload');
assert.match(canonical,/remove\(\[path\]\)/,'canonical DocumentService must own rollback');
assert.match(canonical,/createSignedUrl/,'canonical DocumentService must own signed download targets');
assert.match(facade,/createDocumentService|services\.documents/,'client upload facade must delegate to canonical DocumentService');
assert.doesNotMatch(facade,/from\('nexus_documents'\)/,'client upload facade must not insert document rows directly');
assert.doesNotMatch(facade,/\.storage\.from\([^)]*\)\.upload/,'client upload facade must not write storage directly');

for(const source of [canonical,facade])assert.equal(/service[_-]?role|SUPABASE_SERVICE|RESEND_API_KEY|TWILIO_AUTH_TOKEN|SECRET_KEY/.test(source),false,'browser document code must not contain privileged credentials');

console.log('NEXUS DOCUMENT SERVICE QAQC PASS');
