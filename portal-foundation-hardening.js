const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let memoryBusy=false;
let engagementBusy=false;

function activeProject(){
  const explicit=state.activeProjectId&&state.projects?.find(p=>p.id===state.activeProjectId);
  if(explicit)return explicit;
  const open=(state.projects||[]).filter(p=>!['complete','cancelled'].includes(String(p.status||'').toLowerCase()));
  return open.length===1?open[0]:null;
}
portal.activeProject=activeProject;

async function syncActiveEngagement(){
  if(engagementBusy||!state.user||!state.companyId)return null;
  engagementBusy=true;
  try{
    const {data,error}=await sb.from('nexus_active_engagements').select('project_id').eq('company_id',state.companyId).maybeSingle();
    if(error){
      // Backward-compatible during staged deployment before the migration is applied.
      if(!/does not exist|schema cache/i.test(String(error.message||'')))console.error('Active engagement lookup failed',error);
      return activeProject();
    }
    state.activeProjectId=data?.project_id||null;
    const project=activeProject();
    if(project&&state.projects?.[0]?.id!==project.id){
      state.projects=[project,...state.projects.filter(p=>p.id!==project.id)];
      const projectBox=document.getElementById('projectBox');
      if(projectBox)projectBox.innerHTML=`<span class="pill">${esc(project.status)}</span><h3>${esc(project.name)}</h3><p class="small">${esc(project.summary||project.service_type||'Nexus engagement workspace')}</p>`;
    }
    if(!project&&(state.projects||[]).filter(p=>!['complete','cancelled'].includes(String(p.status||'').toLowerCase())).length>1){
      console.error('Nexus active engagement is ambiguous for the selected company.');
      toast?.('This client has multiple open projects. Select the active engagement before continuing.');
    }
    return project;
  }finally{engagementBusy=false}
}
portal.syncActiveEngagement=syncActiveEngagement;

async function renderClientMemory(){
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

function scheduleMemory(){setTimeout(renderClientMemory,0)}
const memoryObserver=new MutationObserver(()=>{
  if(state.admin)return;
  const box=document.getElementById('opsMemoryView');
  if(box&&!box.querySelector('[data-nexus-client-memory]'))scheduleMemory();
});
memoryObserver.observe(document.body,{childList:true,subtree:true});

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
    if(/function|schema cache|does not exist/i.test(message)){
      toast?.('Workspace activation is updating. Refresh in a moment and try again.');
    }else toast?.(message);
  }finally{if(button?.isConnected){button.disabled=false;button.textContent='Activate workspace →'}}
},true);

document.getElementById('companySelect')?.addEventListener('change',()=>setTimeout(async()=>{await syncActiveEngagement();scheduleMemory()},180));
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(syncActiveEngagement,100));
for(const ms of [0,180,600])setTimeout(async()=>{await syncActiveEngagement();scheduleMemory()},ms);

window.NexusFoundationHardening={activeProject,syncActiveEngagement,renderClientMemory};
