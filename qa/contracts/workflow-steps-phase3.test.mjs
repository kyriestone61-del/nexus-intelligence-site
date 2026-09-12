import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workflowStepIntroMarkup} from '../../portal-journey-steps.js';

const source=file=>readFileSync(file,'utf8');

test('Steps 3–11 use dedicated, consistently named workflow page headings',()=>{
  const files=['portal-discovery-evidence.js','portal-admin-intake.js','portal-action-processing-engine.js','portal-builds.js','portal-package-delivery.js'].map(source).join('\n');
  for(const [key,step,title] of [['review-findings',3,'Review Findings'],['diagnosis',4,'Full Diagnosis'],['actions',5,'Required Inputs'],['builds',6,'Recommended Builds'],['scope',7,'Agree Scope & Payment'],['progress',8,'Build & Quality Checks'],['review',9,'Client Review'],['final-package',10,'Final Handoff'],['support',11,'Completion & Support']]){
    assert.match(files,new RegExp(title.replace('&','(?:&|&amp;)')));
    assert.match(workflowStepIntroMarkup(key,{title}),new RegExp(`Step ${step} of 11`));
  }
  const intro=workflowStepIntroMarkup('review',{description:'Review the draft.',statusDetail:'Waiting',nextTitle:'Final Handoff'});
  assert.match(intro,/Step 9 of 11/);assert.match(intro,/data-step-page="review"/);assert.match(intro,/Waiting/);assert.match(intro,/Next · Final Handoff/);
});

test('Review Findings is a decision workspace rather than a duplicate report',()=>{
  const discovery=source('portal-discovery-evidence.js');
  for(const marker of ['relystra-review-summary','relystra-review-workspace','Important Findings','Areas That Matter Most','Information Still Missing','Review decision','Confirm findings & continue','Save a correction','data-review-back','data-review-continue'])assert.match(discovery,new RegExp(marker.replace(/[&]/g,'(?:&|&amp;)')));
  assert.match(discovery,/navigate\('diagnosis'\)/);
});

test('Step 4 keeps diagnosis initiation and approval primary while supporting evidence is disclosed',()=>{
  const intake=source('portal-admin-intake.js'),client=source('portal-client-shell-v2.js');
  assert.ok(intake.indexOf('data-module="diagnosis"')<intake.indexOf('data-module="evidence"'));
  assert.ok(intake.indexOf('data-module="review"')<intake.indexOf('data-module="evidence"'));
  assert.match(intake,/relystra-workflow-supporting/);
  assert.match(client,/Continue to Required Inputs/);
});

test('Steps 5–7 expose required-input state and separate recommendation from commercial confirmation',()=>{
  const actions=source('portal-action-processing-engine.js'),builds=source('portal-builds.js');
  for(const label of ['Required now','With Relystra','Blocked / upcoming','Completed'])assert.match(actions,new RegExp(label.replace('/','\\/')));
  assert.match(actions,/relystra-input-summary/);
  assert.match(builds,/Diagnosis translated/);assert.match(builds,/Commercial decision/);
  assert.match(builds,/Scope, agreement & payment/);
  assert.match(builds,/root\.querySelector\('\[data-build-menu\]'\)\?\.remove\(\)/);
});

test('Steps 8–11 have distinct production, review, handoff, and support surfaces',()=>{
  const delivery=source('portal-package-delivery.js'),admin=source('portal-admin-journey.js');
  assert.match(delivery,/if\(section==='review'\)return renderReview\(\)/);
  assert.match(delivery,/function renderReview\(\)/);
  for(const title of ['Build & Quality Checks','Client Review','Final Handoff','Completion & Support'])assert.match(delivery,new RegExp(title.replace('&','\\&')));
  assert.match(delivery,/Delivered assets/);assert.match(delivery,/Questions & answers/);
  assert.doesNotMatch(admin,/active==='review'\?'progress':active/);
});

test('shared workflow frame is responsive and preserves an explicit next-stage cue',()=>{
  const css=source('portal-delivery.css');
  for(const selector of ['.relystra-step-page-head','.relystra-step-state','.relystra-step-primary-action','.relystra-review-workspace','.relystra-input-summary','.relystra-support-center'])assert.match(css,new RegExp(selector.replaceAll('.','\\.')));
  assert.match(css,/@media\(max-width:760px\).*?\.relystra-step-page-head\{grid-template-columns:1fr/s);
  assert.match(source('portal-journey-steps.js'),/Continue to/);
});
