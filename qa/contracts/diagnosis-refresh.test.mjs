import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosisRefreshController} from './diagnosis-refresh.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('duplicate refresh requests for the same company/run coalesce',async()=>{
  let fetches=0;
  const applied=[];
  const controller=createDiagnosisRefreshController({
    fetchLatest:async()=>{fetches++;await wait(20);return {id:'r1',status:'ready_for_review'}},
    applyLatest:async row=>applied.push(row)
  });
  controller.setCompany('c1');
  const [a,b]=await Promise.all([controller.refresh({runId:'r1'}),controller.refresh({runId:'r1'})]);
  assert.equal(fetches,1);
  assert.equal(a.applied,true);
  assert.equal(b.applied,true);
  assert.equal(applied.length,1);
});

test('late diagnosis result from prior company is discarded',async()=>{
  const applied=[];
  const controller=createDiagnosisRefreshController({
    fetchLatest:async({companyId})=>{if(companyId==='c1')await wait(35);return {companyId}},
    applyLatest:async row=>applied.push(row)
  });
  controller.setCompany('c1');
  const old=controller.refresh();
  await wait(5);
  controller.setCompany('c2');
  const current=await controller.refresh();
  const stale=await old;
  assert.equal(current.applied,true);
  assert.equal(stale.stale,true);
  assert.deepEqual(applied,[{companyId:'c2'}]);
});

test('refresh failure preserves last successfully applied diagnosis',async()=>{
  let fail=false;
  const errors=[];
  const applied=[];
  const controller=createDiagnosisRefreshController({
    fetchLatest:async()=>{if(fail)throw new Error('provider read failed');return {id:'r1',status:'ready_for_review'}},
    applyLatest:async row=>applied.push(row),
    onError:error=>errors.push(error.message)
  });
  controller.setCompany('c1');
  await controller.refresh();
  fail=true;
  const result=await controller.refresh({reason:'retry'});
  assert.equal(result.applied,false);
  assert.equal(result.row.id,'r1');
  assert.deepEqual(errors,['provider read failed']);
  assert.equal(applied.length,1);
});

test('event for another company does not mutate active diagnosis state',async()=>{
  let fetches=0;
  const controller=createDiagnosisRefreshController({fetchLatest:async()=>{fetches++;return {}},applyLatest:async()=>{}});
  controller.setCompany('c1');
  const result=await controller.handleEvent({detail:{companyId:'c2',runId:'r2'}});
  assert.equal(result.applied,false);
  assert.equal(result.reason,'other_company');
  assert.equal(fetches,0);
});
