import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {database,asUser} from './fixture.mjs';
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';
test('new diagnosis execution requires purchase while existing diagnosis access is preserved',async()=>{
  const migrations=(await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(n=>n.startsWith('20260907')&&!n.includes('000100_')&&!n.includes('000200_')&&!n.includes('diagnosis_purchase_gate')).sort();
  const db=await database(migrations);
  try{
    await db.exec(`insert into auth.users values ('${admin}'),('${client}');insert into nexus_platform_admins(user_id) values ('${admin}');
      insert into nexus_companies(id,name,created_by) values ('${company}','Diagnosis gate fixture','${admin}');
      insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','owner',true);`);
    const old=(await db.query("insert into nexus_diagnosis_runs(company_id,status,created_by) values ($1,'draft',$2) returning id",[company,admin])).rows[0].id;
    await db.exec(await fs.readFile(new URL('../../supabase/migrations/20260907051007_relystra_diagnosis_purchase_gate.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select relystra_legacy_access from nexus_diagnosis_runs where id=$1',[old])).rows[0].relystra_legacy_access,true);
    await assert.rejects(db.query('update nexus_diagnosis_runs set relystra_legacy_access=false where id=$1',[old]),/immutable/);
    const fresh=(await db.query("insert into nexus_diagnosis_runs(company_id,status,created_by,relystra_legacy_access) values ($1,'draft',$2,true) returning id,relystra_legacy_access",[company,admin])).rows[0];
    assert.equal(fresh.relystra_legacy_access,false);
    await assert.rejects(db.query("update nexus_diagnosis_runs set status='queued' where id=$1",[fresh.id]),/Purchase the operational diagnosis/);
    await asUser(db,client,()=>assert.rejects(db.query('select relystra_diagnosis_access($1,$2)',[company,fresh.id]),/permission denied/));
    await db.exec('set role service_role');
    assert.equal((await db.query('select relystra_diagnosis_access($1,$2) allowed',[company,old])).rows[0].allowed,true);
    assert.equal((await db.query('select relystra_diagnosis_access($1,$2) allowed',[company,fresh.id])).rows[0].allowed,false);
    await db.exec('reset role');
    await db.exec("insert into nexus_commercial_offerings(code,name,description,client_outcome,pricing_model,sort_order) values ('find','Operational Diagnosis','Diagnosis','Findings','fixed',1)");
    await db.query("insert into nexus_company_entitlements(company_id,offering_code,status,source,starts_at) values ($1,'find','active','manual',now())",[company]);
    await db.exec('set role service_role');
    assert.equal((await db.query('select relystra_diagnosis_access($1,$2) allowed',[company,fresh.id])).rows[0].allowed,true);
    await db.exec('reset role');
  }finally{await db.close()}
});
