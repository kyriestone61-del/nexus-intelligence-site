import test from 'node:test';
import assert from 'node:assert/strict';
import {database,asUser} from './fixture.mjs';
import {recommendationFindings,buildRecommendationPayload} from '../../supabase/functions/_shared/relystra-build-recommendations.ts';

const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';
const analysis={opportunity_backlog:[{title:'Bid intake',problem:'Scattered bids'}]};
const qualification=Object.fromEntries(['impact','urgency','effort','dependency_readiness','client_readiness','confidence'].map(k=>[k,{level:'medium',reason:'Supported by the supplied finding; uncertainty retained.'}]));
const draft={qualified:true,qualification,operational_benefit:'Clear ownership of each bid',name:'Bid intake',outcome:'A routed bid',template_code:'build_bid_intake',source_path:'opportunity_backlog/0',completed_action_ids:[],
  scope_in:['One approved intake source'],scope_out:['No auto-submission'],acceptance_criteria:['A sample bid reaches its owner'],
  price_cents:1,complexity:'simple',duration_min:1,duration_max:1,build_review_state:'approved'};

test('model recommendations are evidence-bounded and cannot provide approval or final commercial terms',()=>{
  const findings=recommendationFindings({id:'diagnosis_fixture',analysis_result:analysis});
  assert.equal(findings[0].source_path,'opportunity_backlog/0');
  const templates=[{code:'build_bid_intake'}];
  const [result]=buildRecommendationPayload({builds:[draft]},findings,templates,[]);
  assert.equal(result.price_cents,undefined);
  assert.equal(result.build_review_state,undefined);
  assert.equal(result.duration_min,undefined);
  assert.throws(()=>buildRecommendationPayload({builds:[{...draft,source_path:'opportunity_backlog/9'}]},findings,templates,[]),/UNSUPPORTED/);
  assert.throws(()=>buildRecommendationPayload({builds:[{...draft,completed_action_ids:['foreign_action']}]},findings,templates,[]),/UNSUPPORTED/);
  assert.throws(()=>buildRecommendationPayload({builds:[draft,draft]},findings,templates,[]),/DUPLICATE/);
  assert.deepEqual(buildRecommendationPayload({builds:[]},findings,templates,[]),[],'thin evidence can produce no recommendation');
});

test('generated Build batches reject stale evidence, roll back partial failures and remain proposals on retry',async()=>{
  const db=await database(['20260907000300_relystra_build_planning.sql','20260907000400_relystra_paid_activation.sql','20260907000500_relystra_build_recommendations.sql','20260909142000_relystra_build_identity_index.sql']);
  try{
    await db.exec(`insert into auth.users values ('${admin}'),('${client}');
      insert into nexus_platform_admins(user_id) values ('${admin}');
      insert into nexus_companies(id,name,created_by) values ('${company}','Recommendation fixture','${admin}');
      insert into nexus_company_members(company_id,user_id,member_role,active) values ('${company}','${client}','owner',true);`);
    const run=(await db.query("insert into nexus_diagnosis_runs(company_id,status,analysis_result,created_by) values ($1,'approved',$2,$3) returning id,updated_at",[company,analysis,admin])).rows[0];
    const sql='select relystra_propose_builds($1,$2,$3,$4,$5) ids';
    const args=[company,run.id,run.updated_at,[],[draft]];
    await asUser(db,client,()=>assert.rejects(db.query(sql,args),/administrator/));
    await asUser(db,admin,async()=>{
      await assert.rejects(db.query(sql,args.map((v,i)=>i===2?'2000-01-01':v)),/Diagnosis changed/);
      await assert.rejects(db.query(sql,args.map((v,i)=>i===3?[{id:'changed',updated_at:'2000-01-01'}]:v)),/Accepted inputs changed/);
      await assert.rejects(db.query(sql,args.map((v,i)=>i===4?[draft,{...draft,template_code:'not_a_template'}]:v)),/available Build template/);
      assert.equal((await db.query('select count(*)::int n from nexus_opportunities')).rows[0].n,0);
      const first=(await db.query(sql,args)).rows[0].ids;
      assert.deepEqual((await db.query(sql,args)).rows[0].ids,first,'repeated generation does not duplicate a source/template proposal');
      const saved=(await db.query('select * from nexus_opportunities')).rows[0];
      assert.equal(saved.build_review_state,'proposed');
      assert.equal(saved.build_approved_at,null);
      assert.equal(saved.build_spec.price_cents,undefined);
      assert.equal(saved.build_spec.duration_max,undefined);
      assert.equal(saved.build_spec.source_finding_refs[0].snapshot.problem,'Scattered bids');
      const alternate=(await db.query("select code from nexus_resolution_catalog where code<>'build_bid_intake' and default_recipe->>'catalog_kind'='build_template' limit 1")).rows[0].code;
      const sameTitleArgs=args.map((v,i)=>i===4?[draft,{...draft,template_code:alternate}]:v);
      const pair=(await db.query(sql,sameTitleArgs)).rows[0].ids;
      assert.equal(new Set(pair).size,2,'different capabilities can have the same editable display title');
      assert.deepEqual((await db.query(sql,sameTitleArgs)).rows[0].ids,pair,'stable diagnosis/finding/template identity remains idempotent');
      await db.query("insert into nexus_opportunities(company_id,title,source,status,created_by,source_diagnosis_run_id) values ($1,'Legacy finding','diagnosis','recommended',$2,$3)",[company,admin,run.id]);
      await assert.rejects(db.query("insert into nexus_opportunities(company_id,title,source,status,created_by,source_diagnosis_run_id) values ($1,'Legacy finding','diagnosis','recommended',$2,$3)",[company,admin,run.id]),/nexus_opportunities_diagnosis_title_unique/);

    });
    await asUser(db,client,()=>db.query('select relystra_build_menu($1) menu',[company]).then(r=>assert.deepEqual(r.rows[0].menu,[])));
  }finally{await db.close()}
});

test('invalid generated references get one bounded repair and still require full validation',async()=>{
  const {validatedBuildRecommendations}=await import('../../supabase/functions/_shared/relystra-build-recommendations.ts');
  const findings=[{source_path:'claims/0'}],templates=[{code:'valid_template'}],inputs=[];
  const valid={qualified:true,qualification,operational_benefit:'Clear workflow ownership',name:'Bounded QA Build',outcome:'Reviewable QA outcome',source_path:'claims/0',template_code:'valid_template',completed_action_ids:[]};
  let attempts=0;
  const builds=await validatedBuildRecommendations(async(correction,timeout)=>{
    attempts++;assert.ok(timeout<=80000);
    if(attempts===1)return {builds:[{...valid,template_code:'invented'}]};
    assert.equal(correction.validation_error,'UNSUPPORTED_BUILD_RECOMMENDATION_TEMPLATE_CODE');return {builds:[valid]};
  },findings,templates,inputs);
  assert.equal(attempts,2);assert.equal(builds[0].template_code,'valid_template');
  attempts=0;
  await assert.rejects(validatedBuildRecommendations(async()=>{attempts++;return {builds:[{...valid,completed_action_ids:['foreign']}]};},findings,templates,inputs),/ACTION_IDS/);
  assert.equal(attempts,2);
  attempts=0;
  await assert.rejects(validatedBuildRecommendations(async()=>{attempts++;throw Error('MODEL_PROXY_ACCESS_403');},findings,templates,inputs),/MODEL_PROXY_ACCESS_403/);
  assert.equal(attempts,1);
});

test('qualification input keeps all capability identities and omits commercial prices and internal delivery notes',async()=>{
 const {qualificationCatalog}=await import('../../supabase/functions/_shared/relystra-build-recommendations.ts');
 const templates=Array.from({length:59},(_,i)=>({code:'capability_'+i,title:'Capability '+i,default_recipe:{typical_problem:'Supported problem',typical_outcome:'Bounded outcome',qualifying_conditions:['Evidence required'],required_inputs:['Authorized records'],prerequisite_builds:['prerequisite'],default_price_cents:123456,internal_notes:'Private operating note',default_checklist:['Internal procedure']}}));
 const projected=qualificationCatalog(templates);
 assert.deepEqual(projected.map(t=>t.code),templates.map(t=>t.code));
 assert.deepEqual(projected[0].prerequisite_builds,['prerequisite']);
 assert.deepEqual(projected[0].required_inputs,['Authorized records']);
 assert.ok(!JSON.stringify(projected).includes('123456'));assert.ok(!JSON.stringify(projected).includes('Private operating note'));assert.ok(!JSON.stringify(projected).includes('Internal procedure'));
});
