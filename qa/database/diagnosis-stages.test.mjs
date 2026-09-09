import test from 'node:test';
import assert from 'node:assert/strict';
import {database,asUser} from './fixture.mjs';
import {diagnosisStages,validateDiagnosisStage} from '../../supabase/functions/_shared/relystra-diagnosis-job.ts';
import {executeDiagnosis} from '../../portal-diagnosis-request.js';
const admin='00000000-0000-4000-8000-000000000001',company='00000000-0000-4000-8000-000000000003',run='00000000-0000-4000-8000-000000000004',lease='00000000-0000-4000-8000-000000000005',other='00000000-0000-4000-8000-000000000006';
test('persisted diagnosis stages keep evidence private, prevent concurrent spend, resume progress, and reject stale leases',async()=>{
 const db=await database(['20260909135500_relystra_async_diagnosis.sql']);
 try{
 await db.exec(`insert into auth.users values('${admin}'); insert into nexus_companies(id,name,created_by) values('${company}','Synthetic stage QA','${admin}'); insert into nexus_diagnosis_runs(id,company_id,status,created_by,execution_lease_id,execution_lease_expires_at) values('${run}','${company}','analyzing','${admin}','${lease}',now()+interval '4 minutes');`);
 const enqueue=()=>db.query('select relystra_enqueue_diagnosis_job($1,$2,$3,$4)',[run,lease,{authorized_evidence:'Private synthetic evidence'},{model:'test'}]);
 await enqueue();await enqueue();assert.equal((await db.query('select count(*)::int n from relystra_diagnosis_jobs')).rows[0].n,1);
 await asUser(db,admin,async()=>{
  await assert.rejects(db.query('select * from relystra_diagnosis_jobs'),/permission denied/);
  await assert.rejects(db.query('select relystra_claim_diagnosis_stage($1)',[run]),/permission denied/);
  await assert.rejects(enqueue(),/permission denied/);
 });
 const claim=async()=>(await db.query('select relystra_claim_diagnosis_stage($1) j',[run])).rows[0].j;
 let j=await claim();assert.equal(j.status,'claimed');assert.equal(j.stage,0);assert.equal((await claim()).status,'busy');
 const advance=(stageLease,stage,result)=>db.query('select relystra_advance_diagnosis_stage($1,$2,$3,$4,$5) ok',[run,lease,stageLease,stage,result]).then(r=>r.rows[0].ok);
 assert.equal(await advance(other,0,{facts:[]}),false);
 assert.equal(await advance(j.stage_lease_id,0,{facts:[{statement:'Synthetic evidence'}]}),true);
 assert.equal(await advance(j.stage_lease_id,0,{facts:['stale overwrite']}),false);
 j=await claim();assert.equal(j.stage,1);assert.equal(j.partial_result.facts[0].statement,'Synthetic evidence');
 assert.equal(await advance(j.stage_lease_id,1,{risks:[]}),true);
 j=await claim();assert.equal(j.stage,2);assert.equal(await advance(j.stage_lease_id,2,{executive_summary:'Complete synthetic report'}),true);
 assert.equal((await claim()).status,'complete');
 await db.query('select relystra_discard_diagnosis_job($1,$2)',[run,lease]);await enqueue();j=await claim();
 await db.query('update nexus_diagnosis_runs set execution_lease_id=$1 where id=$2',[other,run]);
 assert.equal(await advance(j.stage_lease_id,0,{risks:[]}),false);assert.equal(await claim(),null);
 assert.equal((await db.query('select count(*)::int n from relystra_diagnosis_jobs')).rows[0].n,0);
 await db.query('update nexus_diagnosis_runs set execution_lease_id=$1 where id=$2',[lease,run]);await enqueue();
 await db.exec("update relystra_diagnosis_jobs set expires_at=now()-interval '1 second'");assert.equal((await claim()).status,'expired');
 await db.query('delete from nexus_diagnosis_runs where id=$1',[run]);assert.equal((await db.query('select count(*)::int n from relystra_diagnosis_jobs')).rows[0].n,0);
 }finally{await db.close()}
});
test('three validated stage outputs preserve every report field and cannot overwrite other stages',()=>{
 const objectFields=['current_state','smallest_safe_pilot','recommended_first_intervention','quality_assurance'];let result={};
 for(let stage=0;stage<3;stage++){
  const value=Object.fromEntries(diagnosisStages[stage].keys.map(k=>[k,k==='executive_summary'?'Synthetic summary':objectFields.includes(k)?{}:[]]));
  assert.throws(()=>validateDiagnosisStage(stage,{}),/INVALID_RESULT/);
  result={...result,...validateDiagnosisStage(stage,{...value,execution:{forged:true},injected:'not allowed'})};
 }
 assert.equal(Object.keys(result).length,25);assert.ok(!result.execution);assert.ok(!result.injected);
 assert.ok(Array.isArray(result.client_statements));assert.ok(Array.isArray(result.opportunity_backlog));assert.ok(Array.isArray(result.nexus_actions));
});
test('browser resumes persisted stages and never reports a partial diagnosis as ready',async()=>{
 let calls=0,waits=0;
 const sb={functions:{invoke:async()=>({data:{ok:true,status:++calls<4?'analyzing':'ready_for_review'},error:null})}};
 const result=await executeDiagnosis(sb,run,{wait:async()=>{waits++},now:()=>0});assert.equal(result.data.status,'ready_for_review');assert.equal(calls,4);assert.equal(waits,3);
 const failed=await executeDiagnosis({functions:{invoke:async()=>({data:{ok:false,error:'MODEL_TIMEOUT'}})}},run,{wait:async()=>{throw Error('Must not retry failed work')}});assert.equal(failed.data.error,'MODEL_TIMEOUT');
});
