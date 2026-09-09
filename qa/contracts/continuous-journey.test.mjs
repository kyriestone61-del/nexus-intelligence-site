import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyProgress,journeyGate,journeyMarkup,currentTranscript,journeyNext} from '../../portal-journey-steps.js';
import {persistEvidence} from '../../portal-evidence-upload.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const base={company_id:'co',diagnosis:{access:false,status:null}};
test('all ten stages stay visible while gates prevent premature delivery',()=>{
  for(const snapshot of [base,{...base,diagnosis:{access:true}},{...base,diagnosis:{status:'approved'}},{...base,package:{stage:'client_review'}},{...base,package:{stage:'completed'}}]){
    assert.equal(journeyProgress(snapshot).length,10);assert.equal((journeyMarkup(snapshot).match(/<li /g)||[]).length,10);
    assert.equal(journeyProgress(snapshot).filter(s=>s.status==='current').length,snapshot.package?.stage==='completed'?0:1);
  }
  assert.ok(journeyGate('builds',base));assert.ok(journeyGate('progress',base));assert.ok(journeyGate('support',{...base,package:{stage:'client_review'}}));assert.equal(journeyGate('transcript',base),null);
  assert.equal(journeyGate('progress',{...base,project_id:'legacy',project_type:'legacy'}),null);
});
test('the numbered journey owns its layout instead of inheriting the global site nav flex rule',()=>{
  const css=readFileSync('portal-delivery.css','utf8');
  assert.match(css,/\.relystra-numbered-journey\{display:block/);
  assert.match(css,/@media\(max-width:760px\).*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
});
test('the client shell applies lifecycle visibility to its compact navigation',()=>{
  const shell=readFileSync('portal-client-shell-v2.js','utf8');
  assert.match(shell,/visibleDeliverySections/);
  assert.match(shell,/function updatePrimaryNavigation\(\)/);
  assert.match(shell,/button\.toggleAttribute\('hidden',!visible\.has\(button\.dataset\.clientView\)\)/);
  assert.match(shell,/updateMiniContext\(\);updatePrimaryNavigation\(\);renderInbox\(\)/);
});
test('the client action surface excludes historical and delivery work once diagnosis-led Actions exist',()=>{
  const engine=readFileSync('portal-action-processing-engine.js','utf8');
  assert.match(engine,/function clientActionTasks\(\)/);
  assert.match(engine,/rows\.some\(task=>task\.work_kind==='prebuild_action'\)/);
  assert.match(engine,/task\.work_kind==='prebuild_action'&&task\.action_review_state==='approved'/);
  assert.match(engine,/!\['build_task','legacy'\]\.includes\(task\.work_kind\)/);
  assert.match(engine,/const tasks=clientActionTasks\(\)/);
});
test('the portal ships labelled controls, a keyboard skip target, and labelled modal registration',()=>{
  const html=readFileSync('portal.html','utf8'),runtime=readFileSync('portal-runtime-core.js','utf8');
  assert.match(html,/id="nexusSkipLink"[^>]+href="#nexusMainContent"/);
  assert.match(html,/id="nexusMainContent"[^>]+tabindex="-1"/);
  assert.match(html,/label for="signInEmail"/);
  assert.match(html,/class="modal" role="dialog" aria-modal="true" aria-hidden="true"/);
  assert.match(runtime,/modal\.setAttribute\('aria-labelledby', heading\.id\)/);
});
test('transcript next step respects access, saved evidence, and existing diagnosis',()=>{
  assert.equal(journeyNext(base).section,'overview');
  assert.equal(journeyNext({...base,diagnosis:{access:true}}).section,'transcript');
  assert.equal(journeyProgress({...base,diagnosis:{access:true,status:'draft'}})[1].status,'current');
  assert.equal(journeyProgress({...base,diagnosis:{access:true}},true)[2].status,'current');
  assert.equal(journeyNext({...base,diagnosis:{access:true,status:'failed'}}).section,'diagnosis');
});
test('saved transcript selection cannot cross company or package',()=>{
  const state={companyId:'co',docs:[{id:'foreign',company_id:'other',category:'Discovery Transcript'},{id:'old',company_id:'co',project_id:'old',category:'Discovery Transcript'},{id:'meeting',company_id:'co',project_id:null,category:'Discovery Transcript'}]};
  assert.equal(currentTranscript(state,null,'foreign').id,'meeting');assert.equal(currentTranscript(state,null,'old').id,'meeting');assert.equal(currentTranscript(state,'old','old').id,'old');
});
function uploadHarness(insertError=null){let removed=0,inserted,uploaded=0;const bucket={upload:async()=>{uploaded++;return{}},remove:async()=>{removed++;return{}}};return{sb:{storage:{from:()=>bucket},from:()=>({insert(row){inserted=row;return{select:()=>({single:async()=>({data:{id:'doc',...row},error:insertError})})}}})},get removed(){return removed},get uploaded(){return uploaded},get row(){return inserted}}}
const file={name:'meeting.txt',size:20,type:'text/plain'};
test('private upload commits correct associations and only rolls back an uncommitted file',async()=>{
  const h=uploadHarness();const doc=await persistEvidence(h.sb,{file,companyId:'co',userId:'user',requestId:'req',taskId:'task',projectId:'package'});
  assert.equal(doc.request_id,'req');assert.equal(doc.task_id,'task');assert.equal(doc.project_id,'package');assert.equal(h.removed,0);
  const failed=uploadHarness(new Error('insert denied'));await assert.rejects(persistEvidence(failed.sb,{file,companyId:'co',userId:'user'}),/insert denied/);assert.equal(failed.removed,1);
  await assert.rejects(persistEvidence(h.sb,{file:{...file,size:0},companyId:'co',userId:'user'}),/non-empty/);assert.equal(h.uploaded,1);
});
test('verified session refresh preserves preview role and workspace selection',async()=>{
 const src=readFileSync('portal-client.js','utf8'),fn='async function identity(userOverride=null){'+src.split('async function identity(userOverride=null){')[1].split('async function companies')[0];
 const state={user:{id:'admin'},admin:false,platformAdmin:true,authorizationStatus:'verified',companyId:'moon',viewMode:'client'};let loads=0;
 const ctx={state,stateController:{patch:p=>Object.assign(state,p)},ensureProfile:async()=>{},resolveAdmin:async()=>true,companies:async()=>{loads++},show(){}};
 const run=vm.runInNewContext(`let identityInFlight=null,identityUserId='admin';${fn};identity`,ctx);await run({id:'admin'});assert.equal(loads,0);assert.equal(state.admin,false);assert.equal(state.companyId,'moon');
});
test('async company switching retains its select element after the DOM event dispatch ends',()=>{
 const src=readFileSync('portal-client.js','utf8');
 assert.match(src,/const select=event\.currentTarget,nextId=select\?\.value/);
 assert.match(src,/finally\{if\(select\.isConnected\)select\.disabled=false\}/);
 assert.doesNotMatch(src,/finally\{event\.currentTarget\.disabled=false\}/);
});
test('failed authorization is explicit and cannot select a client shell',async()=>{
 const src=readFileSync('portal-client.js','utf8'),fn='async function identity(userOverride=null){'+src.split('async function identity(userOverride=null){')[1].split('async function companies')[0];
 const state={};const run=vm.runInNewContext(`let identityInFlight=null,identityUserId=null;${fn};identity`,{state,stateController:{patch:p=>Object.assign(state,p)},ensureProfile:async()=>{},resolveAdmin:async()=>{throw Error('offline')},companies:async()=>{throw Error('must not load')},show(){}});
 await assert.rejects(run({id:'admin'}),/offline/);assert.equal(state.authorizationStatus,'error');assert.match(readFileSync('portal-app.js','utf8'),/authorizationStatus!=='verified'/);
});
test('post-commit refresh failure returns the saved upload and never removes its private file',async()=>{
 const src=readFileSync('portal-client-upload-service.js','utf8'),fn='async function uploadFile('+src.split('async function uploadFile(')[1].split('async function uploadFilesForTask')[0];
 const h=uploadHarness(),state={companyId:'co',user:{id:'user'}},messages=[];
 const run=vm.runInNewContext(`${fn};uploadFile`,{state,sb:h.sb,MAX_BYTES:26214400,persistEvidence,assertTaskBoundary:()=>null,requestFor:()=>null,requirementFor:()=>null,cacheUploadedDocument(){},toast:m=>messages.push(m),portal:{workspace:async()=>{throw Error('refresh offline')}}});
 const doc=await run({file});assert.equal(doc.company_id,'co');assert.equal(h.removed,0);assert.match(messages[0],/File saved/);
});
