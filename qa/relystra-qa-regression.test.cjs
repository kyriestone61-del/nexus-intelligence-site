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
