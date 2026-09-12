import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {journeyGate,journeyMarkup,journeyPagerMarkup,journeyProgress,journeySteps,workflowStepIntroMarkup} from '../../portal-journey-steps.js';
import {workspaceUrl} from '../../portal-workspace-context.js';

const source=file=>readFileSync(file,'utf8');
const keys=journeySteps.map(([key])=>key);
const titles=Object.fromEntries(journeySteps);
const currentThree={company_id:'qa-company',project_id:'qa-engagement',project_type:'build_package',workflow:{current_step:3,completed:false},diagnosis:{access:false,status:null},package:null};

test('every step has one active destination, current-page label, page title, and preserved context',()=>{
  for(const [index,key] of keys.entries()){
    const html=journeyMarkup(currentThree,{active:key,attribute:'data-qa-route'});
    assert.equal((html.match(/aria-current="step"/g)||[]).length,1,`Step ${index+1} active marker`);
    assert.match(html,new RegExp(`data-qa-route="${key}" aria-current="step"[^]*?Current page`));
    assert.match(workflowStepIntroMarkup(key,{title:titles[key]}),new RegExp(`Step ${index+1} of 11`));
    const url=new URL(workspaceUrl(`https://relystra.test/portal?company=wrong&project=wrong&section=${key}`,'qa-company','qa-engagement'),'https://relystra.test');
    assert.equal(url.searchParams.get('company'),'qa-company');
    assert.equal(url.searchParams.get('project'),'qa-engagement');
    assert.equal(url.searchParams.get('section'),key);
  }
});

test('workflow progress and access gates distinguish server state from the viewed page',()=>{
  assert.deepEqual(journeyProgress(currentThree).map(step=>step.status),['completed','completed','current','upcoming','upcoming','upcoming','upcoming','upcoming','upcoming','upcoming','upcoming']);
  assert.equal(journeyGate('free-diagnosis',currentThree),null,'completed report remains revisitable');
  assert.equal(journeyGate('review-findings',currentThree),null,'current findings remain available');
  assert.equal(journeyGate('builds',currentThree)?.section,'diagnosis');
  assert.equal(journeyGate('review',currentThree)?.section,'scope');
  const paid={...currentThree,diagnosis:{status:'approved'},package:{stage:'production'}};
  assert.equal(journeyGate('builds',paid),null);
  assert.equal(journeyGate('review',paid)?.section,'progress');
  assert.equal(journeyGate('final-package',{...paid,package:{stage:'client_review'}})?.section,'review');
  assert.equal(journeyGate('support',{...paid,package:{stage:'support'}}),null);
  assert.equal(journeyProgress({...paid,workflow:{current_step:11,completed:true}}).every(step=>step.status==='completed'),true);
});

test('previous and next navigation is complete and honestly signals gated destinations',()=>{
  for(const [index,key] of keys.entries()){
    const html=journeyPagerMarkup(key,currentThree,{attribute:'data-qa-route'});
    assert.match(html,/aria-label="Previous and next workflow steps"/);
    if(index>0)assert.match(html,new RegExp(`data-qa-route="${keys[index-1]}"`));
    if(index<keys.length-1)assert.match(html,new RegExp(`data-qa-route="${keys[index+1]}"`));
  }
  assert.match(journeyPagerMarkup('actions',currentThree),/View requirements for Step 6/);
  assert.match(journeyPagerMarkup('support',currentThree),/Workflow complete/);
});

test('responsive workflow CSS covers overflow, stacking, readable reports, and touch targets',()=>{
  const css=source('portal-delivery.css'),globalCss=source('styles.css');
  assert.match(css,/\.relystra-numbered-journey ol\{[^}]*overflow-x:auto/);
  assert.match(css,/\.relystra-numbered-journey button\{[^}]*min-height:64px/);
  assert.match(css,/@media\(max-width:760px\)[^]*\.relystra-step-page-head\{grid-template-columns:1fr/);
  assert.match(css,/@media\(max-width:760px\)[^]*\.relystra-step-primary-action \.btn[^}]*width:100%/);
  assert.match(css,/@media\(max-width:760px\)[^]*\.relystra-report-controls\{grid-template-columns:1fr/);
  assert.match(css,/\.relystra-workflow-step\{max-width:920px/);
  assert.match(css,/\.relystra-free-report\{[^}]*overflow:hidden/);
  assert.match(globalCss,/a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible\{outline:3px solid var\(--accent\)/);
});

test('the controlled Moon Wax browser fixture remains populated, semantic, and history-aware',()=>{
  const html=source('qa/workflow-routing-browser/index.html'),fixture=source('qa/workflow-routing-browser/fixture.js'),frame=source('qa/workflow-routing-browser/responsive-frame.html');
  assert.match(html,/<h2>Moon Wax Co\. · Workflow architecture<\/h2>/);
  assert.doesNotMatch(html,/qa-context[^]*?<h1>/);
  for(const marker of ['Discovery Call Transcript','Owner Operations Notes','pushState','replaceState','popstate','company','qa-company','project','qa-engagement'])assert.match(fixture,new RegExp(marker.replaceAll('.','\\.')));
  assert.match(html,/RELYSTRA_QA_ERRORS/);
  for(const width of ['320','1440'])assert.match(frame,new RegExp(width));
  assert.match(frame,/section=.*free-diagnosis/);
});

test('production shells restore direct URLs and browser history without changing workspace identity',()=>{
  for(const file of ['portal-client-shell-v2.js','portal-admin-journey.js']){
    const text=source(file);
    assert.match(text,/new URL\(location\.href\)\.searchParams\.get\('project'\)/);
    assert.match(text,/workspaceUrl\(location\.href,state\.companyId/);
    assert.match(text,/pushState/);
    assert.match(text,/popstate/);
    assert.match(text,/historyMode:'none'/);
  }
});

test('the isolated client role fixture boots the same Step 5 owner as production',()=>{
  const fixture=source('qa/delivery-browser/fixture.js');
  assert.match(fixture,/portal-action-processing-engine\.css/);
  assert.match(fixture,/await import\('\/portal-action-processing-engine\.js'\)/);
  assert.ok(fixture.indexOf("await import('/portal-action-processing-engine.js')")<fixture.indexOf("await import('/portal-client-shell-v2.js')"));
});
