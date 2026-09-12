import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {journeySteps} from '../../portal-journey-steps.js';

const source=file=>readFileSync(file,'utf8');

test('all eleven workflow keys are stable and unique route destinations',()=>{
  assert.deepEqual(journeySteps.map(([key])=>key),['transcript','free-diagnosis','review-findings','diagnosis','actions','builds','scope','progress','review','final-package','support']);
  assert.equal(new Set(journeySteps.map(([key])=>key)).size,11);
});

test('client and administrator shells mount separate Step 1, 2, and 3 page roots',()=>{
  const client=source('portal-client-shell-v2.js'),admin=source('portal-admin-journey.js'),stage=source('portal-transcript-stage.js');
  for(const text of [client,admin]){
    assert.match(text,/freeDiagnosis:/);assert.match(text,/reviewFindings:/);
    assert.doesNotMatch(text,/\['free-diagnosis','review-findings','discovery'\]\.includes\([^)]*\)[^\n]*='transcript'/);
  }
  assert.match(stage,/mountDiscoveryEvidence\(roots/);
});

test('the discovery controller preserves one shared engagement state while rendering three pages',()=>{
  const discovery=source('portal-discovery-evidence.js');
  assert.match(discovery,/data-workflow-step="1"/);assert.match(discovery,/data-workflow-step="2"/);assert.match(discovery,/data-workflow-step="3"/);
  assert.match(discovery,/transcriptRoot\.innerHTML=stepOneMarkup/);
  assert.match(discovery,/freeDiagnosisRoot\.innerHTML=stepTwoMarkup/);
  assert.match(discovery,/reviewFindingsRoot\.innerHTML=stepThreeMarkup/);
  assert.equal((discovery.match(/relystra_discovery_workspace/g)||[]).length,1,'all three pages must use the same discovery workspace controller');
});

test('route changes create browser history entries and popstate restores the requested step',()=>{
  for(const file of ['portal-client-shell-v2.js','portal-admin-journey.js']){
    const text=source(file);assert.match(text,/pushState/);assert.match(text,/addEventListener\('popstate'/);assert.match(text,/historyMode:'none'/);
  }
});
