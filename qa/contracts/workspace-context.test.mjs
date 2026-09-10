import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {selectActiveProject, workspaceUrl, companyPreparationQuery, workspaceSourceDiagnosisId, diagnosisPreparationProjectIds, preparationDocuments} from '../../portal-workspace-context.js';
import {createStateController, createLatestRequestController} from '../../portal-runtime-core.js';

test('paid package default is latest activation, with an explicit open selection taking precedence',()=>{
  const projects=[
    {id:'old',company_id:'a',status:'active',paid_at:'2026-09-01',activated_at:'2026-09-01'},
    {id:'new',company_id:'a',status:'active',paid_at:'2026-09-02',activated_at:'2026-09-05'},
    {id:'closed',company_id:'a',status:'completed',paid_at:'2026-09-06',activated_at:'2026-09-06'},
    {id:'foreign',company_id:'b',status:'active',paid_at:'2026-09-06',activated_at:'2026-09-06'},
  ];
  assert.equal(selectActiveProject(projects,'a').id,'new');
  assert.equal(selectActiveProject(projects,'a','old').id,'old');
  assert.equal(selectActiveProject(projects,'a','foreign').id,'new');
  assert.equal(selectActiveProject(projects,'a','closed').id,'new');
  assert.equal(selectActiveProject([],'moon'),null);
});

test('changing company clears object links and missing project context',()=>{
  const url=workspaceUrl('https://example.test/portal?company=old&project=old-project&task=old-task&view=inbox','moon');
  assert.equal(url,'/portal?company=moon&view=inbox');
  assert.equal(workspaceUrl('https://example.test/portal?company=moon&task=owned','moon','paid'),'/portal?company=moon&task=owned&project=paid');
});

test('preparation includes company evidence and the selected project, excluding unrelated projects',()=>{
  const calls=[];
  const query={is(...args){calls.push(['is',...args]);return this},or(...args){calls.push(['or',...args]);return this}};
  companyPreparationQuery(query);
  companyPreparationQuery(query,'paid');
  companyPreparationQuery(query,'paid',['discovery','diagnosis','paid']);
  assert.deepEqual(calls,[['is','project_id',null],['or','project_id.eq.paid'],['or','project_id.eq.paid,project_id.eq.discovery,project_id.eq.diagnosis']]);
});

test('paid workspace resolves its canonical diagnosis and exact retained evidence',()=>{
  const state={companyId:'blue',activeProjectId:'paid',projects:[
    {id:'paid',company_id:'blue',context_diagnosis_run_id:'run-1'},
    {id:'pilot',company_id:'blue',source_diagnosis_run_id:'run-1'},
  ],docs:[
    {id:'transcript',company_id:'blue',project_id:'discovery'},
    {id:'supporting',company_id:'blue',project_id:'discovery'},
    {id:'package',company_id:'blue',project_id:'paid'},
    {id:'unrelated',company_id:'blue',project_id:'other'},
    {id:'unlinked-preparation',company_id:'blue',project_id:null},
    {id:'foreign',company_id:'other',project_id:null},
  ]};
  const run={id:'run-1',project_id:'pilot',analysis_packet:{project:{id:'discovery'}},transcript_document_id:'transcript',supporting_document_ids:['supporting']};
  assert.equal(workspaceSourceDiagnosisId(state,'paid'),'run-1');
  assert.deepEqual(diagnosisPreparationProjectIds(run,'paid'),['paid','pilot','discovery']);
  assert.deepEqual(preparationDocuments(state,'paid',run).map(row=>row.id),['transcript','supporting','package']);
  state.discoveryEvidence={company_id:'blue',project_id:'paid',documents:[{id:'transcript',state:'parsed'}]};
  assert.deepEqual(preparationDocuments(state,'paid').map(row=>row.id),['transcript'],'current evidence counts use the server scope');
});

const source=fs.readFileSync(new URL('../../portal-client.js',import.meta.url),'utf8');
const workspaceSource=source.slice(source.indexOf('async function workspace('),source.indexOf('\nfunction taskRow('));

test('a slow previous workspace never overwrites a newer company, pointer, URL or render',async()=>{
  let unblock;
  const slow=new Promise(resolve=>{unblock=resolve});
  const controller=createStateController({user:{id:'admin'},companyId:'old',activeProjectId:'old-project',companies:[{id:'old'},{id:'moon'}]});
  const urls=[],renders=[],events=[];
  const sb={from(table){let cid;const q={select(){return q},eq(key,value){if(key==='company_id')cid=value;return q},order(){return q},limit(){return q},maybeSingle(){return q},then(resolve,reject){return (async()=>{
    if(cid==='old')await slow;
    const data=table==='nexus_active_engagements'?(cid==='old'?{project_id:'old-project'}:null):table==='nexus_projects'&&cid==='old'?[{id:'old-project',company_id:'old',status:'active'}]:[];
    return {data,error:null};
  })().then(resolve,reject)}};return q}};
  const ctx=vm.createContext({URL,sb,state:controller.state,stateController:controller,workspaceRequests:createLatestRequestController(),selectActiveProject,workspaceUrl,location:{href:'https://example.test/portal?company=old&task=old-task'},history:{state:null,replaceState(_,__,url){urls.push(url)}},queryData:r=>r.data||[],fetchDataRequirements:async()=>[],fetchNotificationPrefs:async()=>null,fetchEmailStatus:async()=>false,$:()=>null,render:()=>renders.push(controller.state.companyId),esc:String,window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}}});
  vm.runInContext(workspaceSource+';globalThis.load=workspace;',ctx);
  const previous=ctx.load('old');
  assert.equal(await ctx.load('moon'),true);
  unblock();
  assert.equal(await previous,false);
  assert.equal(controller.state.companyId,'moon');
  assert.equal(controller.state.activeProjectId,null);
  assert.deepEqual([...controller.state.projects],[]);
  assert.deepEqual(renders,['moon']);
  assert.deepEqual(urls,['/portal?company=moon']);
  assert.equal(events.length,1);
  assert.equal(events[0].detail.companyId,'moon');
});

test('administrator startup resolves relative workspace links against the current origin',async()=>{
  const source=fs.readFileSync('portal-admin-journey.js','utf8');
  const navigate=source.match(/async function navigate\(target\)\{[\s\S]*?\n\}/)[0],urls=[];
  const ctx=vm.createContext({journeyGate:()=>null,store:{value:{}},URL,workspaceUrl,navigationSequence:0,active:null,header:{},state:{companyId:'moon'},viewedProject:null,
    location:new URL('https://example.test/portal?company=old&task=old-task'),document:{querySelectorAll:()=>[]},
    activate:()=>{},renderOverview:()=>{},renderHeader:()=>{},window:{scrollTo:()=>{}},history:{replaceState:(_a,_b,url)=>urls.push(url)}});
  await vm.runInContext(navigate+"\nnavigate('overview')",ctx);
  assert.deepEqual(urls,['/portal?company=moon&section=overview']);
  assert.equal(ctx.header.hidden,false);
});

test('workspace reload retains explicit completed package links without changing the active pointer',async()=>{
  const projects=[{id:'closed',company_id:'moon',status:'complete'},{id:'active',company_id:'moon',status:'active',paid_at:'2026-09-01',activated_at:'2026-09-01'}];
  for(const [href,expected] of [['https://example.test/portal?company=moon&project=closed','closed'],['https://example.test/portal?company=other&project=closed','active']]){
    const controller=createStateController({user:{id:'admin'},companyId:'moon',companies:[{id:'moon'}]}),urls=[];
    const sb={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle(){return q},then(resolve){return Promise.resolve({data:table==='nexus_projects'?[...projects]:table==='nexus_active_engagements'?{project_id:'active'}:[],error:null}).then(resolve)}};return q}};
    const ctx=vm.createContext({URL,sb,state:controller.state,stateController:controller,workspaceRequests:createLatestRequestController(),selectActiveProject,workspaceUrl,location:{href},history:{state:null,replaceState(_,__,url){urls.push(url)}},queryData:r=>r.data||[],fetchDataRequirements:async()=>[],fetchNotificationPrefs:async()=>null,fetchEmailStatus:async()=>false,$:()=>null,render:()=>{},esc:String,window:{dispatchEvent:()=>{}},CustomEvent:class{}});
    await vm.runInContext(workspaceSource+"\nworkspace('moon')",ctx);
    assert.equal(controller.state.activeProjectId,expected);
    assert.ok(urls[0].includes(`project=${expected}`));
  }
});
