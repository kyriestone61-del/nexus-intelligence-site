const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
if(!state.admin)throw new Error('Commercial access controls are administrator-only.');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let context=null;
let loadedCompanyId=null;
let loading=false;
let queued=false;

function ensureStyles(){
  if(document.getElementById('nexusAdminCommercialAccessStyles'))return;
  const style=document.createElement('style');
  style.id='nexusAdminCommercialAccessStyles';
  style.textContent=`
    .nexus-admin-commercial-access{margin:14px 0;padding:15px;border:1px solid rgba(156,124,255,.2);border-radius:13px;background:rgba(156,124,255,.045)}
    .nexus-admin-commercial-access>summary{cursor:pointer;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;list-style:none}.nexus-admin-commercial-access>summary::-webkit-details-marker{display:none}.nexus-admin-commercial-access>summary h3{margin:3px 0 4px;font-size:17px}.nexus-admin-commercial-access>summary p{margin:0;color:var(--muted,#aaa4ba);font-size:12px;line-height:1.45}
    .nexus-admin-commercial-access-list{display:grid;gap:8px;margin-top:12px}.nexus-admin-commercial-access-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(9,8,15,.3)}.nexus-admin-commercial-access-row b,.nexus-admin-commercial-access-row small{display:block}.nexus-admin-commercial-access-row small{margin-top:4px;color:var(--muted,#aaa4ba);line-height:1.4}.nexus-admin-commercial-access-state{font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:900;color:#cfc5ff;margin-bottom:3px}.nexus-admin-commercial-access-state.active{color:#d9ff72}.nexus-admin-commercial-access-note{margin-top:10px;color:var(--muted,#aaa4ba);font-size:11px;line-height:1.5}
    @media(max-width:720px){.nexus-admin-commercial-access-row{grid-template-columns:1fr}.nexus-admin-commercial-access-row .btn{width:100%}}
  `;
  document.head.appendChild(style);
}

function activeCodes(){return new Set((context?.entitlements||[]).filter(row=>row.status==='active').map(row=>row.offering_code))}
function rowMarkup(offering,codes){
  const active=codes.has(offering.code);
  const canToggle=['find','build','run'].includes(offering.code);
  return `<article class="nexus-admin-commercial-access-row"><div><div class="nexus-admin-commercial-access-state ${active?'active':''}">${active?'Included for client':'Not included'}</div><b>${esc(offering.name)}</b><small>${esc(offering.client_outcome||offering.description||'')}</small></div>${canToggle?`<button type="button" class="btn ${active?'secondary':'primary'}" data-entitlement-code="${esc(offering.code)}" data-entitlement-active="${active?'1':'0'}">${active?'Remove access':'Grant access'}</button>`:''}</article>`;
}
function render(){
  const body=document.getElementById('diagnosisReviewBody');if(!body||!context)return;
  let panel=body.querySelector('.nexus-admin-commercial-access');
  if(!panel){panel=document.createElement('details');panel.className='nexus-admin-commercial-access diagnosis-generated';const editor=body.querySelector('.diagnosis-report-editor');if(editor)editor.after(panel);else body.appendChild(panel)}
  const codes=activeCodes();const offerings=[...(context.offerings||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  panel.innerHTML=`<summary><div><div class="kicker">Client service access</div><h3>What this client qualifies for</h3><p>Control whether Find, Build, or Run is included for this company. Client report recommendations use this access state to distinguish included work from standalone requests.</p></div><span class="pill">${codes.size} active</span></summary><div class="nexus-admin-commercial-access-list">${offerings.map(item=>rowMarkup(item,codes)).join('')}</div><div class="nexus-admin-commercial-access-note"><b>Commercial boundary:</b> granting access records the company’s current Nexus entitlement. It does not charge the client or invent pricing. Standalone solution requests still require approved scope and authoritative pricing before checkout.</div>`;
  panel.querySelectorAll('[data-entitlement-code]').forEach(button=>button.addEventListener('click',async()=>{
    const code=button.dataset.entitlementCode;const active=button.dataset.entitlementActive==='1';const original=button.textContent;button.disabled=true;button.textContent=active?'Removing…':'Granting…';
    try{
      const {error}=await sb.rpc('nexus_set_company_entitlement',{p_company_id:state.companyId,p_offering_code:code,p_status:active?'cancelled':'active',p_scope:{set_from:'diagnosis_review'}});if(error)throw error;
      toast?.(`${code[0].toUpperCase()+code.slice(1)} access ${active?'removed':'granted'}.`);context=null;await load();
    }catch(error){console.error('Nexus commercial entitlement update failed',error);toast?.(error.message||'Client service access could not be updated.');button.disabled=false;button.textContent=original}
  }));
}
async function load(){
  const companyId=state.companyId;if(!companyId||loading)return;
  loading=true;
  try{const {data,error}=await sb.rpc('nexus_client_commercial_context',{p_company_id:companyId});if(error)throw error;context=data||{offerings:[],entitlements:[]};loadedCompanyId=companyId;render()}catch(error){console.error('Admin commercial access context failed',error)}finally{loading=false}
}
function mount(){
  const modal=document.getElementById('diagnosisReviewModal');const body=document.getElementById('diagnosisReviewBody');
  if(!modal?.classList.contains('open')||!body||!body.querySelector('.diagnosis-executive,.diagnosis-review-section .diagnosis-review-item'))return;
  if(loadedCompanyId!==state.companyId){context=null;loadedCompanyId=null}
  if(context)render();else load();
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}

ensureStyles();
const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:company-changed',()=>{context=null;loadedCompanyId=null;schedule()});
window.addEventListener('nexus:diagnosis-changed',schedule);
schedule();

window.NexusAdminCommercialAccess=Object.freeze({refresh:()=>{context=null;loadedCompanyId=null;return load()}});
