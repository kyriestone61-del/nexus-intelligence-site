import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageInput,expandCoverage} from '../../supabase/functions/_shared/relystra-coverage.ts';
const framework=[{code:'context',domain:'Business',requirement:'Business context',material:true,desired_evidence:'Interview'},{code:'handoff',domain:'Operations',requirement:'Handoffs',material:true,desired_evidence:'Workflow sample'},{code:'optional',domain:'Other',requirement:'Optional',material:false}];
const result=()=>({assessments:[['context','answered',0.9,['E1'],'Owner described the business.',''],['handoff','partial',0.6,['E1'],'Backup owner unknown.','Who approves when the owner is absent?'],['optional','missing',0,[],'Not supplied.','']],sufficient_for_diagnosis:true,summary:'Enough context for diagnosis; confirm backup ownership.'});
test('compact coverage retains every requirement and builds only material unresolved gaps',()=>{
 const r=expandCoverage(result(),framework,{E1:'document-1'});assert.equal(r.requirements.length,3);assert.equal(r.gaps.length,1);assert.equal(r.gaps[0].code,'handoff');assert.equal(r.gaps[0].domain,'Operations');assert.equal(r.gaps[0].desired_evidence,'Workflow sample');assert.equal(r.gaps[0].question,'Who approves when the owner is absent?');assert.equal(r.coverage_score,50);assert.deepEqual(r.requirements[0].evidence_refs,['document-1']);
});
test('coverage rejects omitted, duplicate, invented, uncited and malformed assessments',()=>{
 for(const change of [x=>x.assessments.pop(),x=>x.assessments[2][0]='context',x=>x.assessments[0][3]=['foreign'],x=>x.assessments[0][3]=[],x=>x.assessments[1][5]='',x=>x.assessments[0][2]=2,x=>x.assessments[0][1]='complete']){const r=result();change(r);assert.throws(()=>expandCoverage(r,framework,{E1:'document-1'}),e=>e.code==='MODEL_SCHEMA_INVALID')}
});
test('short source aliases preserve all evidence and restore exact references',()=>{
 const b={docs:[{id:'document-1'}],text:'document-1:0 observed handoff. ADMIN_CONTEXT:context-1 constraint. CLIENT_RESPONSE:answer-1 response.',adminContext:{id:'context-1'},clientResponses:[{ref:'CLIENT_RESPONSE:answer-1'}]};const x=coverageInput(framework,b);assert.equal(x.payload.authorized_evidence,'E1:0 observed handoff. A1 constraint. C1 response.');assert.equal(x.index.A1,'ADMIN_CONTEXT:context-1');assert.equal(x.index.C1,'CLIENT_RESPONSE:answer-1');assert.equal(x.payload.framework.length,3);
});
