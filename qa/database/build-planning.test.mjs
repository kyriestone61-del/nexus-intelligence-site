import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {database,asUser} from './fixture.mjs';
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003',foreign='00000000-0000-4000-8000-000000000004';

test('only approved client-scoped builds become immutable-priced plans with dependency-aware duration',async()=>{
  const migrations=(await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(n=>n.startsWith('20260907')&&!n.includes('000100_')&&!n.includes('000200_')&&!n.includes('diagnosis_purchase_gate')).sort();
  const db=await database(migrations);
  try{
    await db.exec(`insert into auth.users values ('${admin}'),('${client}');
      insert into nexus_platform_admins(user_id) values ('${admin}');
      insert into nexus_companies(id,name,created_by) values ('${company}','Build fixture','${admin}'),('${foreign}','Other company','${admin}');
      insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','owner',true);
      update nexus_delivery_settings set parallel_capacity=2;`);
    const analysis={opportunity_backlog:[{title:'Bid intake',problem:'Scattered bids'},{title:'Follow up',problem:'Missed follow-ups'}]};
    const run=(await db.query("insert into nexus_diagnosis_runs(company_id,status,analysis_result,created_by) values ($1,'approved',$2,$3) returning id",[company,analysis,admin])).rows[0].id;
    const spec={name:'Bid intake',outcome:'Bids reach the assigned estimator',diagnosis_run_id:run,template_code:'build_bid_intake',source_path:'opportunity_backlog/0',completed_action_ids:[],
      complexity_scores:[1,1,1,1,1],complexity:'simple',price_cents:175000,currency:'usd',duration_min:2,duration_max:3,
      scope_in:['Intake and routing for one approved channel'],scope_out:['No automatic bid submission'],acceptance_criteria:['A sample bid reaches its assigned owner'],dependencies:[]};
    await asUser(db,client,()=>assert.rejects(db.query('select relystra_save_build($1,null,$2)',[company,spec]),/administrator/));
    await asUser(db,client,()=>assert.rejects(db.query("insert into nexus_opportunities(company_id,title,created_by,build_spec,build_review_state) values ($1,'Forged approved build',$2,$3,'approved')",[company,client,spec]),/row-level security/));
    await asUser(db,admin,()=>assert.rejects(db.query('select relystra_save_build($1,null,$2)',[foreign,spec]),/approved diagnosis/));
    const first=await asUser(db,admin,()=>db.query('select relystra_save_build($1,null,$2) id',[company,spec]).then(r=>r.rows[0].id));
    await asUser(db,client,async()=>{
      assert.deepEqual((await db.query('select relystra_build_menu($1) menu',[company])).rows[0].menu,[]);
      await assert.rejects(db.query('select relystra_create_build_plan($1,$2)',[company,[first]]),/approved and available/);
    });
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query("select relystra_save_build($1,$2,$3,'approve')",[company,first,{complexity_scores:[4,1,1,1,1]}]),/1, 2 or 3/);
      await db.query("select relystra_save_build($1,$2,'{}','approve')",[company,first]);
      assert.equal((await db.query("update nexus_opportunities set build_spec=$1 where id=$2 returning id",[{...spec,price_cents:1},first])).rows.length,0,'approved terms cannot bypass their review RPC');
    });
    const second=await asUser(db,admin,()=>db.query("select relystra_save_build($1,null,$2,'approve') id",[company,{...spec,name:'Follow up',source_path:'opportunity_backlog/1',template_code:'build_lead_follow_up',duration_min:3,duration_max:5,price_cents:250000,dependencies:[first]}]).then(r=>r.rows[0].id));
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query("select relystra_save_build($1,$2,$3,'approve')",[company,first,{dependencies:[second]}]),/cannot form a cycle/);
      await assert.rejects(db.query("select relystra_save_build($1,$2,'{}','postpone')",[company,first]),/dependent Builds/);
      await assert.rejects(db.query("select relystra_save_build($1,$2,$3,'approve')",[company,first,{dependencies:[foreign]}]),/other approved Builds/);
    });
    await asUser(db,client,async()=>{
      const menu=(await db.query('select relystra_build_menu($1) menu',[company])).rows[0].menu;
      assert.equal(menu.length,2);
      assert.ok(menu.every(item=>!('complexity_scores' in item)&&!('suggested_complexity' in item)));
      assert.equal((await db.query('select * from nexus_opportunities')).rows.length,0,'raw internal build evaluation is not client-visible');
      await assert.rejects(db.query('select relystra_create_build_plan($1,$2)',[company,[second]]),/required dependency/);
      await assert.rejects(db.query('select relystra_create_build_plan($1,$2)',[company,[first,first]]),/distinct Builds/);
      const planId=(await db.query('select relystra_create_build_plan($1,$2) id',[company,[first,second]])).rows[0].id;
      const plan=(await db.query('select * from nexus_build_plans where id=$1',[planId])).rows[0];
      assert.equal(plan.total_cents,425000);
      assert.equal(plan.duration_min,8,'dependent 2+3 days plus one QA day and two client review days');
      assert.equal(plan.duration_max,11);
      assert.equal(plan.status,'awaiting_payment');
      assert.ok(plan.snapshot_digest);
      await assert.rejects(db.query("update nexus_build_plans set status='paid' where id=$1",[planId]),/permission denied/);
      await assert.rejects(db.query('select relystra_create_build_plan($1,$2)',[company,[first]]),/already in an unpaid plan/);
      assert.equal((await db.query('select * from nexus_projects')).rows.length,0,'selecting a Build Plan does not activate a project');
    });
    const plan=(await db.query('select * from nexus_build_plans')).rows[0];
    await assert.rejects(db.query("insert into nexus_projects(company_id,name,created_by) values ($1,'Unpaid legacy bypass',$2)",[company,admin]),/verified Build Package payment/);
    await assert.rejects(db.query("update nexus_delivery_settings set price_guidance='{}'"),/minimum and maximum guidance/);
    await assert.rejects(db.query("update nexus_delivery_settings set duration_guidance=jsonb_set(duration_guidance,'{simple}','[4,1]')"),/maximum must be at least/);
    await assert.rejects(db.query("insert into nexus_projects(company_id,name,project_type,build_plan_id,paid_at,activated_at,scope_snapshot,package_stage,created_by) values ($1,'Forged paid package','build_package',$2,now(),now(),'{}','briefs',$3)",[company,plan.id,admin]),/matching verified payment/);
    await asUser(db,admin,()=>assert.rejects(db.query('select relystra_manual_payment($1,$2,$3)',[plan.id,'invoice-123','A sufficiently detailed manual payment explanation']),/fallback is disabled/));
    await db.exec("update nexus_delivery_settings set checkout_enabled=true,stripe_account_id='acct_relystra_fixture'");
    const args=[plan.id,'evt_test_fixture','cs_test_fixture','pi_test_fixture',plan.total_cents,'usd',false,plan.snapshot_digest,'acct_relystra_fixture'];
    const sql='select relystra_record_verified_payment($1,$2,$3,$4,$5,$6,$7,$8,$9) id';
    await asUser(db,client,()=>assert.rejects(db.query(sql,args),/permission denied/));
    await db.exec('set role service_role');
    let paidProject;
    try{
      await assert.rejects(db.query('select relystra_claim_checkout($1,$2)',[plan.id,foreign]),/Company access/);
      const claim=(await db.query('select relystra_claim_checkout($1,$2) plan',[plan.id,client])).rows[0].plan;
      const replay=(await db.query('select relystra_claim_checkout($1,$2) plan',[plan.id,client])).rows[0].plan;
      assert.equal(claim.checkout_integration_id,replay.checkout_integration_id,'idempotent retries retain their identifier');
      await db.query('select relystra_bind_checkout($1,$2,$3,$4,$5,$6)',[plan.id,'cs_test_fixture','https://checkout.stripe.com/c/pay/test_fixture','acct_relystra_fixture',false,claim.checkout_expires_at]);
      await assert.rejects(db.query('select relystra_cancel_verified_plan($1,$2)',[plan.id,client]),/Expire the issued checkout/);
      await assert.rejects(db.query(sql,args.map((v,i)=>i===4?1:v)),/amount, currency or environment mismatch/);
      await assert.rejects(db.query(sql,args.map((v,i)=>i===6?true:v)),/amount, currency or environment mismatch/);
      await assert.rejects(db.query(sql,args.map((v,i)=>i===8?'acct_other':v)),/amount, currency or environment mismatch/);
      await assert.rejects(db.query(sql,args.map((v,i)=>i===2?'cs_wrong':v)),/issued checkout session/);
      paidProject=(await db.query(sql,args)).rows[0].id;
      assert.equal((await db.query(sql,args)).rows[0].id,paidProject,'replayed payment activates the same package');
    }finally{await db.exec('reset role')}
    assert.equal((await db.query('select count(*)::int n from nexus_projects')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from nexus_system_cards where project_id=$1',[paidProject])).rows[0].n,2);
    const project=(await db.query('select * from nexus_projects where id=$1',[paidProject])).rows[0];
    assert.equal(project.project_type,'build_package');
    assert.equal(project.package_stage,'briefs');
    assert.equal(project.payment_livemode,false);
    assert.equal(project.scope_snapshot.total_cents,425000);
    await assert.rejects(db.query("update nexus_projects set scope_snapshot='{}' where id=$1",[paidProject]),/immutable/);
    await assert.rejects(db.query('update nexus_build_plans set total_cents=1 where id=$1',[plan.id]),/immutable/);
    await asUser(db,admin,()=>assert.rejects(db.query("select relystra_save_build($1,$2,$3,'approve')",[company,first,{price_cents:1}]),/Purchased scope is immutable/));
    await asUser(db,client,()=>db.query('select relystra_build_menu($1) menu',[company]).then(r=>assert.deepEqual(r.rows[0].menu,[])));
  }finally{await db.close()}
});
