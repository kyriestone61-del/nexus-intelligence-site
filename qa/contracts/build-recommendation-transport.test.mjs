import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {onRequest}=await import(`data:text/javascript;base64,${Buffer.from(await fs.readFile('functions/api/build-recommendations.js')).toString('base64')}`);
const {requestBuildRecommendations}=await import(`data:text/javascript;base64,${Buffer.from(await fs.readFile('portal-build-request.js')).toString('base64')}`);
const company='43d2d528-db18-401a-8261-77f6262711f9',run='a290398a-a721-48c5-83ee-668ef57093cb';
const request=(body={company_id:company,run_id:run},authorization='Bearer test-caller')=>new Request('https://portal.test/api/build-recommendations',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(body)});

test('recommendation transport rejects missing auth and invalid identifiers without reaching upstream',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw Error('must not fetch')});
  assert.equal((await onRequest({request:request({},'')})).status,401);
  assert.equal((await onRequest({request:request({company_id:company,run_id:'bad'})})).status,400);
  assert.equal((await onRequest({request:new Request('https://portal.test/api/build-recommendations')})).status,405);
});
test('recommendation relay forwards only the caller and fixed operation, preserving admin rejection',async t=>{
  let count=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    count++;assert.equal(url,'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/nexus-diagnosis-execute');
    assert.equal(options.headers.authorization,'Bearer test-caller');
    assert.equal(options.redirect,'manual');assert.ok(options.signal);
    assert.deepEqual(JSON.parse(options.body),{operation:'recommend_builds',company_id:company,run_id:run,catalog_after:''});
    return Response.json({ok:false,error:'ADMIN_REQUIRED'},{status:403});
  });
  const response=await onRequest({request:request({company_id:company,run_id:run,operation:'ask_support',url:'https://attacker.test'})});
  assert.equal(response.status,403);assert.equal((await response.json()).error,'ADMIN_REQUIRED');assert.equal(count,1);
});
test('transport failures return actionable status and never repeat an ambiguous generation',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async()=>{count++;throw new DOMException('expired','TimeoutError')});
  const response=await onRequest({request:request()});assert.equal(response.status,504);
  const body=await response.json();assert.equal(body.error,'BUILD_SERVICE_TIMEOUT');assert.ok(body.request_id);assert.equal(count,1);
});
test('browser uses same-origin relay and returns real generation IDs',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'/api/build-recommendations');assert.equal(options.headers.authorization,'Bearer caller');
    assert.deepEqual(JSON.parse(options.body),{company_id:company,run_id:run,catalog_after:''});
    return Response.json({ok:true,build_ids:['existing-build']});
  });
  const result=await requestBuildRecommendations({auth:{getSession:async()=>({data:{session:{access_token:'caller'}}})}},company,run);
  assert.deepEqual(result.build_ids,['existing-build']);
});
test('browser distinguishes upstream failure and keeps its correlation reference',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:false,error:'BUILD_SERVICE_UNAVAILABLE',request_id:'qa-reference'},{status:502}));
  await assert.rejects(requestBuildRecommendations({auth:{getSession:async()=>({data:{session:{access_token:'caller'}}})}},company,run),/could not be reached.*qa-reference/);
});

test('redirected upstream is rejected without forwarding caller credentials to another destination',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async(url,options)=>{count++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://untrusted.test'}})});
  const response=await onRequest({request:request()});assert.equal(response.status,502);assert.equal((await response.json()).error,'BUILD_SERVICE_INVALID_RESPONSE');assert.equal(count,1);
});

test('browser traverses the complete catalog across batches and rejects a repeated cursor',async t=>{
 let count=0;const sb={auth:{getSession:async()=>({data:{session:{access_token:'caller'}}})}};
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.catalog_after,count?'build_z':'');count++;return Response.json({ok:true,build_ids:['build-'+count],next_cursor:count===1?'build_z':null})});
 const result=await requestBuildRecommendations(sb,company,run);assert.equal(count,2);assert.deepEqual(result.build_ids,['build-1','build-2']);
 t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,build_ids:[],next_cursor:'build_same'}));
 await assert.rejects(requestBuildRecommendations(sb,company,run),/cursor did not advance/);
});
