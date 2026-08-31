import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_TRANSITIONS,DIAGNOSIS_TRANSITIONS,PROJECT_TRANSITIONS,GATE_TRANSITIONS,
  canTransition,taskTransition,diagnosisTransition,projectTransition,gateTransition,
  requireTransitionEvidence
} from './state-transitions.mjs';

test('client task cannot jump from waiting_on_client directly to completed',()=>{
  assert.equal(canTransition(TASK_TRANSITIONS,'waiting_on_client','completed'),false);
  assert.throws(()=>taskTransition('waiting_on_client','completed'),/Illegal task transition/);
  assert.equal(taskTransition('waiting_on_client','ready_for_review'),true);
});

test('reviewed task can be approved or returned without reopening arbitrary states',()=>{
  assert.equal(canTransition(TASK_TRANSITIONS,'ready_for_review','completed'),true);
  assert.equal(canTransition(TASK_TRANSITIONS,'ready_for_review','waiting_on_client'),true);
  assert.equal(canTransition(TASK_TRANSITIONS,'ready_for_review','not_started'),false);
});

test('diagnosis approval is only legal after ready_for_review',()=>{
  for(const state of ['ready_for_analysis','queued','analyzing','failed','blocked','revision_requested']){
    assert.equal(canTransition(DIAGNOSIS_TRANSITIONS,state,'approved'),false,`${state} should not approve`);
  }
  assert.equal(diagnosisTransition('ready_for_review','approved'),true);
});

test('terminal diagnosis cannot silently reopen',()=>{
  assert.equal(canTransition(DIAGNOSIS_TRANSITIONS,'approved','queued'),false);
  assert.equal(canTransition(DIAGNOSIS_TRANSITIONS,'archived','ready_for_analysis'),false);
});

test('project cannot jump from planning directly to complete',()=>{
  assert.equal(canTransition(PROJECT_TRANSITIONS,'planning','complete'),false);
  assert.equal(projectTransition('planning','active'),true);
  assert.equal(projectTransition('active','complete'),true);
});

test('complete journey gate is terminal without explicit revision workflow',()=>{
  assert.equal(gateTransition('waiting_on_decision','complete'),true);
  assert.equal(canTransition(GATE_TRANSITIONS,'complete','in_progress'),false);
});

test('consequential transitions require a reason or evidence reference',()=>{
  assert.deepEqual(requireTransitionEvidence({entity:'task',from:'ready_for_review',to:'completed',reason:'',evidenceRefs:[]}).ok,false);
  assert.equal(requireTransitionEvidence({entity:'task',from:'ready_for_review',to:'completed',reason:'Reviewed and accepted',evidenceRefs:[]}).ok,true);
  assert.equal(requireTransitionEvidence({entity:'journey gate',from:'waiting_on_decision',to:'complete',reason:'',evidenceRefs:['approval:123']}).ok,true);
  assert.equal(requireTransitionEvidence({entity:'task',from:'not_started',to:'in_progress',reason:'',evidenceRefs:[]}).ok,true);
});
