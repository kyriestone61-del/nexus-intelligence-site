import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {checkoutParameters,validateSession,verifiedPayment} from '../../supabase/functions/_shared/relystra-payments.ts';
import {database,asUser} from './fixture.mjs';

const plan={id:'00000000-0000-4000-8000-000000000005',company_id:'00000000-0000-4000-8000-000000000003',purchase_kind:'build_package',name:'Build Package',
  items:[{name:'Bid intake',price_cents:175000,currency:'usd'},{name:'Follow-up',price_cents:250000,currency:'usd'}],total_cents:425000,currency:'usd',snapshot_digest:'immutable_scope',
  checkout_session_id:'cs_test_fixture',checkout_account_id:'acct_relystra_fixture',checkout_livemode:false,checkout_integration_id:'relystra_delivery_abcdefgh',checkout_expires_at:'2026-09-08T00:00:00.000Z'};
const params=checkoutParameters(plan,'https://nexusintelligence.live');
const session={id:plan.checkout_session_id,mode:'payment',livemode:false,status:'complete',payment_status:'paid',amount_total:plan.total_cents,currency:'usd',
  client_reference_id:plan.id,payment_intent:'pi_test_fixture',metadata:params.metadata,expires_at:params.expires_at,url:null};
const event={id:'evt_test_fixture',type:'checkout.session.completed',livemode:false,data:{object:session}};

test('hosted checkout uses the saved scope and server-controlled return context',()=>{
  assert.equal(params.ui_mode,'hosted_page','matches the pinned Dahlia API hosted checkout mode');
  assert.equal(params.line_items.reduce((n,i)=>n+i.price_data.unit_amount,0),425000);
  assert.ok(params.success_url.includes(`company=${plan.company_id}&plan=${plan.id}`));
  assert.equal(params.payment_method_types,undefined,'configured dynamic payment methods remain available');
  assert.equal(params.allow_promotion_codes,undefined,'a checkout cannot silently change the approved fixed price');
  assert.throws(()=>checkoutParameters({...plan,total_cents:1},'https://nexusintelligence.live'),/PLAN_TOTAL_INVALID/);
  assert.throws(()=>checkoutParameters(plan,'https://nexusintelligence.live/attacker-return'),/PORTAL_ORIGIN_INVALID/);
});

test('signed events require an exact account, company, session, price and scope match before activation',async()=>{
  const stripe=new Stripe('sk_test_local_signature_only',{apiVersion:'2026-08-26.dahlia'});
  const secret='whsec_local_fixture_only';
  const raw=JSON.stringify(event);
  const header=stripe.webhooks.generateTestHeaderString({payload:raw,secret});
  const signed=await stripe.webhooks.constructEventAsync(raw,header,secret);
  assert.equal(verifiedPayment(signed,session,plan,plan.checkout_account_id).p_payment_reference,'pi_test_fixture');
  await assert.rejects(stripe.webhooks.constructEventAsync(raw.replace('425000','1'),header,secret),/signature/i);
  await assert.rejects(stripe.webhooks.constructEventAsync(raw,header,'whsec_other'),/signature/i);
  const old=stripe.webhooks.generateTestHeaderString({payload:raw,secret,timestamp:1});
  await assert.rejects(stripe.webhooks.constructEventAsync(raw,old,secret),/Timestamp outside/);
  for(const changed of [
    {...session,amount_total:1},{...session,currency:'eur'},{...session,livemode:true},{...session,id:'cs_other'},
    {...session,metadata:{...session.metadata,company_id:'other'}},{...session,metadata:{...session.metadata,scope_digest:'altered'}},
    {...session,metadata:{...session.metadata,application:'statecraft'}},{...session,client_reference_id:'other'},
  ]) assert.throws(()=>verifiedPayment(signed,changed,plan,plan.checkout_account_id),/MISMATCH/);
  assert.throws(()=>verifiedPayment({...signed,account:'acct_other'},session,plan,plan.checkout_account_id),/MISMATCH/);
  assert.throws(()=>verifiedPayment(signed,session,plan,'acct_other'),/MISMATCH/);
  assert.throws(()=>validateSession(session,{...plan,checkout_session_id:'cs_other'},plan.checkout_account_id),/MISMATCH/);
  assert.equal(verifiedPayment(signed,{...session,payment_status:'unpaid'},plan,plan.checkout_account_id),null,'checkout completion does not imply settlement');
  assert.ok(verifiedPayment({...signed,type:'checkout.session.async_payment_succeeded'},session,plan,plan.checkout_account_id));
  assert.equal(verifiedPayment({...signed,type:'payment_intent.succeeded'},session,plan,plan.checkout_account_id),null);
});

test('diagnosis checkout is idempotent, company-scoped, cancellable, and activates access without a Project',async()=>{
  const db=await database(['20260907000300_relystra_build_planning.sql','20260907000400_relystra_paid_activation.sql']);
  const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company=plan.company_id;
  try{
    await db.exec(`insert into auth.users values ('${admin}'),('${client}');
      insert into nexus_platform_admins(user_id) values ('${admin}');
      insert into nexus_companies(id,name,created_by) values ('${company}','Diagnosis fixture','${admin}');
      insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','owner',true);`);
    let first;
    await asUser(db,client,async()=>{
      first=(await db.query('select relystra_create_diagnosis_plan($1) id',[company])).rows[0].id;
      assert.equal((await db.query('select relystra_create_diagnosis_plan($1) id',[company])).rows[0].id,first);
      await assert.rejects(db.query('select relystra_claim_checkout($1,$2)',[first,client]),/permission denied/);
    });
    await db.exec('set role service_role');
    await assert.rejects(db.query('select relystra_claim_checkout($1,$2)',[first,client]),/not configured/);
    await db.query('select relystra_cancel_verified_plan($1,$2)',[first,client]);
    await db.exec('reset role');
    const second=await asUser(db,client,()=>db.query('select relystra_create_diagnosis_plan($1) id',[company]).then(r=>r.rows[0].id));
    assert.notEqual(first,second);
    await db.exec("update nexus_delivery_settings set checkout_enabled=true,stripe_account_id='acct_relystra_fixture'");
    await db.exec('set role service_role');
    const claimed=(await db.query('select relystra_claim_checkout($1,$2) plan',[second,client])).rows[0].plan;
    assert.equal(claimed.total_cents,35000);
    await db.query('select relystra_bind_checkout($1,$2,$3,$4,$5,$6)',[second,'cs_test_diagnosis','https://checkout.stripe.com/c/pay/diagnosis','acct_relystra_fixture',false,claimed.checkout_expires_at]);
    await db.exec('reset role');
    // Issued checkout keeps its mode if an administrator subsequently enables live checkout for new plans.
    await db.exec('update nexus_delivery_settings set payment_livemode=true');
    await db.exec('set role service_role');
    const args=[second,'evt_test_diagnosis','cs_test_diagnosis','pi_test_diagnosis',35000,'usd',false,claimed.snapshot_digest,'acct_relystra_fixture'];
    const sql='select relystra_record_verified_payment($1,$2,$3,$4,$5,$6,$7,$8,$9) id';
    await assert.rejects(db.query(sql,args),/offering_code_fkey/,'an activation failure must roll back payment recording for a safe retry');
    assert.equal((await db.query('select status from nexus_build_plans where id=$1',[second])).rows[0].status,'awaiting_payment');
    assert.equal((await db.query('select count(*)::int n from nexus_delivery_payment_events')).rows[0].n,0);
    await db.exec('reset role');
    await db.exec("insert into nexus_commercial_offerings(code,name,description,client_outcome,pricing_model,sort_order) values ('find','Find My AI Opportunities','Operational diagnosis','Analysis and direction','fixed',1)");
    await db.exec('set role service_role');
    assert.equal((await db.query(sql,args)).rows[0].id,null);
    assert.equal((await db.query(sql,args)).rows[0].id,null);
    await assert.rejects(db.query('select relystra_cancel_verified_plan($1,$2,$3)',[second,client,'cs_test_diagnosis']),/paid plan/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from nexus_projects')).rows[0].n,0);
    const entitlements=(await db.query('select * from nexus_company_entitlements')).rows;
    assert.equal(entitlements.length,1);
    assert.equal(entitlements[0].offering_code,'find');
    assert.equal(entitlements[0].source,'purchase');
    assert.equal(entitlements[0].scope.livemode,false);
    assert.equal(entitlements[0].scope.plan_id,second);
    await asUser(db,client,()=>assert.rejects(db.query('select relystra_create_diagnosis_plan($1)',[company]),/already has diagnosis access/));
  }finally{await db.exec('reset role');await db.close()}
});

test('a partial payment charges only its exact deposit while retaining total scope and private return capability',()=>{
 const deposit={...plan,deposit_cents:100000,source_discovery_id:'report'};
 const p=checkoutParameters(deposit,'https://nexusintelligence.live');
 assert.equal(p.line_items.length,1);assert.equal(p.line_items[0].price_data.unit_amount,100000);
 assert.match(p.success_url,/basic-report\?plan=/);assert.ok(!p.success_url.includes('token'));
 const verified=verifiedPayment(event,{...session,amount_total:100000},deposit,plan.checkout_account_id);
 assert.equal(verified.p_amount_cents,100000);assert.equal(deposit.total_cents,425000);
 assert.throws(()=>verifiedPayment(event,session,deposit,plan.checkout_account_id),/MISMATCH/);
 for(const amount of [0,-1,425001,0.1])assert.throws(()=>checkoutParameters({...deposit,deposit_cents:amount},'https://nexusintelligence.live'),/DEPOSIT/);
 const many={...plan,items:Array.from({length:101},()=>({name:'Approved Build',price_cents:1000,currency:'usd'})),total_cents:101000};
 assert.equal(checkoutParameters(many,'https://nexusintelligence.live').line_items.length,1);
});
