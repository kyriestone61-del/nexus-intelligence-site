import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {database,asUser} from './fixture.mjs';
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';

test('only an approved paid brief creates internal Build Tasks and client progress excludes internal work',async()=>{
  const db=await database(['20260907000300_relystra_build_planning.sql','20260907000400_relystra_paid_activation.sql','20260907000500_relystra_build_recommendations.sql','20260907000600_relystra_paid_build_work.sql','20260907000700_relystra_review_delivery.sql','20260907000800_relystra_grounded_support.sql','20260907045453_relystra_delivery_notifications.sql','20260907045552_relystra_workspace_lifecycle.sql','20260907145329_relystra_support_published_limits.sql']);
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
    for(const migration of ['20260907051007_relystra_diagnosis_purchase_gate.sql','20260907115814_relystra_paid_diagnosis_context.sql','20260908013000_relystra_canonical_diagnosis_lineage.sql'])
      await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
    assert.equal((await db.query('select count(*)::int n from nexus_tasks')).rows[0].n,0);
    await db.exec("update nexus_delivery_settings set checkout_enabled=true,stripe_account_id='acct_fixture'");
    await db.exec('set role service_role');
    const plan=(await db.query('select relystra_claim_checkout($1,$2) plan',[planId,client])).rows[0].plan;
    await db.query('select relystra_bind_checkout($1,$2,$3,$4,$5,$6)',[planId,'cs_fixture','https://checkout.stripe.com/c/pay/fixture','acct_fixture',false,plan.checkout_expires_at]);
    const project=(await db.query('select relystra_record_verified_payment($1,$2,$3,$4,$5,$6,$7,$8,$9) id',[planId,'evt_fixture','cs_fixture','pi_fixture',175000,'usd',false,plan.snapshot_digest,'acct_fixture'])).rows[0].id;
    await db.exec('reset role');
    const historical=(await db.query("insert into nexus_projects(company_id,name,created_by,project_type) values ($1,'Retained historical diagnosis',$2,'historical') returning id",[company,admin])).rows[0].id;
    await db.query('update nexus_diagnosis_runs set project_id=$1 where id=$2',[historical,run]);
    for(const name of ['20260909082311_relystra_master_build_library.sql','20260909082312_relystra_commercial_roadmap.sql','20260909082313_relystra_discovery_commerce.sql','20260909084306_relystra_roadmap_operations.sql'])await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
    const initialNotifications=(await db.query('select count(*)::int n from nexus_notifications')).rows[0].n;
    let build=(await db.query('select * from nexus_system_cards where project_id=$1',[project])).rows[0];
    assert.equal((await db.query('select count(*)::int n from nexus_tasks')).rows[0].n,0,'payment creates briefs, not unreviewed execution tasks');
    await asUser(db,client,async()=>{
      assert.equal((await db.query('select * from nexus_system_cards')).rows.length,0,'internal briefs are not readable by client');
      await assert.rejects(db.query('select relystra_save_brief($1,$2,true)',[build.id,{}]),/administrator/);
      const progress=(await db.query('select relystra_package_progress($1) progress',[project])).rows[0].progress;
      assert.equal(progress.percent,0);assert.equal(progress.builds.length,1);
      const snapshot=(await db.query('select relystra_workspace_snapshot($1) snapshot',[company])).rows[0].snapshot;
      assert.equal(snapshot.project_id,project);assert.equal(snapshot.package.stage,'briefs');
      assert.equal(snapshot.diagnosis.id,run,'paid package retains its purchased historical diagnosis');
      assert.equal(snapshot.diagnosis.project_id,historical,'diagnosis history remains addressable after the package handoff');
      assert.equal(snapshot.diagnosis.access,true,'grandfathered diagnosis access survives paid activation');
      assert.equal(JSON.stringify(snapshot).includes('FORGED SCOPE'),false);
      await assert.rejects(db.query('select relystra_workspace_snapshot($1,$2)',[company,company]),/does not belong/);
      await assert.rejects(db.query('select relystra_workspace_snapshot($1)',[admin]),/access required/);
      assert.equal(progress.builds[0].build_brief,undefined);
    });
    assert.equal((await db.query('select context_diagnosis_run_id from nexus_projects where id=$1',[project])).rows[0].context_diagnosis_run_id,run,'paid package stores canonical diagnosis lineage');
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query('select relystra_save_brief($1,$2,true)',[build.id,{}]),/Confirm tools platforms/);
      await db.query('select relystra_save_brief($1,$2,true)',[build.id,{tools_platforms:['Approved CRM'],users_roles:['Estimator'],automation_requirements:['Route approved input'],integrations:['None'],assumptions:['One channel'],risks:['Incorrect routing'],test_inputs:['Approved sample bid'],approved_scope:['FORGED SCOPE']}]);
      await db.query("select relystra_save_brief($1,'{}',true)",[build.id]);
    });
    const tasks=(await db.query('select * from nexus_tasks order by sort_order')).rows;
    assert.equal(tasks.length,13,'repeated brief approval creates no duplicate checklist');
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
      assert.equal(progress.percent,6);assert.equal(progress.stage,'building');
    });
    await asUser(db,admin,async()=>{
      for(const task of tasks.slice(1))await db.query('select relystra_set_build_task($1,true)',[task.id]);
      const progress=(await db.query('select relystra_package_progress($1) progress',[project])).rows[0].progress;
      assert.equal(progress.percent,90,'technical checklist completion is not final delivery');
      await assert.rejects(db.query('select relystra_set_build_task($1,false)',[tasks[0].id]),/dependent task/);
    });
    const events=(await db.query("select * from nexus_task_events where event_type='completed'")).rows;
    assert.equal(events.length,tasks.length);
    assert.equal((await db.query('select count(*)::int n from nexus_notifications')).rows[0].n,initialNotifications,'internal task updates do not add notifications after payment and historical setup');
    assert.ok(events.every(e=>e.actor_id===admin&&e.detail.object_version&&e.detail.snapshot.work_kind==='build_task'));
    const checks=Object.fromEntries(['functionality','outputs','permissions','integrations','links','error_states','input_validation','data_behavior','mobile_usability','client_usability','documentation','faq','support_grounding']
      .map(key=>[key,{status:'pass',evidence:'Fixture evidence for '+key}]));
    const content={known_limitations:['One browser only; maximum 1,000 requests.'],description:'Bid intake and routing',preview_url:'https://example.test/bid-intake',what_to_test:['Submit the approved sample bid'],
      tutorial:{what:'Routes an incoming bid',steps:['Open the intake form','Enter the sample bid','Confirm the assigned estimator'],when:'When a bid arrives',troubleshooting:'Check the required fields, then contact Relystra'},
      faq:[{question:'Does it submit bids automatically?',answer:'No. Bid submission remains outside this Build.'}]};
    let draft;
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query('select relystra_publish_draft($1)',[project]),/internal QA/);
      await db.query('select relystra_save_delivery($1,$2)',[build.id,content]);
      await assert.rejects(db.query("select relystra_record_qa($1,'internal',$2)",[build.id,{}]),/QA needs/);
      await db.query("select relystra_record_qa($1,'internal',$2)",[build.id,checks]);
      draft=(await db.query('select relystra_publish_draft($1) id',[project])).rows[0].id;
      await assert.rejects(db.query('select relystra_publish_final($1)',[project]),/Client review/);
    });
    await asUser(db,client,async()=>{
      await assert.rejects(db.query("select relystra_review_build($1,$2,'approve')",[build.id,company]),/Refresh the current Draft/);
      await db.query("select relystra_review_build($1,$2,'minor_revision',$3)",[build.id,draft,'Clarify the routing confirmation']);
      await assert.rejects(db.query("select relystra_resolve_revision($1,'approved_exception',$2)",[build.id,'Client must not approve scope exceptions']),/administrator/);
    });
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query('select relystra_save_delivery($1,$2)',[build.id,{description:'Changed before triage'}]),/scope before editing/);
      await db.query("select relystra_resolve_revision($1,'in_scope',$2)",[build.id,'Clarification within the approved routing workflow.']);
      const revision=(await db.query("select id from nexus_tasks where task_type='internal_build_revision'")).rows[0].id;
      await db.query('select relystra_save_delivery($1,$2)',[build.id,{...content,description:'Bid intake with clear routing confirmation'}]);
      await assert.rejects(db.query("select relystra_record_qa($1,'internal',$2)",[build.id,checks]),/Complete the approved Build checklist/);
      await db.query('select relystra_set_build_task($1,true)',[revision]);
      await db.query("select relystra_record_qa($1,'internal',$2)",[build.id,checks]);
      draft=(await db.query('select relystra_publish_draft($1) id',[project])).rows[0].id;
    });
    await asUser(db,client,()=>db.query("select relystra_review_build($1,$2,'approve')",[build.id,draft]));
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query('select relystra_publish_final($1)',[project]),/current final QA/);
      await assert.rejects(db.query("select relystra_record_qa($1,'final',$2)",[build.id,{...checks,support_grounding:{status:'not_applicable',evidence:'An unsupported exemption must not pass'}}]),/support grounding must pass/);
      await db.query("select relystra_record_qa($1,'final',$2)",[build.id,checks]);
      const final=(await db.query('select relystra_publish_final($1) id',[project])).rows[0].id;
      assert.equal((await db.query('select relystra_publish_final($1) id',[project])).rows[0].id,final);
    });
    await asUser(db,client,async()=>{
      const progress=(await db.query('select relystra_package_progress($1) progress',[project])).rows[0].progress;
      assert.equal(progress.percent,100);assert.equal(progress.stage,'support');
      assert.equal(Date.parse(progress.support_ends_at)-Date.parse(progress.support_starts_at),7*86400000);
      const delivered=(await db.query('select final_package,package_versions from nexus_projects where id=$1',[project])).rows[0];
      assert.equal(delivered.final_package.items.length,1);
      assert.equal(delivered.final_package.items[0].content.tutorial.steps.length,3);
      assert.equal(delivered.final_package.items[0].build_brief,undefined);
      assert.equal(delivered.package_versions.length,3,'two draft versions and one final version remain available');
    });
    await assert.rejects(db.query("update nexus_projects set status='complete',package_stage='completed' where id=$1",[project]),/support period is still active/);
    await assert.rejects(db.query("update nexus_projects set final_package='{}' where id=$1",[project]),/final QA|immutable/);
    const sources=await asUser(db,client,()=>db.query('select relystra_support_sources($1) sources',[project]).then(r=>r.rows[0].sources));
    assert.ok(sources.some(s=>s.title.includes('Usage guide')));
    const limitsSource=sources.find(s=>s.id.endsWith(':limitations'));
    assert.equal(limitsSource.body,'One browser only; maximum 1,000 requests.');
    assert.ok(limitsSource.title.includes('Known limitations'));
    assert.equal(sources.filter(s=>s.id===limitsSource.id).length,1);
    assert.ok(sources.every(s=>!s.body.includes('Fixture evidence for')),'internal QA notes are not support material');
    await asUser(db,client,async()=>{
      await assert.rejects(db.query('select relystra_support_sources($1)',[company]),/Delivered package access/);
      await assert.rejects(db.query('select private.relystra_support_sources_unchecked($1)',[project]),/permission denied/);
      await assert.rejects(db.query('select relystra_close_expired_support()'),/permission denied/);
    });
    const faqSource=sources.find(s=>s.id.includes(':faq:'));
    const turnId='00000000-0000-4000-8000-000000000009',escalationId='00000000-0000-4000-8000-000000000010';
    const supportSql='select relystra_record_support_turn($1,$2,$3,$4,$5,$6) id';
    await db.exec('set role service_role');
    const supportArgs=[turnId,project,client,'Will this submit bids for me?',[{source_id:faqSource.id,quote:'No. Bid submission remains outside this Build.'}],false];
    await assert.rejects(db.query(supportSql,supportArgs.map((v,i)=>i===4?[{source_id:faqSource.id,quote:'Yes, it submits every bid automatically.'}]:v)),/cited passage/);
    await assert.rejects(db.query(supportSql,supportArgs.map((v,i)=>i===2?company:v)),/Delivered package access/);
    assert.equal((await db.query(supportSql,supportArgs)).rows[0].id,turnId);
    assert.equal((await db.query(supportSql,supportArgs)).rows[0].id,turnId);
    await db.query(supportSql,[escalationId,project,client,'Can this support a completely new workflow?',[],true]);
    assert.equal((await db.query('select relystra_close_expired_support() n')).rows[0].n,0);
    await db.exec('reset role');
    await asUser(db,client,async()=>{
      const request=(await db.query('select * from nexus_client_requests where id=$1',[escalationId])).rows[0];
      assert.equal(request.status,'submitted');assert.equal(request.support_context.escalated,true);
      await assert.rejects(db.query('select relystra_answer_support($1,$2)',[escalationId,'A client cannot impersonate the support team.']),/administrator/);
    });
    await asUser(db,admin,()=>db.query('select relystra_answer_support($1,$2)',[escalationId,'A new workflow requires a separately reviewed Build. Your current package stays available.']));
    const answered=(await db.query('select * from nexus_client_requests where id=$1',[escalationId])).rows[0];
    assert.equal(answered.support_answered_by,admin);assert.equal(answered.support_history.length,2);
    // Simulate elapsed wall-clock time only inside the disposable in-memory fixture; production never changes handoff timestamps.
    await db.exec('set session_replication_role=replica');
    await db.query("update nexus_projects set support_starts_at=now()-interval '8 days',support_ends_at=now()-interval '1 day' where id=$1",[project]);
    await db.exec('set session_replication_role=origin');
    await db.exec('set role service_role');
    assert.equal((await db.query('select relystra_close_expired_support() n')).rows[0].n,1);
    assert.equal((await db.query('select relystra_close_expired_support() n')).rows[0].n,0);
    await db.exec('reset role');
    await asUser(db,client,async()=>{
      assert.equal((await db.query('select status from nexus_projects where id=$1',[project])).rows[0].status,'complete');
      assert.equal((await db.query('select relystra_support_sources($1) sources',[project])).rows[0].sources.length,sources.length);
      const current=(await db.query('select relystra_workspace_snapshot($1) snapshot',[company])).rows[0].snapshot;
      assert.equal(current.project_id,null);
      assert.equal(current.diagnosis.id,run,'retained diagnosis remains available without an active paid package');
    });
    const notices=(await db.query('select * from nexus_notifications')).rows;
    assert.equal(notices.filter(n=>n.title==='Test payment confirmed'&&n.related_id===project).length,2);
    assert.equal(notices.filter(n=>n.title==='Your draft is ready for review').length,2);
    assert.equal(notices.filter(n=>n.title==='Your Final Package is ready').length,1);
    assert.equal(notices.filter(n=>n.title==='Support question needs review').length,1);
    assert.equal(notices.filter(n=>n.title==='Relystra answered your support question').length,1);
    assert.equal(notices.filter(n=>n.title==='Your support period has ended').length,1);
    assert.equal(new Set(notices.map(n=>n.delivery_event_key)).size,notices.length);
    assert.ok(notices.every(n=>n.action_url.includes(company)));
    assert.ok(notices.filter(n=>n.related_type==='project').every(n=>n.action_url.includes('project='+n.related_id)), 'package notifications preserve the exact project context');
  }finally{await db.close()}
});
