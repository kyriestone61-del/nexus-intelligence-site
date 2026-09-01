import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm';

const URL='https://dmdgkjksouhhsuojthav.supabase.co';
const KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';
const sb=createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let companies=[],companyId=null;

function destination(mode,id){if(mode==='operations')return `/operations?company=${encodeURIComponent(id||'')}`;return `/portal?view_mode=${mode}&company=${encodeURIComponent(id||'')}`}
function currentCompany(){return companies.find(x=>x.id===companyId)||null}
function switcherMarkup(){const company=currentCompany();return `<summary aria-label="Switch Nexus perspective"><span class="perspective-label">View as</span><b>Operations</b><span class="perspective-client">${esc(company?.name||'Select client')}</span></summary><div class="nexus-perspective-menu"><div class="perspective-account"><label for="nexusPerspectiveCompany">Client account</label><select id="nexusPerspectiveCompany">${companies.map(c=>`<option value="${esc(c.id)}" ${c.id===companyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="nexus-perspective-options"><button class="nexus-perspective-option" data-perspective="admin" type="button"><span><b>Admin</b><small>Founder controls, diagnosis, approvals, revenue and configuration.</small></span><i>›</i></button><button class="nexus-perspective-option active" data-perspective="operations" type="button"><span><b>Operations</b><small>Delivery, QA, agents, workflows, health and operating reviews.</small></span><i>✓</i></button><button class="nexus-perspective-option" data-perspective="client" type="button"><span><b>Client View</b><small>Read-only preview of what the selected client can see.</small></span><i>›</i></button></div><p class="nexus-perspective-note">Platform-wide health stays visible here; client operating pressure is scoped to the selected account.</p></div>`}

function mountSwitcher(){
  const topbar=document.querySelector('.ops-native-topbar');if(!topbar)return;
  topbar.querySelector('a.btn[href="/portal"]')?.setAttribute('hidden','');
  let node=document.getElementById('nexusPerspectiveSwitcher');if(!node){node=document.createElement('details');node.id='nexusPerspectiveSwitcher';node.className='nexus-perspective-switcher';const health=document.getElementById('sourceHealth');health?.after(node)}
  node.innerHTML=switcherMarkup();
  node.querySelector('#nexusPerspectiveCompany')?.addEventListener('change',event=>location.assign(destination('operations',event.target.value)));
  node.querySelectorAll('[data-perspective]').forEach(button=>button.addEventListener('click',()=>location.assign(destination(button.dataset.perspective,companyId))));
}

async function countRows(table,configure){let q=sb.from(table).select('id',{count:'exact',head:true}).eq('company_id',companyId);if(configure)q=configure(q);const {count,error}=await q;if(error)throw error;return count||0}
async function loadContext(){
  const [projects,tasks,approvals,requests,metrics]=await Promise.all([
    countRows('nexus_projects',q=>q.in('status',['planning','active'])),
    countRows('nexus_tasks',q=>q.not('status','in','("done","completed","not_applicable")')),
    countRows('nexus_approval_chains',q=>q.in('status',['pending','changes_requested','draft'])),
    countRows('nexus_client_requests',q=>q.not('status','in','("complete","declined")')),
    countRows('nexus_metrics')
  ]);
  return {projects,tasks,approvals,requests,metrics};
}
function renderContext(stats){
  const main=document.querySelector('.ops-native-main');if(!main)return;let panel=document.getElementById('nexusOpsClientContext');if(!panel){panel=document.createElement('section');panel.id='nexusOpsClientContext';panel.className='nexus-ops-client-context';main.prepend(panel)}
  const company=currentCompany();panel.innerHTML=`<div class="nexus-ops-client-context-head"><div><div class="eyebrow">Selected client operating context</div><h2>${esc(company?.name||'Client')}</h2></div><span class="ops-chip good">Scoped client view</span></div><div class="ops-client-stats"><div><b>${stats.projects}</b><span>Active / planning projects</span></div><div><b>${stats.tasks}</b><span>Open actions</span></div><div><b>${stats.approvals}</b><span>Decision chains</span></div><div><b>${stats.requests}</b><span>Open client requests</span></div><div><b>${stats.metrics}</b><span>Tracked metrics</span></div></div>`;
  const title=document.querySelector('.ops-native-title span');if(title)title.textContent=`Founder Control Plane · ${company?.name||'Selected client'}`;
}

async function init(){
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session?.user)return;
    const {data:admin,error:adminError}=await sb.rpc('nexus_is_platform_admin');if(adminError||admin!==true)return;
    const {data,error}=await sb.from('nexus_companies').select('id,name,industry,website,created_at').order('created_at',{ascending:false});if(error)throw error;companies=data||[];if(!companies.length)return;
    const requested=new URLSearchParams(location.search).get('company');companyId=companies.some(c=>c.id===requested)?requested:companies[0].id;
    if(requested!==companyId){const u=new URL(location.href);u.searchParams.set('company',companyId);history.replaceState(null,'',u.pathname+u.search)}
    mountSwitcher();renderContext(await loadContext());
  }catch(error){console.error('Operations perspective switcher failed',error)}
}

init();
