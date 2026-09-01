const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {state}=portal;

const isPhone=()=>matchMedia('(max-width:760px)').matches;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mode=()=>state.viewMode==='client'?'client':'admin';
const destination=id=>`/portal?view_mode=${mode()}&company=${encodeURIComponent(id)}`;

function ensureClientSwitcher(){
  const topbar=document.querySelector('.topbar');
  if(!topbar||!state.platformAdmin)return;
  let wrap=document.getElementById('nexusMobileClientSwitcher');
  if(!wrap){
    wrap=document.createElement('label');
    wrap.id='nexusMobileClientSwitcher';
    wrap.className='nexus-mobile-client-switcher';
    const select=document.createElement('select');
    select.id='nexusMobileClientSelect';
    select.setAttribute('aria-label','Switch client company');
    select.addEventListener('change',event=>{const id=event.target.value;if(id&&id!==state.companyId)location.assign(destination(id))});
    wrap.innerHTML='<span>Client</span>';
    wrap.appendChild(select);
    const perspective=document.getElementById('nexusPerspectiveSwitcher');
    if(perspective)topbar.insertBefore(wrap,perspective);else topbar.appendChild(wrap);
  }
  const select=wrap.querySelector('select');
  const companies=state.companies||[];
  const signature=companies.map(c=>`${c.id}:${c.name}`).join('|');
  if(select.dataset.signature!==signature){
    select.dataset.signature=signature;
    select.innerHTML=companies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  }
  if(state.companyId)select.value=state.companyId;
}

function cleanMobileChrome(){
  document.body.classList.toggle('nexus-mobile-admin-clean',isPhone()&&!!state.platformAdmin);
  document.getElementById('nexusMobileCompanyLabel')?.remove();
  const perspective=document.getElementById('nexusPerspectiveSwitcher');
  if(perspective){
    const summary=perspective.querySelector(':scope>summary');
    if(summary)summary.setAttribute('aria-label',`View mode: ${state.viewMode==='client'?'Client View':'Admin'}`);
  }
  ensureClientSwitcher();
}

cleanMobileChrome();
window.addEventListener('resize',cleanMobileChrome,{passive:true});
new MutationObserver(()=>cleanMobileChrome()).observe(document.getElementById('portalApp')||document.body,{childList:true,subtree:true});

window.NexusMobileAdminCleanup={refresh:cleanMobileChrome};
