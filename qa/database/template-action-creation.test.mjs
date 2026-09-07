import test from 'node:test';
import assert from 'node:assert/strict';
import {database,asUser} from './fixture.mjs';
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004',request='00000000-0000-4000-8000-000000000005';
test('template Actions retain approved historical evidence, require admin review and cannot cross companies',async()=>{
  const db=await database(['20260907111859_relystra_template_action_creation.sql']);
  try{
    await db.exec(`insert into auth.users values ('${admin}'),('${client}'); insert into nexus_platform_admins(user_id) values ('${admin}');
      insert into nexus_companies(id,name,created_by) values ('${company}','Template QA','${admin}'),('${other}','Other','${admin}');
      insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','client',true);`);
    const source={title:'Confirm intake ownership',instructions:'Identify the current owner.'};
    const run=(await db.query("insert into nexus_diagnosis_runs(company_id,status,analysis_result,created_by) values ($1,'approved',$2,$3) returning id",[company,{client_action_items:[source]},admin])).rows[0].id;
    const args=[company,run,'client_action_items/0','prebuild_workflow_owner',request,{title:'Confirm intake owner and backup',instructions:'Name both roles.'}];
    const create=(values=args)=>db.query('select relystra_create_template_action($1,$2,$3,$4,$5,$6) id',values);
    await asUser(db,client,()=>assert.rejects(create(),/administrator/));
    let id;
    await asUser(db,admin,async()=>{
      await assert.rejects(create([other,...args.slice(1)]),/approved diagnosis/);
      await assert.rejects(create([...args.slice(0,2),'client_action_items/99',...args.slice(3)]),/not found/);
      await assert.rejects(create([...args.slice(0,2),'company_id',...args.slice(3)]),/source action/);
      await assert.rejects(create([...args.slice(0,3),'invalid',...args.slice(4)]),/template/);
      await assert.rejects(create([...args.slice(0,5),{title:'',instructions:'Invalid'}]),/title/);
      id=(await create()).rows[0].id;
      assert.equal((await create()).rows[0].id,id,'request retry is idempotent');
    });
    const task=(await db.query('select * from nexus_tasks where id=$1',[id])).rows[0];
    assert.equal(task.project_id,null);assert.equal(task.work_kind,'prebuild_action');assert.equal(task.action_review_state,'suggested');
    assert.deepEqual(task.source_finding_refs[0].snapshot,source);
    assert.equal((await db.query('select count(*)::int n from nexus_projects')).rows[0].n,0);
    await asUser(db,client,()=>assert.rejects(db.query('select nexus_submit_task_for_review($1,$2)',[id,{response:'Sample role'}]),/not ready/));
    await asUser(db,admin,()=>db.query("select relystra_review_action($1,'approve')",[id]));
    await asUser(db,client,()=>db.query('select nexus_submit_task_for_review($1,$2)',[id,{response:'QA owner, QA backup (sample roles)'}]));
    await asUser(db,admin,()=>db.query('select nexus_approve_task($1)',[id]));
    assert.equal((await db.query('select status from nexus_tasks where id=$1',[id])).rows[0].status,'completed');
    assert.deepEqual((await db.query('select analysis_result from nexus_diagnosis_runs where id=$1',[run])).rows[0].analysis_result,{client_action_items:[source]});
  }finally{await db.close()}
});
