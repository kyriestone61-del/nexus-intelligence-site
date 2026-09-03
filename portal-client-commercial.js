const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let context=null;
let releaseRows=[];
let queued=false;
let loading=false;

function ensureStyles(){
  if(document.getElementById('nexusClientCommercialStyles'))return;
  const style=document.createElement('style');
  style.id='nexusClientCommercialStyles';
  style.textContent=`
    .nexus-client-commercial{margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08)}
    .nexus-client-commercial-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.nexus-client-commercial-head h3{margin:4px 0 3px;font-size:17px}.nexus-client-commercial-head p{margin:0;color:var(--nx-muted);font-size:12px;line-height:1.5}
    .nexus-client-commercial-pill{flex:0 0 auto;padding:5px 8px;border:1px solid rgba(217,255,114,.28);border-radius:999px;color:var(--nx-citron,#d9ff72);font-size:10px;font-weight:900}
    .nexus-client-solution-list{display:grid;gap:8px}.nexus-client-solution{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.018)}
    .nexus-client-solution b,.nexus-client-solution small{display:block}.nexus-client-solution small{margin-top:4px;color:var(--nx-muted);line-height:1.4}.nexus-client-solution-status{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#cfc5ff;font-weight:900;margin-bottom:4px}
    .nexus-client-upgrade-context{margin-top:10px;padding:12px;border:1px solid rgba(156,124,255,.2);border-radius:11px;background:rgba(156,124,255,.055)}.nexus-client-upgrade-context b{display:block;margin-bottom:4px}.nexus-client-upgrade-context p{margin:0;color:var(--nx-muted);font-size:12px;line-height:1.5}.nexus-client-upgrade-context small{display:block;margin-top:6px;color:#cfc5ff}
    @media(max-width:760px){.nexus-client-solution{grid-template-columns:1fr}.nexus-client-solution .btn{width:100%}.nexus-client-commercial-head{display:grid}}
  `;
  document.head.appendChild(style);
}

async function loadCommercial(){
  const companyId=state.companyId;if(!companyId||loading)return;
  loading=true;
  try{
    const [commercial,releases]=await Promise.all([
      sb.rpc('nexus_client_commercial_context',{p_company_id:companyId}),
      sb.from('nexus_diagnosis_report_releases').select('id,client_report,report_version,released_at').eq('company_id',companyId).eq('status','released').is('revoked_at',null).order('released_at',{ascending:false})
    ]);
    if(commercial.error)throw commercial.error;if(releases.error)throw releases.error;
    context=commercial.data||{offerings:[],entitlements:[],requests:[]};releaseRows=releases.data||[];
    mountCommercial();
  }catch(error){console.error('Nexus commercial context failed',error)}finally{loading=false}
}

function activeCodes(){return new Set((context?.entitlements||[]).filter(row=>row.status==='active').map(row=>row.offering_code))}
function offering(code){return (context?.offerings||[]).find(row=>row.code===code)||null}
function requestFor(releaseId,index){return (context?.requests||[]).find(row=>row.release_id===releaseId&&Number(row.opportunity_index)===index&&!['declined','cancelled'].includes(row.status))||null}
function currentLabel(codes){if(codes.has('run'))return'Run engagement';if(codes.has('build'))return'Build engagement';if(codes.has('find'))return'Find engagement';return'Diagnosis access'}
function nextOffering(codes){if(!codes.has('build'))return offering('build');if(!codes.has('run'))return offering('run');return null}
function ctaState(release,index,codes){
  const existing=requestFor(release.id,index);if(existing)return{label:`${existing.status==='requested'?'Requested':existing.status.replaceAll('_',' ')}`,disabled:true};
  if(codes.has('build'))return{label:'Add to implementation plan',disabled:false};
  return{label:'Request scope & price',disabled:false};
}

function panelMarkup(release){
  const opportunities=Array.isArray(release.client_report?.opportunities)?release.client_report.opportunities:[];
  if(!opportunities.length)return'';
  const codes=activeCodes(),next=nextOffering(codes);
  return `<section class="nexus-client-commercial" data-commercial-release="${esc(release.id)}"><div class="nexus-client-commercial-head"><div><div class="kicker">What you qualify for</div><h3>Turn a diagnosis recommendation into work</h3><p>Nexus separates diagnosis from implementation. Your current engagement and individual implementation options are shown below.</p></div><span class="nexus-client-commercial-pill">${esc(currentLabel(codes))}</span></div><div class="nexus-client-solution-list">${opportunities.map((item,index)=>{const state=ctaState(release,index,codes);return`<article class="nexus-client-solution"><div><div class="nexus-client-solution-status">${codes.has('build')?'Included implementation path':'Available individually'}</div><b>${esc(item.title||`Recommendation ${index+1}`)}</b><small>${codes.has('build')?'This can be reviewed for activation under your current Build engagement.':'This can be purchased as a separately scoped Build My AI Systems implementation. Nexus will confirm scope and the authoritative price before checkout.'}</small></div><button type="button" class="btn ${state.disabled?'secondary':'primary'}" data-request-solution="${index}" ${state.disabled?'disabled':''}>${esc(state.label)}</button></article>`}).join('')}</div>${next?`<div class="nexus-client-upgrade-context"><b>Next service level: ${esc(next.name)}</b><p>${esc(next.client_outcome||next.description)}</p><small>${esc(next.pricing_model)}</small></div>`:''}</section>`;
}

function mountCommercial(){
  const root=document.getElementById('nexus-client-reports');
  const cards=[...root?.querySelectorAll('.nexus-client-report')||[]];if(!cards.length||!context)return;
  if(cards.length!==releaseRows.length){console.warn('Nexus skipped commercial report controls because release ordering could not be reconciled safely.',{cards:cards.length,releases:releaseRows.length});return}
  cards.forEach((card,index)=>{
    const release=releaseRows[index];if(!release||card.querySelector('[data-commercial-release]'))return;
    card.insertAdjacentHTML('beforeend',panelMarkup(release));
    const panel=card.querySelector(`[data-commercial-release="${CSS.escape(release.id)}"]`);if(!panel)return;
    panel.querySelectorAll('[data-request-solution]').forEach(button=>button.addEventListener('click',async()=>{
      const opportunityIndex=Number(button.dataset.requestSolution);const original=button.textContent;button.disabled=true;button.textContent='Sending…';
      try{
        const {data,error}=await sb.rpc('nexus_request_solution_purchase',{p_release_id:release.id,p_opportunity_index:opportunityIndex});if(error)throw error;
        toast?.(data?.request_type==='included_activation'?'Sent to Nexus for implementation planning.':'Sent to Nexus for scope and pricing.');
        context=null;await loadCommercial();
      }catch(error){console.error('Solution request failed',error);toast?.(error.message||'This solution request could not be sent.');button.disabled=false;button.textContent=original}
    }));
  });
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(context)mountCommercial();else loadCommercial()})}

ensureStyles();
const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:client-context-ready',()=>{context=null;releaseRows=[];schedule()});
window.addEventListener('nexus:diagnosis-changed',()=>{context=null;releaseRows=[];schedule()});
schedule();

window.NexusClientCommercial=Object.freeze({refresh:()=>{context=null;releaseRows=[];return loadCommercial()}});
