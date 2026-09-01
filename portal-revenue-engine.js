const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
if(!state?.admin)throw new Error('Revenue Engine is admin-only.');

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=v=>v?new Date(v).toLocaleString(): '—';
const money=v=>v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)||0);
const num=v=>v===''||v==null?null:Number(v);
const stageLabel=v=>String(v||'new').replaceAll('_',' ');

let navButton=null;
let data={leads:[],packets:[],steps:[],exceptions:[],decisions:[]};

function ensureSection(){
  const main=document.querySelector('.main');if(!main)return null;
  let section=document.getElementById('section-revenue');
  if(!section){section=document.createElement('section');section.id='section-revenue';section.className='section nexus-revenue-section';section.innerHTML='<div id="nexusRevenueRoot"></div>';main.prepend(section)}
  return section;
}
function ensureNav(){
  const nav=document.querySelector('.side-nav');if(!nav)return;
  let button=nav.querySelector('button[data-section="revenue"]');
  if(!button){
    button=document.createElement('button');button.type='button';button.dataset.section='revenue';button.textContent='Revenue Engine';button.className='revenue-engine-nav';
    const clients=[...nav.querySelectorAll('button')].find(x=>x.textContent.trim()==='Clients');
    const note=nav.querySelector('.admin-journey-only-note');
    if(clients)clients.insertAdjacentElement('afterend',button);else if(note)note.insertAdjacentElement('beforebegin',button);else nav.appendChild(button);
  }
  button.onclick=showRevenue;navButton=button;
}
async function showRevenue(){
  ensureSection();ensureNav();
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id==='section-revenue'));
  document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b===navButton));
  await refresh();window.scrollTo(0,0);
}

async function refresh(){
  const [l,p,s,e,d]=await Promise.all([
    sb.from('nexus_revenue_leads').select('*').order('created_at',{ascending:false}).limit(150),
    sb.from('nexus_outreach_packets').select('*').order('created_at',{ascending:false}).limit(100),
    sb.from('nexus_outreach_sequence_steps').select('*').order('created_at',{ascending:false}).limit(200),
    sb.from('nexus_lead_exceptions').select('*').in('status',['open','acknowledged']).order('created_at',{ascending:false}).limit(150),
    sb.from('nexus_founder_decision_queue').select('*').eq('domain','pipeline').in('status',['open','waiting']).order('created_at',{ascending:false}).limit(100)
  ]);
  const failed=[l,p,s,e,d].find(x=>x.error);if(failed?.error){console.error('Revenue Engine load failed',failed.error);toast(`Revenue Engine could not load: ${failed.error.message}`);return}
  data={leads:l.data||[],packets:p.data||[],steps:s.data||[],exceptions:e.data||[],decisions:d.data||[]};render();
}
function lead(id){return data.leads.find(x=>x.id===id)||null}
function stepsFor(packetId){return data.steps.filter(x=>x.packet_id===packetId).sort((a,b)=>a.step_no-b.step_no)}
function openExceptions(leadId){return data.exceptions.filter(x=>x.lead_id===leadId)}
function stats(){return {
  total:data.leads.length,
  qualifying:data.leads.filter(x=>Number(x.opportunity_score)<=50&&!x.do_not_contact).length,
  packets:data.packets.filter(x=>x.status==='pending_review').length,
  approved:data.leads.filter(x=>['outreach_approved','contacted','replied','booked','retainer','won'].includes(x.stage)).length,
  contacted:data.leads.filter(x=>['contacted','replied','booked','retainer','won'].includes(x.stage)).length,
  booked:data.leads.filter(x=>['booked','diagnosis','onboarding','retainer','won'].includes(x.stage)).length,
  exceptions:data.exceptions.length
}}

function render(){
  const root=document.getElementById('nexusRevenueRoot');if(!root)return;const st=stats();
  root.innerHTML=`
    <div class="revenue-hero"><div><div class="eyebrow">Nexus admin · governed growth</div><h1>Revenue Engine</h1><p>Move qualified opportunities from evidence → score → personalized packet → human-approved outreach → booking → delivery. Agents prepare and verify; you control external contact.</p></div><div class="revenue-guard"><b>Human send gate is ON</b><span>No cold email or SMS is sent automatically from this console.</span></div></div>
    <div class="revenue-stats">
      ${[['Leads',st.total],['≤50 qualified',st.qualifying],['Packets to review',st.packets],['Contacted',st.contacted],['Booked+',st.booked],['Open exceptions',st.exceptions]].map(([k,v])=>`<div><b>${v}</b><span>${k}</span></div>`).join('')}
    </div>
    <div class="revenue-grid revenue-top-grid">
      <section class="revenue-panel"><div class="panel-head"><div><div class="kicker">Lead intake</div><h2>Add a prospect</h2></div><button id="revenueRefresh" class="btn secondary" type="button">Refresh</button></div>
        <form id="revenueLeadForm" class="revenue-form">
          <div class="form-grid"><div class="field"><label>Company</label><input id="revCompany" required></div><div class="field"><label>Website</label><input id="revWebsite" type="url" placeholder="https://"></div></div>
          <div class="form-grid"><div class="field"><label>Niche</label><select id="revNiche"><option value="">Unknown / other</option><option>Local Services</option><option>Legal</option><option>Real Estate</option><option>E-commerce</option><option>Logistics</option><option>Healthcare Clinics</option></select></div><div class="field"><label>Geography</label><input id="revGeo"></div></div>
          <div class="form-grid"><div class="field"><label>Business email</label><input id="revEmail" type="email"></div><div class="field"><label>Jurisdiction</label><input id="revJurisdiction" placeholder="DE, US"></div></div>
          <div class="form-grid"><div class="field"><label>Annual revenue min</label><input id="revRevenueMin" type="number" min="0"></div><div class="field"><label>Annual revenue max</label><input id="revRevenueMax" type="number" min="0"></div><div class="field"><label>Employees</label><input id="revEmployees" type="number" min="0"></div></div>
          <label class="revenue-check"><input id="revVerifiedContact" type="checkbox"><span><b>Verified business contact</b><small>Check only when the email provenance has been verified as business-use contact information.</small></span></label>
          <button class="btn primary" type="submit">Add lead →</button>
        </form>
      </section>
      <section class="revenue-panel"><div class="kicker">Evidence + score</div><h2>Record verified scoring evidence</h2>
        <form id="revenueEvidenceForm" class="revenue-form">
          <div class="field"><label>Lead</label><select id="revEvidenceLead" required><option value="">Select lead</option>${data.leads.map(x=>`<option value="${x.id}">${esc(x.company_name)} · ${x.opportunity_score??'unscored'}</option>`).join('')}</select></div>
          <div class="form-grid"><div class="field"><label>Evidence type</label><select id="revEvidenceType" required><option value="response_time">Response time</option><option value="booking">Automated booking</option><option value="chat">Chat availability</option><option value="review_bottleneck">Review bottleneck</option><option value="manual_touchpoint">Manual touchpoint</option><option value="employee_count">Employee count</option><option value="annual_revenue">Annual revenue</option><option value="business_contact">Business contact</option><option value="workflow">Workflow</option><option value="other">Other</option></select></div><div class="field"><label>Numeric value</label><input id="revEvidenceValue" type="number" step="any"></div><div class="field"><label>Unit</label><input id="revEvidenceUnit" placeholder="minutes, boolean, USD"></div></div>
          <div class="field"><label>Verified observation</label><textarea id="revEvidenceObservation" required placeholder="State exactly what was observed and where it came from."></textarea></div>
          <div class="form-grid"><div class="field"><label>Source name</label><input id="revEvidenceSource"></div><div class="field"><label>Source URL</label><input id="revEvidenceUrl" type="url"></div></div>
          <label class="revenue-check"><input id="revEvidenceVerified" type="checkbox" required><span><b>I verified this evidence</b><small>Unchecked observations must not affect the deterministic score.</small></span></label>
          <button class="btn primary" type="submit">Save evidence + recalculate →</button>
        </form>
      </section>
    </div>
    <section class="revenue-panel"><div class="panel-head"><div><div class="kicker">Pipeline</div><h2>Leads</h2></div><span class="small">Low Opportunity Score = larger automation gap / higher outreach priority.</span></div><div class="revenue-table-wrap"><table class="revenue-table"><thead><tr><th>Company</th><th>Score</th><th>Confidence</th><th>Stage</th><th>Economic estimate</th><th>Exceptions</th><th>Action</th></tr></thead><tbody>${leadRows()}</tbody></table></div></section>
    <section class="revenue-panel"><div class="panel-head"><div><div class="kicker">Human review queue</div><h2>Outreach packets</h2></div><span class="small">QA-passed packets can be approved; sending remains separate.</span></div><div id="revenuePackets" class="revenue-packet-list">${packetRows()}</div></section>
    <div class="revenue-grid">
      <section class="revenue-panel"><div class="kicker">Exceptions</div><h2>What blocks clean execution</h2>${data.exceptions.length?data.exceptions.map(x=>`<article class="revenue-exception"><span class="pill">${esc(x.severity)}</span><b>${esc(lead(x.lead_id)?.company_name||'Lead')}</b><p>${esc(x.summary)}</p></article>`).join(''):'<div class="empty">No open lead exceptions.</div>'}</section>
      <section class="revenue-panel"><div class="kicker">Founder decisions</div><h2>Your pending revenue decisions</h2>${data.decisions.length?data.decisions.map(x=>`<article class="revenue-decision"><span class="pill">${esc(x.priority)}</span><b>${esc(x.title)}</b><p>${esc(x.recommended_action||x.context||'')}</p><small>${dt(x.created_at)}</small></article>`).join(''):'<div class="empty">No pending revenue decisions.</div>'}</section>
    </div>`;
  bind();
}
function leadRows(){
  if(!data.leads.length)return '<tr><td colspan="7"><div class="empty">No revenue leads yet.</div></td></tr>';
  return data.leads.map(x=>`<tr><td><b>${esc(x.company_name)}</b><div class="small">${esc(x.niche||x.geography||'')}</div></td><td><span class="score ${Number(x.opportunity_score)<=50?'priority':''}">${x.opportunity_score??'—'}</span></td><td>${Math.round(Number(x.score_confidence||0))}%</td><td>${esc(stageLabel(x.stage))}</td><td>${money(x.estimated_lost_monthly_revenue)}${x.estimated_lost_monthly_revenue?'<div class="small">estimate</div>':''}</td><td>${openExceptions(x.id).length}</td><td><button class="btn secondary revenue-rescore" data-id="${x.id}" type="button">Recalculate</button></td></tr>`).join('')
}
function packetRows(){
  if(!data.packets.length)return '<div class="empty">No outreach packets generated yet.</div>';
  return data.packets.map(p=>{const l=lead(p.lead_id),steps=stepsFor(p.id),s1=steps.find(x=>x.step_no===1),s2=steps.find(x=>x.step_no===2);return `<article class="revenue-packet"><div class="packet-head"><div><span class="pill">${esc(p.status)}</span> <span class="pill">QA ${esc(p.qa_status)}</span><h3>${esc(l?.company_name||'Lead')} · v${p.version}</h3><div class="small">Score ${l?.opportunity_score??'—'} · Confidence ${Math.round(Number(p.confidence||0))}% · ${dt(p.created_at)}</div></div><div class="packet-actions">${p.status==='pending_review'&&p.qa_status==='passed'?`<button class="btn primary approve-packet" data-id="${p.id}" type="button">Approve packet</button>`:''}</div></div>
    <details><summary>30–60 sec teardown</summary><pre>${esc(p.teardown_script||'')}</pre></details>
    <details><summary>Email 1</summary><div class="packet-copy"><b>${esc(p.email_1_subject||'')}</b><pre>${esc(p.email_1_body||'')}</pre><button class="btn secondary copy-step" data-id="${s1?.id||''}" data-text="${encodeURIComponent(`${p.email_1_subject||''}\n\n${p.email_1_body||''}`)}" type="button">Copy Email 1</button>${s1?.status==='approved_ready'?` <button class="btn primary mark-sent" data-id="${s1.id}" type="button">Mark Email 1 sent</button>`:''}</div></details>
    <details><summary>Email 2 · follow-up</summary><div class="packet-copy"><b>${esc(p.email_2_subject||'')}</b><pre>${esc(p.email_2_body||'')}</pre><div class="small">${s2?.due_at?'Due '+dt(s2.due_at):'Due date starts only after Email 1 is marked sent.'}</div><button class="btn secondary copy-step" data-id="${s2?.id||''}" data-text="${encodeURIComponent(`${p.email_2_subject||''}\n\n${p.email_2_body||''}`)}" type="button">Copy Email 2</button>${s2?.status==='pending_approval'?` <button class="btn primary approve-step" data-id="${s2.id}" type="button">Approve follow-up</button>`:''}${s2?.status==='approved_ready'?` <button class="btn primary mark-sent" data-id="${s2.id}" type="button">Mark Email 2 sent</button>`:''}</div></details>
    <details><summary>Snapshot preview + evidence controls</summary><pre>${esc(JSON.stringify(p.snapshot_preview||{},null,2))}</pre><div class="small"><b>Evidence references:</b> ${(p.evidence_refs||[]).length} · <b>Compliance flags:</b> ${(p.compliance_flags||[]).map(esc).join(', ')||'none'}</div></details></article>`}).join('')
}

function bind(){
  document.getElementById('revenueRefresh')?.addEventListener('click',refresh);
  document.getElementById('revenueLeadForm')?.addEventListener('submit',addLead);
  document.getElementById('revenueEvidenceForm')?.addEventListener('submit',addEvidence);
  document.querySelectorAll('.revenue-rescore').forEach(b=>b.onclick=()=>recalculate(b.dataset.id));
  document.querySelectorAll('.approve-packet').forEach(b=>b.onclick=()=>approvePacket(b.dataset.id));
  document.querySelectorAll('.approve-step').forEach(b=>b.onclick=()=>approveStep(b.dataset.id));
  document.querySelectorAll('.mark-sent').forEach(b=>b.onclick=()=>markSent(b.dataset.id));
  document.querySelectorAll('.copy-step').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(decodeURIComponent(b.dataset.text||''));toast('Outreach draft copied. Nothing was sent automatically.')});
}
async function addLead(e){
  e.preventDefault();
  const payload={source:'manual',source_ref:crypto.randomUUID(),company_name:document.getElementById('revCompany').value.trim(),website:document.getElementById('revWebsite').value.trim(),niche:document.getElementById('revNiche').value,geography:document.getElementById('revGeo').value.trim(),email:document.getElementById('revEmail').value.trim(),jurisdiction:document.getElementById('revJurisdiction').value.trim(),annual_revenue_min:num(document.getElementById('revRevenueMin').value),annual_revenue_max:num(document.getElementById('revRevenueMax').value),employee_count:num(document.getElementById('revEmployees').value),contact_provenance:document.getElementById('revVerifiedContact').checked?{business_contact_verified:true,source:'manual_admin_verification'}:{source:'manual_unverified'}};
  const {error}=await sb.rpc('nexus_admin_upsert_revenue_lead',{p_payload:payload});if(error)return toast(error.message);e.target.reset();toast('Lead added. Record verified evidence before relying on its score.');await refresh();
}
async function addEvidence(e){
  e.preventDefault();const leadId=document.getElementById('revEvidenceLead').value;
  const row={lead_id:leadId,evidence_type:document.getElementById('revEvidenceType').value,source_name:document.getElementById('revEvidenceSource').value.trim()||null,source_url:document.getElementById('revEvidenceUrl').value.trim()||null,observation:document.getElementById('revEvidenceObservation').value.trim(),numeric_value:num(document.getElementById('revEvidenceValue').value),unit:document.getElementById('revEvidenceUnit').value.trim()||null,observed_at:new Date().toISOString(),verified:document.getElementById('revEvidenceVerified').checked,confidence:document.getElementById('revEvidenceVerified').checked?100:0,metadata:{entered_via:'revenue_engine_admin'}};
  const {error}=await sb.from('nexus_lead_research_evidence').insert(row);if(error)return toast(error.message);const r=await sb.rpc('nexus_recalculate_revenue_lead_score',{p_lead_id:leadId});if(r.error)return toast(r.error.message);e.target.reset();toast(`Evidence saved. Opportunity Score recalculated to ${r.data}.`);await refresh();
}
async function recalculate(id){const r=await sb.rpc('nexus_recalculate_revenue_lead_score',{p_lead_id:id});if(r.error)return toast(r.error.message);toast(`Opportunity Score recalculated to ${r.data}.`);await refresh()}
async function approvePacket(id){if(!confirm('Approve this QA-passed packet and make Email 1 send-ready? This does not send anything.'))return;const r=await sb.rpc('nexus_admin_approve_outreach_packet',{p_packet_id:id});if(r.error)return toast(r.error.message);toast('Packet approved. Email 1 is send-ready, but nothing was sent.');await refresh()}
async function approveStep(id){if(!confirm('Approve this follow-up step? This does not send anything.'))return;const r=await sb.rpc('nexus_admin_approve_outreach_step',{p_step_id:id});if(r.error)return toast(r.error.message);toast('Follow-up approved and send-ready. Nothing was sent.');await refresh()}
async function markSent(id){if(!confirm('Only continue if you actually sent this email outside the automated generation flow. Mark it sent now?'))return;const r=await sb.rpc('nexus_admin_mark_outreach_sent',{p_step_id:id,p_provider_message_id:null});if(r.error)return toast(r.error.message);toast('Recorded as sent. If this was Email 1, Email 2 is now due in 3 days and still requires approval.');await refresh()}

ensureSection();ensureNav();
const navObserver=new MutationObserver(()=>{if(!document.querySelector('.side-nav button[data-section="revenue"]'))ensureNav()});
navObserver.observe(document.querySelector('.side-nav'),{childList:true,subtree:true});
window.NexusRevenueEngine={show:showRevenue,refresh};
