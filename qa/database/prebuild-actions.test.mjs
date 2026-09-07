import test from 'node:test';
import assert from 'node:assert/strict';
import {database,asUser} from './fixture.mjs';

const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003';
const company='00000000-0000-4000-8000-000000000004';

test('pre-purchase action lifecycle enforces real database authorization, approval and review',async()=>{
  const db=await database();
  try{
    await db.exec(`insert into auth.users values ('${admin}'),('${client}'),('${stranger}');
      insert into nexus_platform_admins(user_id) values ('${admin}');
      insert into nexus_companies(id,name,created_by) values ('${company}','Moon acceptance fixture','${admin}');
      insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','owner',true);`);
    const analysis={client_action_items:[{title:'Identify the workflow owner',description:'Name the person who handles incoming bids.',instructions:'Enter the owner and their role.'}],nexus_actions:[{title:'Review the current process',instructions:'Confirm the process against the interview.'}]};
    const run=(await db.query("insert into nexus_diagnosis_runs(company_id,agent_code,status,analysis_result,created_by) values ($1,'client_diagnosis','ready_for_review',$2,'00000000-0000-4000-8000-000000000001') returning id",[company,analysis])).rows[0].id;
    await asUser(db,stranger,()=>assert.rejects(db.query('select nexus_approve_diagnosis($1)',[run]),/administrator/));
    await asUser(db,admin,async()=>{
      await db.query('select nexus_approve_diagnosis($1)',[run]);
      await db.query('select nexus_approve_diagnosis($1)',[run]);
    });
    assert.equal((await db.query('select count(*)::int n from nexus_projects')).rows[0].n,0);
    const actions=(await db.query('select * from nexus_tasks order by title')).rows;
    assert.equal(actions.length,2);
    assert.ok(actions.every(t=>t.status==='draft'&&t.project_id===null&&t.source_finding_refs.length===1));
    const action=actions.find(t=>t.responsible_party==='client');
    await asUser(db,client,async()=>{
      assert.equal((await db.query('select * from nexus_tasks')).rows.length,0);
      await assert.rejects(db.query('select nexus_submit_task_for_review($1,$2)',[action.id,{response:'Owner'}]),/not ready/);
      await assert.rejects(db.query("select relystra_review_action($1,'approve')",[action.id]),/administrator/);
    });
    await asUser(db,admin,()=>db.query("select relystra_review_action($1,'approve')",[action.id]));
    await asUser(db,stranger,async()=>{
      assert.equal((await db.query('select * from nexus_tasks')).rows.length,0);
      await assert.rejects(db.query('select relystra_save_action_response($1,$2)',[action.id,{response:'Forged'}]),/another actor/);
    });
    await asUser(db,client,async()=>{
      assert.equal((await db.query('select * from nexus_tasks')).rows.length,1);
      assert.equal((await db.query("update nexus_tasks set status='completed' where id=$1 returning id",[action.id])).rows.length,0);
      await db.query('select relystra_save_action_response($1,$2)',[action.id,{response:''}]);
      await assert.rejects(db.query('select nexus_submit_task_for_review($1,$2)',[action.id,{response:'  '}]),/required field/);
      await assert.rejects(db.query('select nexus_submit_task_for_review($1,$2)',[action.id,{response:false}]),/Invalid response type/);
      await db.query('select nexus_submit_task_for_review($1,$2)',[action.id,{response:'Sam, estimating manager'}]);
      await assert.rejects(db.query('select relystra_save_action_response($1,$2)',[action.id,{response:'Changed after submission'}]),/another actor/);
    });
    await asUser(db,admin,()=>db.query('select nexus_request_task_revision($1,$2)',[action.id,'Include the backup owner.']));
    await asUser(db,client,()=>db.query('select nexus_submit_task_for_review($1,$2)',[action.id,{response:'Sam, estimating manager; Pat is backup.'}]));
    await asUser(db,admin,()=>db.query('select nexus_approve_task($1,$2)',[action.id,'Confirmed against the current process.']));
    const final=(await db.query('select * from nexus_tasks where id=$1',[action.id])).rows[0];
    assert.equal(final.status,'completed');
    assert.ok(final.completed_at&&final.reviewed_at&&final.submitted_at);
    assert.deepEqual(final.source_finding_refs,action.source_finding_refs);
    assert.equal(final.response_data.response,'Sam, estimating manager; Pat is backup.');
    await asUser(db,admin,()=>assert.rejects(db.query("select relystra_review_action($1,'edit',$2)",[action.id,{title:'Overwritten history'}]),/retain their approved scope/));

    // Internal Build Tasks remain hidden even when an older member SELECT policy is permissive.
    await db.query("insert into nexus_tasks(company_id,title,assignee,owner_scope,status,created_by,work_kind) values ($1,'Internal permission test','nexus','nexus','open',$2,'build_task')",[company,admin]);
    await asUser(db,client,()=>db.query("select * from nexus_tasks where work_kind='build_task'").then(result=>assert.equal(result.rows.length,0)));

    assert.equal((await db.query("select count(*)::int n from nexus_action_templates where workflow_metadata->>'work_kind'='prebuild_action'")).rows[0].n,25);
    assert.equal((await db.query("select count(*)::int n from nexus_resolution_catalog where default_recipe->>'catalog_kind'='build_template'")).rows[0].n,25);
    const uploadRun=(await db.query("insert into nexus_diagnosis_runs(company_id,status,analysis_result,created_by) values ($1,'ready_for_review',$2,$3) returning id",[company,{client_action_items:[{title:'Provide a current process example',instructions:'Upload a representative file.',template_code:'prebuild_process_document'}],nexus_actions:[]},admin])).rows[0].id;
    await asUser(db,admin,()=>db.query('select nexus_approve_diagnosis($1)',[uploadRun]));
    const upload=(await db.query('select * from nexus_tasks where source_diagnosis_run_id=$1',[uploadRun])).rows[0];
    await asUser(db,admin,()=>db.query("select relystra_review_action($1,'approve')",[upload.id]));
    await asUser(db,client,()=>assert.rejects(db.query('select nexus_submit_task_for_review($1,$2)',[upload.id,{}]),/Attach the required file/));
    await db.query("insert into nexus_documents(company_id,task_id,file_name,storage_path,size_bytes,uploaded_by) values ($1,$2,'process.txt',$3,100,$4)",[company,upload.id,company+'/process.txt',client]);
    // Invented metadata is insufficient: the authorized storage object must exist too.
    await asUser(db,client,()=>assert.rejects(db.query('select nexus_submit_task_for_review($1,$2)',[upload.id,{}]),/Attach the required file/));
    await db.query("insert into storage.objects(bucket_id,name) values ('nexus-client-documents',$1)",[company+'/process.txt']);
    await asUser(db,client,()=>db.query('select nexus_submit_task_for_review($1,$2)',[upload.id,{}]));

    // Re-approving an old result is a no-op; it never converts, deletes or seeds historical work.
    const legacySummary={projects:1,one_workflow:true};
    const oldRun=(await db.query("insert into nexus_diagnosis_runs(company_id,status,analysis_result,orchestration_summary,created_by) values ($1,'approved',$2,$3,$4) returning id",[company,analysis,legacySummary,admin])).rows[0].id;
    await asUser(db,admin,()=>db.query('select nexus_approve_diagnosis($1)',[oldRun]));
    assert.equal((await db.query('select count(*)::int n from nexus_tasks where source_diagnosis_run_id=$1',[oldRun])).rows[0].n,0);
    assert.deepEqual((await db.query('select orchestration_summary from nexus_diagnosis_runs where id=$1',[oldRun])).rows[0].orchestration_summary,legacySummary);
  }finally{await db.close()}
});
