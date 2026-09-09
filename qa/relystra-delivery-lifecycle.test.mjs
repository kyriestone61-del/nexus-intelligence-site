import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycle,clientLifecycle,visibleDeliverySections,createLifecycleStore} from '../portal-delivery-lifecycle.js';

test('client waiting states do not instruct the client to approve internal briefs or QA',()=>{
  for(const stage of ['briefs','internal_qa','final_qa']){
    const next=clientLifecycle({company_id:'blue',package:{stage,percent:0}});
    assert.equal(next.actor,'ADMIN');assert.equal(next.label,'View progress');
    assert.doesNotMatch(next.detail,/^Approve|^Confirm|^Verify/);
  }
  assert.equal(clientLifecycle({company_id:'blue',package:{stage:'client_review'}}).label,'Review Draft Package');
});

test('An unpaid workspace starts with Discovery without inventing a purchase or diagnosis',()=>{
  const next=lifecycle({company_id:'moon',diagnosis:{access:false},projects:[]});
  assert.equal(next.section,'discovery');assert.equal(next.actor,'ADMIN');assert.equal(clientLifecycle({company_id:'moon',diagnosis:{access:false}}).section,'diagnosis');
  assert.deepEqual(visibleDeliverySections({company_id:'moon'}).map(([key])=>key),['overview','diagnosis']);
});
test('review and payment prerequisites precede internal delivery, and completion retains final access',()=>{
  const s={company_id:'moon',diagnosis:{status:'approved'},actions:{suggested:1},builds:{approved:1},payment_pending:true};
  assert.equal(lifecycle(s).stage,'action_curation');
  s.actions={review:1};assert.equal(lifecycle(s).actor,'ADMIN');
  s.actions={client:1};assert.equal(lifecycle(s).section,'actions');
  s.actions={};assert.equal(lifecycle(s).stage,'payment');
  s.package={stage:'client_review',percent:90};s.project_id='paid';
  assert.equal(lifecycle(s).actor,'CLIENT');assert.equal(lifecycle(s).section,'progress');
  s.package={stage:'completed',percent:100};
  assert.equal(lifecycle(s).actor,'NO_ACTION_COMPLETE');
  assert.ok(visibleDeliverySections(s).some(([key])=>key==='final-package'));
  assert.ok(visibleDeliverySections(s).some(([key])=>key==='builds'));
});
test('out-of-order lifecycle responses cannot overwrite another client workspace',async()=>{
  const pending=[],portal={state:{companyId:'moon'},sb:{rpc:(_name,args)=>new Promise(resolve=>pending.push({args,resolve}))}},store=createLifecycleStore(portal);
  const first=store.refresh();portal.state.companyId='blue';const second=store.refresh();
  pending[1].resolve({data:{company_id:'blue'}});await second;
  pending[0].resolve({data:{company_id:'moon'}});assert.equal(await first,null);
  assert.equal(store.value.company_id,'blue');
});

import {mountDiagnosisOffer} from '../portal-diagnosis-offer.js';
test('new clients see the included Full Diagnosis offer without a separate diagnosis purchase or mutation',async()=>{
 const root={innerHTML:'',replaceChildren(){this.innerHTML=''}};
 const portal={state:{companyId:'moon'},sb:{from(){throw Error('No legacy commercial writes or reads required')}}};
 const offer=mountDiagnosisOffer(root,portal);
 await offer.refresh({company_id:'moon',diagnosis:{access:false}});
 assert.match(root.innerHTML,/Basic Report/);assert.match(root.innerHTML,/Full Diagnosis/);assert.doesNotMatch(root.innerHTML,/data-diagnosis-purchase|data-diagnosis-cancel|\$350/);
 await offer.refresh({company_id:'moon',diagnosis:{access:true}});assert.match(root.innerHTML,/included in your engagement/);
 offer.destroy();assert.equal(root.innerHTML,'');
});
test('first paid engagement starts its included Full Diagnosis before optional expansion',()=>{
 const result=lifecycle({company_id:'first',initial_engagement:true,package:{stage:'briefs'},diagnosis:{access:true}});
 assert.equal(result.stage,'diagnosis');assert.equal(result.actor,'ADMIN');assert.match(result.detail,/optional/);
});

test('clients are not instructed to execute administrator or AI preparation',()=>{
  for(const actions of [{admin:1},{ai:1}]){
    const snapshot={company_id:'company',diagnosis:{status:'approved'},actions};
    assert.equal(clientLifecycle(snapshot).title,'Relystra is preparing the Build inputs');
    assert.equal(clientLifecycle(snapshot).label,'View Actions');
    assert.equal(clientLifecycle(snapshot).actor,'ADMIN');
    assert.notEqual(clientLifecycle(snapshot).detail,lifecycle(snapshot).detail);
  }
});
