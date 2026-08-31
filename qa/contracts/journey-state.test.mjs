import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_STATUS,DIAGNOSIS_STATUS,GATE_STATE,normalizeTaskStatus,normalizeDiagnosisStatus,
  selectActiveEngagement,evaluateGate,diagnosisGateState,canAdvanceStage
} from './journey-state.mjs';
import {projectCompanyMemory,assertClientMemorySafe,projectDecision,projectEvidence} from './visibility.mjs';

test('normalizes legacy task status vocabulary',()=>{
  assert.equal(normalizeTaskStatus('open'),TASK_STATUS.NOT_STARTED);
  assert.equal(normalizeTaskStatus('done'),TASK_STATUS.COMPLETED);
  assert.equal(normalizeTaskStatus('complete'),TASK_STATUS.COMPLETED);
  assert.equal(normalizeTaskStatus('approved'),TASK_STATUS.COMPLETED);
  assert.equal(normalizeTaskStatus('ready_for_review'),TASK_STATUS.READY_FOR_REVIEW);
  assert.equal(normalizeTaskStatus('unknown'),null);
});

test('normalizes diagnosis in_review without weakening blocked states',()=>{
  assert.equal(normalizeDiagnosisStatus('in_review'),DIAGNOSIS_STATUS.READY_FOR_REVIEW);
  assert.equal(normalizeDiagnosisStatus('failed'),DIAGNOSIS_STATUS.FAILED);
});

test('refuses to guess active engagement when multiple projects are active',()=>{
  const projects=[
    {id:'a',status:'planning',project_type:'discovery'},
    {id:'b',status:'active',project_type:'implementation'}
  ];
  assert.deepEqual(selectActiveEngagement(projects),{project:null,reason:'ambiguous_multiple_active'});
  assert.equal(selectActiveEngagement(projects,'b').project.id,'b');
});

test('selects the only active engagement deterministically',()=>{
  const projects=[{id:'a',status:'complete'},{id:'b',status:'planning'}];
  assert.equal(selectActiveEngagement(projects).project.id,'b');
});

test('blocked gate outranks progress and prevents advancement',()=>{
  const gate=evaluateGate([
    {status:'complete'},
    {status:'blocked',title:'Missing baseline'},
    {status:'waiting_on_client'}
  ]);
  assert.equal(gate.state,GATE_STATE.BLOCKED);
  assert.equal(canAdvanceStage({currentStageKey:'discovery',gate}),false);
});

test('gate advances only when every requirement is complete or not applicable',()=>{
  const gate=evaluateGate([{status:'completed'},{status:'approved'},{status:'not_applicable'}]);
  assert.equal(gate.state,GATE_STATE.COMPLETE);
  assert.equal(canAdvanceStage({currentStageKey:'findings',gate}),true);
});

test('failed diagnosis never counts as a completed discovery/diagnosis gate',()=>{
  assert.equal(diagnosisGateState({status:'failed',analysis_result:null}),GATE_STATE.BLOCKED);
  assert.equal(diagnosisGateState({status:'blocked',analysis_result:{facts:[]}}),GATE_STATE.BLOCKED);
});

test('diagnosis must be approved and contain a result before completion',()=>{
  assert.equal(diagnosisGateState({status:'approved',analysis_result:null}),GATE_STATE.NOT_STARTED);
  assert.equal(diagnosisGateState({status:'ready_for_review',analysis_result:{facts:['x']}}),GATE_STATE.WAITING_ON_DECISION);
  assert.equal(diagnosisGateState({status:'approved',analysis_result:{facts:['x']}}),GATE_STATE.COMPLETE);
});

test('client memory projection removes internal operating and decision notes',()=>{
  const memory={goals:'grow',systems:'crm',terminology:'lead',operating_context:'internal context',decision_notes:'private decision',updated_by:'admin'};
  const safe=assertClientMemorySafe(memory);
  assert.equal(safe.safe,true);
  assert.deepEqual(projectCompanyMemory(memory,'client'),{goals:'grow',systems:'crm',terminology:'lead'});
  assert.equal(projectCompanyMemory(memory,'admin').decision_notes,'private decision');
});

test('client cannot receive non-client-visible decisions or evidence',()=>{
  assert.equal(projectDecision({id:'1',client_visible:false,title:'private'},'client'),null);
  assert.equal(projectEvidence({id:'2',client_visible:false,title:'private'},'client'),null);
  assert.equal(projectDecision({id:'3',client_visible:true,title:'ok',decision:'go'},'client').title,'ok');
});
