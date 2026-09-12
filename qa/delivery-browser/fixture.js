const info=await fetch('/qa-fixture-info'+location.search).then(r=>r.json()),role=new URL(location.href).searchParams.get('role')||'admin';
const send=body=>fetch('/qa-db',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,role})}).then(r=>r.json());
function from(table){const body={table,columns:'*',filters:[],order:[]},q={
  select(columns='*'){body.columns=columns;return q},insert(value){body.insert=value;return q},update(value){body.update=value;return q},
  eq(key,value){body.filters.push(['eq',key,value]);return q},neq(key,value){body.filters.push(['neq',key,value]);return q},
  is(key,value){body.filters.push(['is',key,value]);return q},not(key){body.filters.push(['not',key]);return q},
  in(key,value){body.filters.push(['in',key,value]);return q},or(value){body.filters.push(['or',value]);return q},
  order(key,options={}){body.order.push([key,options.ascending!==false]);return q},limit(value){body.limit=value;return q},
  range(start,end){body.offset=start;body.limit=end-start+1;return q},
  single(){body.single=true;return q},maybeSingle(){body.single=true;return q},then(resolve,reject){return send(body).then(resolve,reject)},
};return q}
const state={admin:role==='admin',companyId:info.company,companies:[{id:info.company,name:'Blue Harbor — local delivery fixture'}],docs:[],user:{id:role==='admin'?info.admin:info.client}};
window.NexusPortal={state,sb:{from,rpc:(rpc,args)=>send({rpc,args}),storage:{from:()=>({upload:async(path,file)=>fetch('/qa-discovery-file',{method:'POST',body:JSON.stringify({path,text:await file.text()})}).then(r=>r.json()),remove:async()=>({})})},functions:{invoke:async(name,{body})=>fetch('/qa-discovery-step',{method:'POST',body:JSON.stringify(body)}).then(r=>r.json())}},toast:message=>document.getElementById('fixtureNotice').textContent=message,
  workspace:async()=>{window.dispatchEvent(new CustomEvent('nexus:workspace-ready'));return true}};
for(const b of document.querySelectorAll('[data-section]')){const s=document.createElement('section');s.id='section-'+b.dataset.section;s.className='section';s.textContent=b.textContent+' uses the retained production component; this fixture verifies the new delivery components.';document.querySelector('.main').append(s);b.onclick=()=>document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x===s))}
window.NexusPortal.runtime=(await import('/portal-runtime-core.js')).createPortalRuntime(state,{notify:window.NexusPortal.toast});
if(role==='admin')await import('/portal-admin-journey.js');
else if(new URL(location.href).searchParams.has('shell')){
  // Real client shell/runtime; legacy inbox/context RPC adapters below are fixture-only.
  const {createPortalRuntime}=await import('/portal-runtime-core.js');
  const portal=window.NexusPortal;
  const realFrom=portal.sb.from;portal.sb.from=table=>{if(['nexus_document_requests','nexus_diagnosis_report_releases'].includes(table)){const q={};for(const name of ['select','eq','is','order'])q[name]=()=>q;q.then=resolve=>Promise.resolve({data:[],error:null}).then(resolve);return q}return realFrom(table)};
  portal.runtime=createPortalRuntime(state,{notify:portal.toast});
  const rpc=portal.sb.rpc;portal.sb.rpc=async(name,args)=>{
    if(name==='nexus_get_client_action_context')return {data:[],error:null};
    if(name==='nexus_get_inbox'){
      const result=await portal.sb.from('nexus_notifications').select('*').eq('company_id',info.company);
      return {...result,data:result.data?.map(n=>({...n,kind:'update',related_type:'notification',related_id:n.id,is_unread:!n.read_at}))};
    }
    return rpc(name,args);
  };
  state.projects=(await portal.sb.from('nexus_projects').select('*').eq('company_id',info.company)).data||[];
  state.tasks=(await portal.sb.from('nexus_tasks').select('*').eq('company_id',info.company)).data||[];
  const topbar=document.createElement('header');topbar.className='topbar';document.getElementById('portalApp').before(topbar);
  for(const href of ['/portal-runtime-hardening.css','/portal-client-shell-v2.css','/portal-action-processing-engine.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link)}
  // Match the production client bootstrap: Step 5 is owned by the governed
  // Action engine, so the isolated role fixture must load it before the shell.
  await import('/portal-action-processing-engine.js');
  await import('/portal-client-shell-v2.js');
}
else{
  const {mountPackageDelivery}=await import('/portal-package-delivery.js');
  const main=document.querySelector('.main');main.replaceChildren();const root=document.createElement('section');root.className='section active';main.append(root);
  const component=mountPackageDelivery(root,window.NexusPortal),nav=document.querySelector('.side-nav');nav.replaceChildren();
  for(const section of ['progress','final-package','support']){const b=document.createElement('button');b.textContent=section;b.onclick=()=>component.refresh({projectId:info.project,section});nav.append(b)}
  await component.refresh({projectId:info.project,section:'progress'});
}
