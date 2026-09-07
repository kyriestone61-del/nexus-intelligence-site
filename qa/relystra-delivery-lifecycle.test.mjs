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

import {mountDiagnosisOffer} from '../portal-diagnosis-offer.js';
function diagnosisOfferFixture(){
  const handlers={},calls=[],messages=[];
  const root={innerHTML:'',addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:()=>{},replaceChildren(){this.innerHTML=''}};
  let rows=[{id:'saved-plan',total_cents:17500,currency:'usd'}];
  const query={select(){return this},eq(){return this},then(resolve){resolve({data:rows})}};
  const portal={state:{companyId:'moon'},toast:message=>messages.push(message),sb:{from:()=>query,rpc:async()=>{throw new Error('Must reuse saved plan')},functions:{invoke:async(name,args)=>{calls.push({name,...args.body});rows=[];return {data:{status:'cancelled'}}}}}};
  const offer=mountDiagnosisOffer(root,portal);
  const snapshot={company_id:'moon',diagnosis:{access:false},offer:{price_cents:25000,currency:'usd',checkout_enabled:true}};
  const click=kind=>{const button={disabled:false,isConnected:true};return handlers.click({target:{closest:selector=>selector==='button'||selector===`[data-diagnosis-${kind}]`?button:null}})};
  return {root,portal,offer,snapshot,calls,messages,click};
}
test('saved diagnosis offer retains its quoted price when current pricing changes',async()=>{
  const f=diagnosisOfferFixture();await f.offer.refresh(f.snapshot);
  assert.match(f.root.innerHTML,/175\.00/);assert.doesNotMatch(f.root.innerHTML,/250\.00/);
  assert.match(f.root.innerHTML,/Cancel unpaid diagnosis plan/);
  f.offer.destroy();
});
test('diagnosis cancellation uses the verified checkout boundary and refreshes the offer',async()=>{
  const f=diagnosisOfferFixture(),events=[];
  const previousWindow=globalThis.window,previousEvent=globalThis.CustomEvent;
  globalThis.window={dispatchEvent:event=>events.push(event)};
  globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail}};
  try{
    await f.offer.refresh(f.snapshot);await f.click('cancel');
    assert.deepEqual(f.calls,[{name:'relystra-checkout',plan_id:'saved-plan',operation:'cancel'}]);
    assert.match(f.root.innerHTML,/250\.00/);assert.doesNotMatch(f.root.innerHTML,/data-diagnosis-cancel/);
    assert.equal(events[0].detail.companyId,'moon');
    assert.equal(f.messages[0],'Unpaid diagnosis plan cancelled.');
  }finally{globalThis.window=previousWindow;globalThis.CustomEvent=previousEvent;f.offer.destroy()}
});
test('stale diagnosis actions cannot mutate a different workspace',async()=>{
  const f=diagnosisOfferFixture();await f.offer.refresh(f.snapshot);
  f.portal.state.companyId='blue';await f.click('cancel');assert.equal(f.calls.length,0);f.offer.destroy();
});
