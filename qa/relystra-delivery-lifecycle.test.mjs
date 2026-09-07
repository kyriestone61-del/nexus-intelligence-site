import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycle,visibleDeliverySections,createLifecycleStore} from '../portal-delivery-lifecycle.js';

test('Moon Wax without a Project goes to diagnosis and never loops back to company setup',()=>{
  const next=lifecycle({company_id:'moon',diagnosis:{access:false},projects:[]});
  assert.equal(next.section,'diagnosis');assert.equal(next.actor,'CLIENT');
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
