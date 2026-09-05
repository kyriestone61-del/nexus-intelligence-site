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
