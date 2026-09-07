import test from 'node:test';
import assert from 'node:assert/strict';
import {database,asUser} from './fixture.mjs';
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';

test('only an approved paid brief creates internal Build Tasks and client progress excludes internal work',async()=>{
  const db=await database(['20260907000300_relystra_build_planning.sql','20260907000400_relystra_paid_activation.sql','20260907000500_relystra_build_recommendations.sql','20260907000600_relystra_paid_build_work.sql']);
  try{
    await db.exec(`insert into auth.users values ('${admin}'),('${client}');
      insert into nexus_platform_admins(user_id) values ('${admin}');
      insert into nexus_companies(id,name,created_by) values ('${company}','Paid build fixture','${admin}');
      insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','owner',true);`);
    const run=(await db.query("insert into nexus_diagnosis_runs(company_id,status,analysis_result,created_by) values ($1,'approved',$2,$3) returning id",[company,{opportunity_backlog:[{title:'Bid intake',problem:'Lost bids'}]},admin])).rows[0].id;
    let planId;
    await asUser(db,admin,async()=>{
      const spec={name:'Bid intake',outcome:'A bid reaches its owner',diagnosis_run_id:run,template_code:'build_bid_intake',source_path:'opportunity_backlog/0',completed_action_ids:[],
        complexity_scores:[1,1,1,1,1],complexity:'simple',price_cents:175000,currency:'usd',duration_min:2,duration_max:3,
        scope_in:['One intake source'],scope_out:['No auto-submission'],acceptance_criteria:['Sample bid arrives'],dependencies:[]};
      const build=(await db.query("select relystra_save_build($1,null,$2,'approve') id",[company,spec])).rows[0].id;
      planId=(await db.query('select relystra_create_build_plan($1,$2) id',[company,[build]])).rows[0].id;
    });
    assert.equal((await db.query('select count(*)::int n from nexus_tasks')).rows[0].n,0);
    await db.exec("update nexus_delivery_settings set checkout_enabled=true,stripe_account_id='acct_fixture'");
    await db.exec('set role service_role');
    const plan=(await db.query('select relystra_claim_checkout($1,$2) plan',[planId,client])).rows[0].plan;
    await db.query('select relystra_bind_checkout($1,$2,$3,$4,$5,$6)',[planId,'cs_fixture','https://checkout.stripe.com/c/pay/fixture','acct_fixture',false,plan.checkout_expires_at]);
    const project=(await db.query('select relystra_record_verified_payment($1,$2,$3,$4,$5,$6,$7,$8,$9) id',[planId,'evt_fixture','cs_fixture','pi_fixture',175000,'usd',false,plan.snapshot_digest,'acct_fixture'])).rows[0].id;
    await db.exec('reset role');
    let build=(await db.query('select * from nexus_system_cards where project_id=$1',[project])).rows[0];
    assert.equal((await db.query('select count(*)::int n from nexus_tasks')).rows[0].n,0,'payment creates briefs, not unreviewed execution tasks');
    await asUser(db,client,async()=>{
      assert.equal((await db.query('select * from nexus_system_cards')).rows.length,0,'internal briefs are not readable by client');
      await assert.rejects(db.query('select relystra_save_brief($1,$2,true)',[build.id,{}]),/administrator/);
      const progress=(await db.query('select relystra_package_progress($1) progress',[project])).rows[0].progress;
      assert.equal(progress.percent,0);assert.equal(progress.builds.length,1);
      assert.equal(progress.builds[0].build_brief,undefined);
    });
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query('select relystra_save_brief($1,$2,true)',[build.id,{}]),/Confirm tools platforms/);
      await db.query('select relystra_save_brief($1,$2,true)',[build.id,{tools_platforms:['Approved CRM'],users_roles:['Estimator'],automation_requirements:['Route approved input'],integrations:['None'],assumptions:['One channel'],risks:['Incorrect routing'],test_inputs:['Approved sample bid'],approved_scope:['FORGED SCOPE']}]);
      await db.query("select relystra_save_brief($1,'{}',true)",[build.id]);
    });
    const tasks=(await db.query('select * from nexus_tasks order by sort_order')).rows;
    assert.equal(tasks.length,9,'repeated brief approval creates no duplicate checklist');
    assert.ok(tasks.every(t=>t.work_kind==='build_task'&&t.assignee==='nexus'&&!t.notify_client));
    build=(await db.query('select * from nexus_system_cards where id=$1',[build.id])).rows[0];
    assert.deepEqual(build.build_brief.approved_scope,['One intake source']);
    assert.ok(build.delivery_versions.some(v=>v.state==='ready'&&v.actor_id===admin&&v.snapshot.brief_approved_at));
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query('select relystra_set_build_task($1,true)',[tasks[1].id]),/previous workflow step/i);
      await db.query('select relystra_set_build_task($1,true,$2)',[tasks[0].id,'Confirmed against paid scope']);
    });
    await asUser(db,client,async()=>{
      assert.equal((await db.query("select * from nexus_tasks where work_kind='build_task'")).rows.length,0);
      assert.equal((await db.query('select * from nexus_task_events')).rows.length,0,'event snapshots do not expose hidden internal work');
      await assert.rejects(db.query('select relystra_set_build_task($1,true)',[tasks[1].id]),/administrator/);
      const progress=(await db.query('select relystra_package_progress($1) progress',[project])).rows[0].progress;
      assert.equal(progress.percent,10);assert.equal(progress.stage,'building');
    });
    await asUser(db,admin,async()=>{
      for(const task of tasks.slice(1))await db.query('select relystra_set_build_task($1,true)',[task.id]);
      const progress=(await db.query('select relystra_package_progress($1) progress',[project])).rows[0].progress;
      assert.equal(progress.percent,90,'technical checklist completion is not final delivery');
      await assert.rejects(db.query('select relystra_set_build_task($1,false)',[tasks[0].id]),/dependent task/);
    });
    const events=(await db.query("select * from nexus_task_events where event_type='completed'")).rows;
    assert.equal(events.length,9);
    assert.ok(events.every(e=>e.actor_id===admin&&e.detail.object_version&&e.detail.snapshot.work_kind==='build_task'));
  }finally{await db.close()}
});
