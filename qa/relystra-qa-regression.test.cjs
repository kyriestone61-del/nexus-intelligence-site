const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(process.env.RELYSTRA_SOURCE||path.join(__dirname,'..'));
const source=name=>fs.readFileSync(path.join(root,name),'utf8');

function harness({admin=true,viewMode='admin'}={}){
  const events=new Map(),timers=[],errors=[];
  const node=()=>({textContent:'',innerHTML:'',dataset:{},attrs:{},
    classList:{toggle(){},add(){},remove(){}},
    setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]??null},
    querySelectorAll(){return []}});
  const button=node(),heading=node(),eyebrow=node(),copy=node(),inbox=node();
  button.textContent='Inbox';
  const section={querySelector:s=>({'h1':heading,'.eyebrow':eyebrow,'p.small':copy,'.nexus-inbox-controls':{}}[s]||null)};
  const nav={querySelector:s=>s==='button[data-section="notifications"]'?button:null};
  const ids={'section-notifications':section,nexusInboxRoot:inbox,nexusMobileHardening:{},approvalDecisionModal:{},newApprovalChainModal:{}};
  const state={admin,viewMode,user:{id:'synthetic'},companyId:'synthetic-company'};
  let rpcCalls=0,rpc=async()=>({data:[]});
  const window={NexusPortal:{state,$:id=>ids[id]||null,sb:{rpc(...args){rpcCalls++;return rpc(...args)}}},
    addEventListener(name,fn){events.set(name,fn)}};
  const document={getElementById:id=>ids[id]||null,
    querySelector:s=>s==='.side-nav'?nav:s==='.side-nav button[data-section="notifications"]'?button:null,
    querySelectorAll:()=>[],addEventListener(){}};
  const ctx=vm.createContext({window,document,console:{error:(...args)=>errors.push(args),warn(){}},
    location:{search:'',pathname:'/portal'},history:{replaceState(){}},URLSearchParams,
    setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){}});
  // Evaluate both actual module implementations in independent lexical scopes,
  // sharing one DOM and portal state, as they do in the browser.
  const foundation=source('portal-foundation-hardening.js').split('const inboxNav=')[0];
  vm.runInContext(`(()=>{${foundation}\nwindow.normalizeFoundationInbox=normalizeInbox;})()`,ctx);
  vm.runInContext(`(()=>{${source('portal-approval-inbox.js')}\nwindow.ensureApprovalShell=ensureShell;})()`,ctx);
  return {window,state,button,heading,inbox,events,timers,errors,setRpc(fn){rpc=fn},get calls(){return rpcCalls}};
}

for(const [admin,viewMode,label] of [[true,'admin','Decisions'],[false,'client','Inbox'],[true,'client','Inbox']]){
  test(`foundation and approval renderers agree for admin=${admin}, mode=${viewMode}`,()=>{
    const h=harness({admin,viewMode});
    for(let i=0;i<4;i++){
      h.window.ensureApprovalShell();
      h.window.normalizeFoundationInbox();
      assert.equal(h.button.textContent,label);
      assert.equal(h.button.attrs['aria-label'],label);
      assert.equal(h.heading.textContent,label);
    }
  });
}

test('page departure suppresses an in-flight navigation network failure',async()=>{
  const h=harness();let finish;
  h.setRpc(()=>new Promise(resolve=>{finish=resolve}));
  const loading=h.window.NexusApprovalInbox.loadInbox(true);
  h.events.get('pagehide')?.({});
  finish({error:{message:'TypeError: Load failed'}});
  await loading;
  assert.equal(h.errors.length,0);
  assert.equal(h.inbox.innerHTML,'');
});

test('navigation start suppresses an interrupted inbox request before pagehide',async()=>{
  const h=harness();let finish;
  h.setRpc(()=>new Promise(resolve=>{finish=resolve}));
  const loading=h.window.NexusApprovalInbox.loadInbox(true);
  h.events.get('beforeunload')?.({});
  finish({error:{message:'TypeError: Load failed'}});await loading;
  assert.equal(h.errors.length,0);assert.equal(h.inbox.innerHTML,'');
  await h.window.NexusApprovalInbox.loadInbox(true);assert.equal(h.calls,1);
});

test('page departure discards a late successful inbox response',async()=>{
  const h=harness();let finish;
  h.setRpc(()=>new Promise(resolve=>{finish=resolve}));
  const loading=h.window.NexusApprovalInbox.loadInbox(true);
  h.events.get('pagehide')?.({});
  finish({data:[]});await loading;
  assert.equal(h.inbox.innerHTML,'');
});

test('no inbox requests start after departure; back-forward restoration resumes requests',async()=>{
  const h=harness();h.events.get('pagehide')?.({});
  await h.window.NexusApprovalInbox.loadInbox(true);
  assert.equal(h.calls,0);
  h.events.get('pageshow')?.({persisted:true});
  await h.window.NexusApprovalInbox.loadInbox(true);
  assert.equal(h.calls,1);
});

test('a real network error on the current page remains visible and logged',async()=>{
  const h=harness();h.setRpc(async()=>({error:{message:'TypeError: Load failed'}}));
  await h.window.NexusApprovalInbox.loadInbox(true);
  assert.equal(h.errors.length,1);
  assert.match(h.inbox.innerHTML,/Inbox could not load/);
});

test('both readiness helpers accept a loaded ordinary client without perspective metadata',()=>{
  for(const file of ['baseline-workflow.spec.mjs','control-room-reconcile.spec.mjs']){
    const code=source(`qa/playwright/tests/${file}`).split('expect.poll(()=>page.evaluate(()=>{')[1].split('}),{timeout')[0];
    const context={window:{__nexusPortalBooting:false,NexusPortal:{state:{user:{id:'client'},admin:false}}},document:{getElementById:()=>({}),querySelector:()=>null,body:{classList:{contains:()=>false}}}};
    assert.equal(vm.runInNewContext(`(()=>{${code}})()`,context),true);
    context.window.__nexusPortalBooting=true;
    assert.equal(vm.runInNewContext(`(()=>{${code}})()`,context),false);
    context.window.__nexusPortalBooting=false;context.document.getElementById=()=>null;
    assert.equal(vm.runInNewContext(`(()=>{${code}})()`,context),false);
  }
});

test('legacy router leaves the production primary navigation and intake placement intact',()=>{
  let moves=0;
  const intake={textContent:'Diagnosis',classList:{add(){}},setAttribute(){}},journey={insertAdjacentElement(){moves++}};
  const nav={querySelector:s=>s==='.journey-primary'?journey:s==='button[data-section="intake"]'?intake:s==='.nexus-production-primary-nav'?{}:null};
  const window={NexusPortal:{state:{admin:true}},addEventListener(){}};
  vm.runInNewContext(source('portal-admin-journey-router.js'),{window,document:{querySelector:()=>nav,addEventListener(){}},setTimeout(){}});
  window.NexusAdminJourneyRouter.promoteCoreNav();
  assert.equal(moves,0);assert.equal(intake.textContent,'Diagnosis');
});

test('opening a resolution plan dismisses its underlying diagnosis review',async()=>{
  const classes=new Set(['open','show']);const review={classList:{remove:(...xs)=>xs.forEach(x=>classes.delete(x))},setAttribute(k,v){this[k]=v}};
  const bodyClasses=new Set(['diagnosis-review-open']);
  const modal={querySelector:()=>({innerHTML:''}),classList:{add(){}},setAttribute(){}};
  const code=source('portal-resolution-plan.js').split('async function open(runId){')[1].split('async function setSelection')[0];
  const run=vm.runInNewContext(`async function open(runId){${code}\nopen`,{document:{getElementById:()=>review,body:{classList:{remove:k=>bodyClasses.delete(k)}}},ensureModal:()=>modal,load:async()=>({}),render(){},esc:x=>x});
  await run('synthetic-run');
  assert.equal(classes.size,0);assert.equal(review['aria-hidden'],'true');assert.equal(bodyClasses.size,0);
});

test('Home opens before refresh and a late refresh does not pull the user away from another route',async()=>{
  let finish,renders=0,scrolls=0;
  const section={classList:{active:false,toggle(_k,v){this.active=v},contains(){return this.active}}};
  const pending=new Promise(resolve=>{finish=resolve});
  const code=source('portal-admin-journey.js').split('async function showJourney(){')[1].split('function activateSection')[0];
  const run=vm.runInNewContext(`async function showJourney(){${code}\nshowJourney`,{state:{admin:true},ensureSection:()=>section,loadJourneyData:()=>pending,document:{querySelectorAll:s=>s==='.section'?[section]:[]},renderJourney(){renders++},window:{scrollTo(){scrolls++}}});
  const loading=run();
  assert.equal(section.classList.active,true);assert.equal(renders,1);assert.equal(scrolls,1);
  section.classList.active=false;finish();await loading;
  assert.equal(section.classList.active,false);assert.equal(renders,1);
});

test('task controls remain disabled through saving and replacement-card refresh',async()=>{
  const task={id:'qa-task',assignee:'nexus',status:'in_progress'};
  let finish;const refresh=new Promise(resolve=>{finish=resolve});
  const control=()=>({disabled:false,textContent:'Complete',isConnected:true});let controls=[control()];
  const actions={querySelector:()=>({}),querySelectorAll:()=>[]};
  const card={dataset:{taskId:task.id},querySelector:()=>actions,querySelectorAll:()=>controls,classList:{toggle(){}},style:{removeProperty(){}}};
  const window={NexusPortal:{state:{admin:true,tasks:[task]},sb:{rpc:async()=>({})},toast(){},workspace:()=>refresh}};
  const code=source('portal-journey-task-guard.js').split("document.addEventListener('click'")[0];
  vm.runInNewContext(`${code}\nwindow.guard={transition,enhance};`,{window,document:{querySelectorAll:()=>[card]},requestAnimationFrame:fn=>fn(),console});
  const loading=window.guard.transition(task,'in_progress',null,controls[0]);
  assert.equal(controls[0].disabled,true);
  await Promise.resolve();
  controls=[control()];window.guard.enhance();
  assert.equal(controls[0].disabled,true,'a newly rendered control must not accept a second action during refresh');
  finish();await loading;
  assert.equal(controls[0].disabled,false);
});

test('workflow reconciliation reaches a fixed point instead of scheduling itself forever',()=>{
  let writes=0,html='',label='Open';
  const flow={get innerHTML(){return html},set innerHTML(v){html=v;writes++}};
  const cta={get textContent(){return label},set textContent(v){label=v;writes++}};
  const button={dataset:{jump:'tasks'},querySelector:s=>s===':scope > span:last-child'?cta:null};
  const intake={querySelector:()=>flow,querySelectorAll:()=>[]};
  const document={getElementById:()=>intake,querySelectorAll:()=>[button]};
  const src=source('portal-workflow-cohesion.js');
  const labels='function labelNeedsAction(){'+src.split('function labelNeedsAction(){')[1].split('function scrollToNamedRecord')[0];
  const steps='function relabelIntakeSteps(){'+src.split('function relabelIntakeSteps(){')[1].split('function compactLegacyRequestEditors')[0];
  const run=vm.runInNewContext(`${labels}\n${steps}\n()=>{labelNeedsAction();relabelIntakeSteps()}`,{document,state:{admin:true}});
  run();assert.equal(writes,2);
  for(let i=0;i<10;i++)run();
  assert.equal(writes,2,'observer callbacks must not recreate unchanged text or markup');
});

test('Actions uses the shell route and survives the same activation used by refresh',()=>{
  const src=source('portal-client-shell-v2.js');
  const declaration=src.match(/const ALL_SECTIONS=.*?;/)[0];
  const activate='function activateView(view){'+src.split('function activateView(view){')[1].split('function renderToday')[0];
  let renders=0;
  const nodes=['today','actions'].map(clientView=>({dataset:{clientView},classList:{toggle(_key,v){this.active=v}},setAttribute(){}}));
  const window={scrollTo(){},NexusActionProcessingEngine:{renderClientActions(){renders++}}};
  const document={querySelectorAll:()=>nodes};
  const shell=vm.runInNewContext(`${declaration}\nlet activeView='today';\n${activate}\n({activateView,refresh:()=>activateView(activeView)})`,{window,document,renderToday(){},renderFiles(){},renderImprovement(){},renderReports(){}});
  shell.activateView('actions');shell.refresh();
  assert.equal(nodes[0].classList.active,false);assert.equal(nodes[1].classList.active,true);assert.equal(renders,2);
});


test('client and administrator loaders use the same fresh action-engine cache version',()=>{
  const version=name=>source(name).match(/const ACTION_PROCESSING_BUILD='([^']+)'/)[1];
  assert.equal(version('portal-client-upload-service.js'),version('portal-ux-refinement.js'));
  assert.notEqual(version('portal-client-upload-service.js'),'20260904-action-processing1');
  const workflow=source('.github/workflows/control-room-browser-qa.yml');
  const assets=workflow.match(/assets=\(([^\n]+)\)/)[1].split(/\s+/);
  for(const asset of ['portal-client-upload-service.js','portal-ux-refinement.js','portal-action-processing-engine.js'])assert.ok(assets.includes(asset),`${asset} must match production before authenticated QA`);
});


test('approval labels do not perpetually retrigger their body mutation observer',()=>{
  let callback,writes=0;
  const selectors=['.vnext-release-report','.approve-packet','.approve-step','[data-nexus-release="task"],[data-nexus-release="document request"]'];
  const nodes=new Map(selectors.map(selector=>{let text='Original';return [selector,{get textContent(){return text},set textContent(value){text=value;writes++}}]}));
  const document={addEventListener(){},querySelectorAll:selector=>nodes.has(selector)?[nodes.get(selector)]:[],body:{}};
  const window={NexusPortal:{sb:{},state:{}}};
  vm.runInNewContext(source('portal-approval-bridge.js'),{window,document,MutationObserver:class{constructor(fn){callback=fn}observe(){}}});
  callback();assert.equal(writes,4);
  for(let i=0;i<20;i++)callback();
  assert.equal(writes,4,'unchanged labels must not enqueue another mutation observer delivery');
  assert.equal(nodes.get('.approve-packet').textContent,'Review approval');
});


test('diagnosis events refresh Home data without navigating away from opened work',async()=>{
  const src=source('portal-admin-journey.js');
  const fn='async function refreshJourneyInPlace(){'+src.split('async function refreshJourneyInPlace(){')[1].split('function activateSection')[0];
  let active=true,renders=0,finish;
  const loaded=new Promise(resolve=>finish=resolve);
  const refresh=vm.runInNewContext(`${fn};refreshJourneyInPlace`,{$:()=>({classList:{contains:()=>active}}),loadJourneyData:()=>loaded,renderJourney:()=>renders++});
  const pending=refresh();active=false;finish();await pending;assert.equal(renders,0);
  active=true;await refresh();assert.equal(renders,1);
  assert.ok(src.includes('const refreshDiagnosisJourney=()=>setTimeout(refreshJourneyInPlace,120);'));
});


test('rendered action cards trigger administrator controls after filter replacement',()=>{
  const calls=[],listeners={};
  const window={addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:event=>listeners[event.type]?.(event)};
  const state={admin:true,companyId:'qa-company'};
  const engine=source('portal-action-processing-engine.js');
  const subscription="window.addEventListener('nexus:action-cards-rendered'"+engine.split("window.addEventListener('nexus:action-cards-rendered'")[1].split('if(state.user)')[0];
  vm.runInNewContext(subscription,{window,state,scheduleAdminDecoration:()=>calls.push('decorate')});
  const execution=source('portal-action-execution-v2.js');
  const render='function renderTasks(){'+execution.split('function renderTasks(){')[1].split('async function saveClientNote')[0];
  const run=vm.runInNewContext(`${render};renderTasks`,{window,state,$:()=>({innerHTML:''}),filteredTasks:()=>[],activeView:'my_work',bindCards:()=>calls.push('bind'),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}}});
  run();run();assert.deepEqual(calls,['bind','decorate','bind','decorate']);
  window.dispatchEvent({type:'nexus:action-cards-rendered',detail:{companyId:'another-company'}});assert.equal(calls.length,4);
});


test('Files refresh retains the mounted upload form, selected file, and handlers',()=>{
  let host={};
  const file={name:'selected-evidence.csv'},submit=()=>{};
  const panel={parentElement:{},connected:true,file,submit,classList:{add(){}},querySelector:()=>null,querySelectorAll:()=>[]};
  const root={querySelector:()=>panel.connected&&panel.parentElement===host?panel:null,querySelectorAll:()=>[],set innerHTML(value){if(panel.parentElement===host)panel.connected=false;host={appendChild(node){node.parentElement=host;node.connected=true}}}};
  const document={querySelector:()=>panel.connected?panel:null};
  const src=source('portal-client-shell-v2.js');
  const code='function renderFiles(){'+src.split('function renderFiles(){')[1].split('function openUploadForRequest')[0];
  const render=vm.runInNewContext(`${code}\nrenderFiles`,{$:id=>id==='nexus-client-files'?root:id==='nexusClientUploadHost'?host:null,document,documentRequests:[],state:{docs:[]},arr:x=>x,bindCommon(){},events:{bind(){}}});
  for(let i=0;i<3;i++){
    render();assert.equal(panel.connected,true,'refresh must remount the original live form');
    assert.equal(panel.parentElement,host);assert.equal(panel.file,file);assert.equal(panel.submit,submit);
  }
});
