import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {database,asUser} from './fixture.mjs';
import {serviceAdapter,deterministicDiscoveryModel} from './discovery-model-fixture.mjs';
import {discoveryWork} from '../../supabase/functions/_shared/relystra-discovery-handler.ts';
import {requestModel} from '../../supabase/functions/_shared/relystra-model-client.ts';
import {applyFreeDiagnosisReview,discoverySections} from '../../supabase/functions/_shared/relystra-discovery-evidence.ts';
import {functionFailure} from '../../portal-function-errors.js';
const migrations=(await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(n=>/^202609(?:0[789]|10)/.test(n)&&!n.includes('000100_')&&!n.includes('000200_')&&!n.includes('launch_security_controls')&&!n.includes('retire_unsafe_snapshot')).sort();
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',co='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
test('free unpaid generation deduplicates sources, persists revisions and reviews, isolates sessions and protects jobs',async()=>{
 const db=await database(migrations);
 try{
  await db.exec(`insert into auth.users values('${admin}'),('${client}');insert into nexus_platform_admins(user_id) values('${admin}');insert into nexus_companies(id,name,created_by) values('${co}','Recovery fixture','${admin}'),('${other}','Other tenant','${admin}');insert into nexus_company_members(company_id,user_id,member_role,active) values('${co}','${client}','owner',true);`);
  const files=new Map();for(const [name,text] of [['one.txt','Owner: intake is manual.'],['copy.txt','Owner: intake is manual.'],['two.txt','Coordinator: scheduling needs clear ownership.']]){
   const id=crypto.randomUUID();files.set(id,text);await db.query("insert into nexus_documents(id,company_id,storage_path,file_name,category,uploaded_by) values($1,$2,$3,$4,'Discovery Transcript',$5)",[id,co,co+'/'+name,name,admin]);
  }
  const workspace=(action='view',run=null)=>asUser(db,client,()=>db.query('select relystra_discovery_workspace($1,null,$2,null,$3) s',[co,action,run]).then(r=>r.rows[0].s));
  const snapshot=()=>asUser(db,client,()=>db.query('select relystra_workspace_snapshot($1,null) s',[co]).then(r=>r.rows[0].s));
  let s=await workspace('process');
  const deps={db:serviceAdapter(db),config:async()=>({}),hash:async text=>createHash('sha256').update(text).digest('hex'),parse:async doc=>({text:files.get(doc.id),parsed:true,parser:'text'}),call:deterministicDiscoveryModel};
  const drain=async()=>{for(let i=0;i<30;i++){const r=await discoveryWork(deps,s.id);if(!r.ok||r.action==='idle'||r.action==='complete')return r;}throw Error('Worker did not terminate');};
  await drain();assert.equal((await snapshot()).workflow.current_step,2);assert.equal((await snapshot()).diagnosis.access,false);
  const key=crypto.randomUUID();const request=(id=key,regen=false)=>asUser(db,client,()=>db.query('select relystra_request_free_diagnosis($1,null,$2,$3) s',[co,id,regen]).then(r=>r.rows[0].s));
  s=await request();const first=s.reports[0];assert.equal(first.document_ids.length,3);assert.equal(first.source_ids.length,2);assert.equal(s.documents.filter(d=>d.duplicate_of).length,1);
  assert.equal((await request()).reports.length,1);assert.equal((await request(crypto.randomUUID(),true)).reports.length,1);
  await assert.rejects(db.query('insert into relystra_free_diagnoses(engagement_id,evidence_revision,version,document_ids,source_ids) values($1,1,999,$2,$3)',[s.id,[],[]]),/unique/);
  deps.call=async()=>{throw Error('A positive credit balance is required for all requests, including BYOK');};
  const failed=await drain();assert.equal(failed.error_code,'AI_GATEWAY_BALANCE_REQUIRED');assert.doesNotMatch(failed.error,/credit|billing|MODEL_TIMEOUT/);
  s=await workspace();assert.equal(s.reports[0].status,'failed');assert.equal(s.documents.filter(d=>d.state==='parsed').length,3);assert.equal((await db.query('select count(*) n from relystra_discovery_chunks')).rows[0].n,3);
  assert.equal((await request()).reports.length,1,'lost-response request key never starts a new revision');
  deps.call=deterministicDiscoveryModel;s=await request(crypto.randomUUID());assert.equal(s.reports.length,2);await drain();
  let snap=await snapshot();assert.equal(snap.workflow.current_step,3);assert.equal(snap.free_discovery.reports[0].status,'complete');const run=snap.free_discovery.reports[0].id;
  assert.equal((await snapshot()).workflow.free_run_id,run,'reload obtains durable server result');
  const adminRead=await asUser(db,admin,()=>db.query('select relystra_workspace_snapshot($1,null) s',[co]));assert.equal(adminRead.rows[0].s.workflow.free_run_id,run,'independent authenticated session sees result');
  await workspace('verified',run);assert.equal((await snapshot()).workflow.current_step,4);assert.equal((await snapshot()).diagnosis.access,false,'review never grants paid access');
  await asUser(db,client,()=>assert.rejects(db.query('select relystra_workspace_snapshot($1,null)',[other]),/access required/));
  const complete=await workspace();await request(crypto.randomUUID(),true);s=await workspace();assert.equal(s.reports.length,3);assert.deepEqual(s.reports[1].report,complete.reports[0].report,'explicit regeneration preserves history');
 }finally{await db.close()}
});
test('model errors preserve gateway balance, provider timeout, auth, malformed and empty distinctions',async()=>{
 const call=(status,payload)=>requestModel('https://proxy.invalid','test-token','test/model',[],0,1000,async()=>new Response(JSON.stringify(payload),{status}));
 await assert.rejects(call(502,{detail:'A positive credit balance is required for all requests, including BYOK'}),e=>e.code==='AI_GATEWAY_BALANCE_REQUIRED');
 await assert.rejects(call(504,{error:'Provider timed out'}),e=>e.code==='MODEL_TIMEOUT');
 await assert.rejects(call(401,{error:'Unauthorized'}),e=>e.code==='AI_GATEWAY_AUTH_ERROR');
 await assert.rejects(call(503,{error:'Provider down'}),e=>e.code==='AI_PROVIDER_UNAVAILABLE');
 await assert.rejects(call(200,{}),e=>e.code==='MODEL_RESPONSE_EMPTY');
 await assert.rejects(requestModel('https://proxy.invalid','test-token','m',[],0,1000,async()=>new Response('not json')),e=>e.code==='MODEL_OUTPUT_MALFORMED');
 assert.equal(await call(200,{choices:[{message:{content:'saved model result'}}]}),'saved model result');
});
test('application deadline includes response body consumption and is distinct from provider timeout',async()=>{
 await assert.rejects(requestModel('https://proxy.invalid','test-token','m',[],0,5,async(_url,{signal})=>({ok:true,status:200,text:()=>new Promise((resolve,reject)=>{const keepAlive=setTimeout(()=>resolve('{}'),100);signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(signal.reason)});})})),e=>e.code==='APPLICATION_TIMEOUT');
});
test('coverage errors decode non-2xx JSON without leaking billing or raw function messages',async()=>{
 const e=await functionFailure({error:{message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify({error_code:'AI_GATEWAY_BALANCE_REQUIRED',error:'private billing details'}),{status:503})}},'Discovery coverage');
 assert.equal(e.code,'AI_GATEWAY_BALANCE_REQUIRED');assert.match(e.message,/Discovery coverage/);assert.doesNotMatch(e.message,/billing|non-2xx/);
});
test('bounded QA corrections preserve unmodified findings and reject foreign references',()=>{
 const draft={...Object.fromEntries(discoverySections.map(k=>[k,[{text:'Owner says intake is manual.',confidence:'strongly_indicated',source_refs:['source']}]])),contradictions:[]};
 const review={corrections:[],qa:{pass:true,issues:[]}};assert.deepEqual(applyFreeDiagnosisReview(draft,review,['source']).key_findings,draft.key_findings);
 review.corrections=[{section:'key_findings',items:[{text:'Invented',confidence:'confirmed',source_refs:['foreign']}]}];assert.throws(()=>applyFreeDiagnosisReview(draft,review,['source']),/INVALID/);
 review.corrections=[{section:'__proto__',items:[]}];assert.throws(()=>applyFreeDiagnosisReview(draft,review,['source']),/INVALID/);
});
