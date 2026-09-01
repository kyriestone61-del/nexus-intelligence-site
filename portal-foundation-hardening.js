const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let memoryBusy=false,memoryScheduled=false,engagementBusy=false;
const terminalProject=p=>['complete','cancelled'].includes(String(p?.status||'').toLowerCase());

function ensureMobileHardening(){
  if(document.getElementById('nexusMobileHardening'))return;
  const link=document.createElement('link');
  link.id='nexusMobileHardening';
  link.rel='stylesheet';
  link.href='/portal-mobile-hardening.css?v=20260901-mobile1';
  document.head.appendChild(link);
}
ensureMobileHardening();

function activateInbox(button){
  const section=document.getElementById('section-notifications');
  if(!section)return toast?.('Inbox is unavailable in this workspace.');
  document.querySelectorAll('.section').forEach(node=>node.classList.toggle('active',node===section));
  document.querySelectorAll('.side-nav button').forEach(node=>node.classList.toggle('active',node===button||node.dataset.section==='notifications'));
  window.scrollTo({top:0,left:0,behavior:'auto'});
}
function normalizeInbox(){
  const section=document.getElementById('section-notifications');
  const unifiedInboxReady=!!document.getElementById('nexusInboxRoot')||!!section?.querySelector('.nexus-inbox-controls');
  if(section&&!unifiedInboxReady){
    const heading=section.querySelector('h1');
    if(heading&&heading.textContent!=='Inbox')heading.textContent='Inbox';
    const eyebrow=section.querySelector('.eyebrow');
    if(eyebrow&&eyebrow.textContent!=='Messages & alerts')eyebrow.textContent='Messages & alerts';
    const copy=section.querySelector('p.small');
    const inboxCopy='See client updates, report notifications, questions, answers, and other items that need your attention.';
    if(copy&&copy.textContent!==inboxCopy)copy.textContent=inboxCopy;
  }
  const nav=document.querySelector('.side-nav');
  if(!nav)return;
  let button=nav.querySelector('button[data-section="notifications"]');
  if(button){
    if(button.textContent!=='Inbox')button.textContent='Inbox';
    button.dataset.nexusInbox='1';
    return;
  }
  if(!section)return;
  button=document.createElement('button');
  button.type='button';
  button.dataset.section='notifications';
  button.dataset.nexusInbox='1';
  button.textContent='Inbox';
  button.addEventListener('click',()=>activateInbox(button));
  const clients=nav.querySelector('button[data-section="clients"]');
  const journey=nav.querySelector('.journey-primary');
  if(clients)clients.after(button);else if(journey)journey.after(button);else nav.prepend(button);
}
const inboxNav=document.querySelector('.side-nav');
const inboxObserver=new MutationObserver(()=>normalizeInbox());
if(inboxNav)inboxObserver.observe(inboxNav,{childList:true,subtree:true});
for(const ms of [0,120,450,1200])setTimeout(normalizeInbox,ms);

// Preserve compatibility with existing modules that still consume state.projects[0], but make
// index 0 a projection of the explicit active-engagement identity instead of insertion order.
let projectRows=Array.isArray(state.projects)?state.projects:[];
Object.defineProperty(state,'projects',{
  configurable:true,
  enumerable:true,
  get(){return projectRows},
  set(next){
    const rows=Array.isArray(next)?[...next]:[];
    const id=state.activeProjectId;
    if(id){
      const idx=rows.findIndex(p=>p?.id===id&&!terminalProject(p));
      if(idx>0){const [active]=rows.splice(idx,1);rows.unshift(active)}
    }
    projectRows=rows;
  }
});
state.projects=projectRows;

function openProjects(){return (state.projects||[]).filter(p=>!terminalProject(p))}
function activeProject(){
  const explicit=state.activeProjectId&&state.projects?.find(p=>p.id===state.activeProjectId);
  if(explicit&&!terminalProject(explicit))return explicit;
  const open=openProjects();
  return open.length===1?open[0]:null;
}
portal.activeProject=activeProject;

// portal-ops still contains an old shared raw Company Memory SELECT. Production RLS correctly
// denies that table to clients, but issuing a known-denied request is noisy and misleading.
// Give only the operations module a client-scoped adapter that turns that obsolete query into a
// local null result. renderClientMemory() below is the single client owner and uses the safe RPC.
function createOpsClient(base){
  if(state.admin)return base;
  const memoryNoop=()=>{
    const query={
      select(){return query},
      eq(){return query},
      maybeSingle(){return Promise.resolve({data:null,error:null})},
      single(){return Promise.resolve({data:null,error:null})}
    };
    return query;
  };
  return new Proxy(base,{
    get(target,prop,receiver){
      if(prop==='from')return table=>table==='nexus_company_memory'?memoryNoop():target.from(table);
      const value=Reflect.get(target,prop,receiver);
      return typeof value==='function'?value.bind(target):value;
    }
  });
}
const opsClient=createOpsClient(sb);

async function syncActiveEngagement(){
  if(engagementBusy||!state.user||!state.companyId)return activeProject();
  engagementBusy=true;
  try{
    const {data,error}=await sb.from('nexus_active_engagements').select('project_id').eq('company_id',state.companyId).maybeSingle();
    if(error){
      if(!/does not exist|schema cache/i.test(String(error.message||'')))console.error('Active engagement lookup failed',error);
      return activeProject();
    }
    state.activeProjectId=data?.project_id||null;
    state.projects=[...(state.projects||[])];
    const project=activeProject();
    if(project){
      const projectBox=document.getElementById('projectBox');
      if(projectBox)projectBox.innerHTML=`<span class="pill">${esc(project.status)}</span><h3>${esc(project.name)}</h3><p class="small">${esc(project.summary||project.service_type||'Nexus engagement workspace')}</p>`;
    }
    if(!project&&openProjects().length>1){
      console.error('Nexus active engagement is ambiguous for the selected company.');
      toast?.('This client has multiple open projects. Select the active engagement before continuing.');
    }
    return project;
  }finally{engagementBusy=false}
}
portal.syncActiveEngagement=syncActiveEngagement;

async function renderClientMemory(){
  memoryScheduled=false;
  if(memoryBusy||state.admin||!state.user||!state.companyId)return;
  const box=document.getElementById('opsMemoryView');
  if(!box||box.querySelector('[data-nexus-client-memory]'))return;
  memoryBusy=true;
  try{
    const {data,error}=await sb.rpc('nexus_get_company_memory_client',{p_company_id:state.companyId});
    if(error){
      if(!/does not exist|schema cache/i.test(String(error.message||'')))console.error('Client-safe Company Memory load failed',error);
      return;
    }
    const row=Array.isArray(data)?data[0]:data;
    box.innerHTML=row?`<div data-nexus-client-memory="1" class="ops-grid"><div><div class="small">Goals</div><p>${esc(row.goals||'Not documented yet.')}</p><div class="small">Core systems</div><p>${esc(row.systems||'Not documented yet.')}</p></div><div><div class="small">Company terminology</div><p>${esc(row.terminology||'Not documented yet.')}</p><div class="small">Visibility</div><p>Only client-safe shared context is shown here. Internal Nexus operating notes and decision notes remain private.</p></div></div>`:'<div data-nexus-client-memory="1" class="ops-empty">Shared company context has not been documented yet.</div>';
  }finally{memoryBusy=false}
}
function scheduleMemory(){if(memoryScheduled)return;memoryScheduled=true;setTimeout(renderClientMemory,0)}
const memoryObserver=new MutationObserver(()=>{
  if(state.admin)return;
  const box=document.getElementById('opsMemoryView');
  if(box&&!box.querySelector('[data-nexus-client-memory]'))scheduleMemory();
});
memoryObserver.observe(document.body,{childList:true,subtree:true});

// Intercept the legacy three-write onboarding handler in the capture phase. The server RPC is one
// transaction, so retries cannot strand an orphan company/member/project combination.
const onboard=document.getElementById('onboardForm');
onboard?.addEventListener('submit',async event=>{
  if(!state.user)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const button=event.submitter||onboard.querySelector('button[type="submit"]');
  if(button){button.disabled=true;button.textContent='Activating…'}
  try{
    const name=document.getElementById('onboardCompany')?.value?.trim()||'';
    if(!name)throw new Error('Company name is required.');
    const {data,error}=await sb.rpc('nexus_onboard_company_atomic',{
      p_name:name,
      p_website:document.getElementById('onboardWebsite')?.value?.trim()||null,
      p_industry:document.getElementById('onboardIndustry')?.value?.trim()||null
    });
    if(error)throw error;
    localStorage.removeItem('nexus_pending_company');
    toast?.(data?.created===false?'Existing workspace restored.':'Workspace created. Your preparation checklist is ready.');
    setTimeout(()=>location.reload(),250);
  }catch(error){
    console.error('Atomic Nexus onboarding failed',error);
    const message=String(error?.message||'Workspace setup failed.');
    if(/function|schema cache|does not exist/i.test(message))toast?.('Workspace activation is updating. Refresh in a moment and try again.');
    else toast?.(message);
  }finally{if(button?.isConnected){button.disabled=false;button.textContent='Activate workspace →'}}
},true);

// The base portal still renders a generic status <select>. Stop that legacy direct table update
// before it reaches the target handler. Consequential transitions go through constrained RPCs.
document.addEventListener('change',async event=>{
  const select=event.target?.closest?.('.task-status');
  if(!select)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const task=(state.tasks||[]).find(t=>t.id===select.dataset.id);
  if(!task)return;
  const legacyValue={not_started:'open',waiting_on_client:'open',waiting_on_nexus:'open',ready_for_review:'open',needs_revision:'open',completed:'done',approved:'done',not_applicable:'done'}[task.status]||task.status||'open';
  const requested=select.value;
  select.value=legacyValue;
  if(!state.admin){toast?.('Use the action controls to submit work or request the next step.');return}
  const mapped=requested==='done'?'completed':requested;
  if(!['in_progress','completed'].includes(mapped)){toast?.('Use the structured action controls for blocked or review states.');return}
  try{
    const {error}=await sb.rpc('nexus_admin_set_task_status',{p_task_id:task.id,p_status:mapped,p_note:null});
    if(error)throw error;
    toast?.(mapped==='completed'?'Action completed.':'Action started.');
    await portal.workspace();
  }catch(error){console.error('Constrained task transition failed',error);toast?.(error?.message||'Action status could not be updated.')}
},true);

const companySelect=document.getElementById('companySelect');
companySelect?.addEventListener('change',()=>setTimeout(async()=>{
  state.activeProjectId=null;
  const before=state.projects?.[0]?.id||null;
  const project=await syncActiveEngagement();
  // Re-run the base workspace only when canonical ordering changed so project-scoped preparation
  // data is reloaded against the explicit active project.
  if(project&&before&&before!==project.id)await portal.workspace();
  scheduleMemory();
  normalizeInbox();
},180));

window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(syncActiveEngagement,100));
for(const ms of [0,180,600])setTimeout(async()=>{
  const before=state.projects?.[0]?.id||null;
  const project=await syncActiveEngagement();
  if(ms===180&&project&&before&&before!==project.id)await portal.workspace();
  scheduleMemory();
  normalizeInbox();
},ms);

window.NexusFoundationHardening={activeProject,syncActiveEngagement,renderClientMemory,opsClient,terminalProject,normalizeInbox,activateInbox};
