export async function initOps({sb,state,$,toast,workspace,log}){
  if(window.__nexusOpsInit)return;window.__nexusOpsInit=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dt=v=>v?new Date(v).toLocaleString():'—';
  const date=v=>v?new Date(v+'T00:00:00').toLocaleDateString():'—';
  const openRequest=r=>!['complete','declined'].includes(r.status);
  const company=()=>state.companies?.find(c=>c.id===state.companyId)||null;
  const badge=s=>`<span class="ops-badge ${esc(s||'')}">${esc(String(s||'').replaceAll('_',' '))}</span>`;
  const empty=t=>`<div class="ops-empty">${esc(t)}</div>`;
  let local={requests:[],approvals:[],automations:[],opportunities:[],docRequests:[],memory:null};
  let global={requests:[],approvals:[],automations:[],docRequests:[]};
  let setupDone=false,refreshing=false;

  function addSection(id,html){
    const main=document.querySelector('.main');if(!main||document.getElementById('section-'+id))return;
    const s=document.createElement('section');s.id='section-'+id;s.className='section';s.innerHTML=html;main.prepend(s);
  }
  function ensureSections(){
    addSection('command','<div id="opsCommandRoot" class="ops-dashboard"></div>');
    addSection('clients','<div id="opsClientsRoot"></div>');
    addSection('requests','<div id="opsRequestsRoot"></div>');
    addSection('approvals','<div id="opsApprovalsRoot"></div>');
    addSection('automations','<div id="opsAutomationsRoot"></div>');
    const ov=$('section-overview');
    if(ov&&!$('opsTodayRoot')){
      const root=document.createElement('div');root.id='opsTodayRoot';root.className='ops-dashboard';ov.prepend(root);
      [...ov.children].filter(x=>x!==root).forEach(x=>x.classList.add('ops-legacy-hidden'));
    }
    const metrics=$('section-metrics');
    if(metrics&&!$('opsOpportunityBlock')){
      const head=metrics.querySelector('h1');if(head)head.textContent='Improvements & Value';
      const eye=metrics.querySelector('.eyebrow');if(eye)eye.textContent='Value & Improvement Ledger';
      const block=document.createElement('div');block.id='opsOpportunityBlock';block.style.marginBottom='18px';
      const list=$('metricList');list?.parentNode?.insertBefore(block,list);
    }
    const timeline=$('section-timeline');if(timeline){timeline.querySelector('h1')&&(timeline.querySelector('h1').textContent='Projects & Milestones');const e=timeline.querySelector('.eyebrow');if(e)e.textContent='Engagement progress';if(!$('opsLifecycle')){const x=document.createElement('div');x.id='opsLifecycle';x.className='ops-panel';x.style.marginBottom='14px';timeline.querySelector('.toolbar')?.after(x)}}
  }
  function customButton(label,section){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.section=section;b.addEventListener('click',()=>activate(section,b));return b}
  function group(nav,label){const d=document.createElement('div');d.className='ops-nav-group';d.textContent=label;nav.appendChild(d)}
  function buildNav(){
    const nav=document.querySelector('.side-nav');if(!nav)return;
    const old={};[...nav.querySelectorAll('button[data-section]')].forEach(b=>old[b.dataset.section]=b);
    nav.innerHTML='';
    const reuse=(key,label)=>{const b=old[key];if(!b)return null;b.textContent=label;nav.appendChild(b);b.addEventListener('click',()=>setTimeout(refresh,120));return b};
    if(state.admin){
      group(nav,'Nexus Admin');nav.appendChild(customButton('Command Center','command'));nav.appendChild(customButton('Clients','clients'));
      group(nav,'Client Work');reuse('overview','Client Today');reuse('tasks','Action Items');nav.appendChild(customButton('Requests','requests'));nav.appendChild(customButton('Approvals','approvals'));
      group(nav,'Systems & Value');nav.appendChild(customButton('Automations','automations'));reuse('metrics','Improvements');reuse('timeline','Projects');reuse('documents','Secure Files');
      group(nav,'Record');reuse('activity','Activity');
    }else{
      group(nav,'Your Workspace');reuse('overview','Today');nav.appendChild(customButton('Requests','requests'));nav.appendChild(customButton('Approvals','approvals'));reuse('tasks','Action Items');
      group(nav,'Systems & Value');nav.appendChild(customButton('Automations','automations'));reuse('metrics','Improvements');reuse('timeline','Projects');reuse('documents','Secure Files');
      group(nav,'Updates');reuse('notifications','Alerts');
    }
  }
  function activate(section,button){
    document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id==='section-'+section));
    document.querySelectorAll('.side-nav button').forEach(b=>b.classList.toggle('active',b===button||b.dataset.section===section));
    refresh();
  }
  function roleUI(){
    const top=document.querySelector('.topbar');if(top&&!$('opsRoleChip')){const c=document.createElement('span');c.id='opsRoleChip';c.className='ops-role-chip';top.insertBefore(c,$('alertsBtn'))}
    if($('opsRoleChip'))$('opsRoleChip').textContent=state.admin?'Nexus Admin':'Client Workspace';
    const mini=$('companyMini');if(mini){const c=company();mini.innerHTML=`<b>${esc(c?.name||'Company')}</b><div class="small">${state.admin?'Administrator view':'Client workspace'}</div>`}
  }
  async function loadLocal(){
    if(!state.companyId){local={requests:[],approvals:[],automations:[],opportunities:[],docRequests:[],memory:null};return}
    const cid=state.companyId;
    const [r,a,au,o,d,m]=await Promise.all([
      sb.from('nexus_client_requests').select('*').eq('company_id',cid).order('created_at',{ascending:false}),
      sb.from('nexus_approvals').select('*').eq('company_id',cid).order('created_at',{ascending:false}),
      sb.from('nexus_automations').select('*').eq('company_id',cid).order('created_at',{ascending:false}),
      sb.from('nexus_opportunities').select('*').eq('company_id',cid).order('created_at',{ascending:false}),
      sb.from('nexus_document_requests').select('*').eq('company_id',cid).order('created_at',{ascending:false}),
      sb.from('nexus_company_memory').select('*').eq('company_id',cid).maybeSingle()
    ]);
    local={requests:r.data||[],approvals:a.data||[],automations:au.data||[],opportunities:o.data||[],docRequests:d.data||[],memory:m.data||null};
  }
  async function loadGlobal(){
    if(!state.admin)return;
    const [r,a,au,d]=await Promise.all([
      sb.from('nexus_client_requests').select('*').order('created_at',{ascending:false}),
      sb.from('nexus_approvals').select('*').order('created_at',{ascending:false}),
      sb.from('nexus_automations').select('*').order('created_at',{ascending:false}),
      sb.from('nexus_document_requests').select('*').order('created_at',{ascending:false})
    ]);global={requests:r.data||[],approvals:a.data||[],automations:au.data||[],docRequests:d.data||[]};
  }
  function attentionItems(){
    const items=[];
    (state.tasks||[]).filter(t=>t.status!=='complete'&&t.status!=='completed').slice(0,4).forEach(t=>items.push({title:t.title,sub:`Action item · ${t.assignee||'unassigned'}${t.due_date?' · due '+date(t.due_date):''}`,section:'tasks'}));
    local.approvals.filter(a=>a.status==='pending').slice(0,3).forEach(a=>items.push({title:a.title,sub:'Approval waiting for a decision',section:'approvals'}));
    local.docRequests.filter(d=>d.status==='requested').slice(0,3).forEach(d=>items.push({title:d.title,sub:'Requested file is still outstanding',section:'documents'}));
    local.automations.filter(a=>['attention','action_required'].includes(a.status)).slice(0,3).forEach(a=>items.push({title:a.name,sub:`Automation status: ${a.status.replace('_',' ')}`,section:'automations'}));
    return items;
  }
  function renderToday(){
    const root=$('opsTodayRoot');if(!root)return;const c=company();const actions=attentionItems();
    const reqOpen=local.requests.filter(openRequest).length,pending=local.approvals.filter(a=>a.status==='pending').length,autoIssues=local.automations.filter(a=>['attention','action_required'].includes(a.status)).length,taskOpen=(state.tasks||[]).filter(t=>!['complete','completed'].includes(t.status)).length;
    const latest=(state.metrics||[]).slice(0,3);
    root.innerHTML=`<div class="ops-hero"><div class="eyebrow">${state.admin?'Client workspace':'Today'}</div><h1>${state.admin?esc(c?.name||'Client'):'What needs your attention?'}</h1><p>${state.admin?'Review current client work, decisions, systems, and measured value in one place.':'This is your Nexus action center. Start here instead of hunting through tabs.'}</p></div>
      <div class="ops-stat-grid"><div class="ops-stat"><strong>${taskOpen}</strong><span>Open action items</span></div><div class="ops-stat"><strong>${reqOpen}</strong><span>Open requests</span></div><div class="ops-stat"><strong>${pending}</strong><span>Pending approvals</span></div><div class="ops-stat"><strong>${autoIssues}</strong><span>Automations needing attention</span></div></div>
      <div class="ops-grid"><div class="ops-panel"><h2>Needs attention</h2><div class="ops-action-list">${actions.length?actions.map(i=>`<button class="ops-action" type="button" data-jump="${i.section}"><span><b>${esc(i.title)}</b><small>${esc(i.sub)}</small></span><span>→</span></button>`).join(''):empty('Nothing urgent is waiting right now.')}</div></div>
      <div class="ops-panel"><h2>Weekly Business Pulse</h2><div class="ops-pulse"><h3>${actions.length?'There are items to move forward.':'Workspace is clear.'}</h3><p>${taskOpen} open actions · ${reqOpen} open requests · ${pending} approvals · ${autoIssues} automation health issues.</p></div><div style="height:14px"></div><h3>Latest measured improvements</h3>${latest.length?latest.map(m=>`<div class="ops-item"><b>${esc(m.name)}</b><div class="ops-kpi-row"><div class="ops-kpi"><span>Baseline</span><b>${esc(m.baseline_value??'—')} ${esc(m.unit||'')}</b></div><div class="ops-kpi"><span>Current</span><b>${esc(m.current_value??'—')} ${esc(m.unit||'')}</b></div><div class="ops-kpi"><span>Target</span><b>${esc(m.target_value??'—')} ${esc(m.unit||'')}</b></div></div></div>`).join(''):empty('No measurement records yet.')}</div></div>
      <div class="ops-panel"><div class="ops-toolbar"><div><h2>Company Context</h2><p class="ops-section-copy">Shared operating context so Nexus does not have to repeatedly ask for the same business information.</p></div>${state.admin?'<button id="editMemoryBtn" class="btn secondary" type="button">Edit context</button>':''}</div><div id="opsMemoryView"></div><form id="opsMemoryForm" class="ops-memory" style="display:none"><div class="ops-form-grid"><div class="field"><label>Goals</label><textarea id="memGoals"></textarea></div><div class="field"><label>Core systems</label><textarea id="memSystems"></textarea></div><div class="field"><label>Operating context</label><textarea id="memContext"></textarea></div><div class="field"><label>Company terminology</label><textarea id="memTerms"></textarea></div></div><div class="field"><label>Important decisions / constraints</label><textarea id="memDecisions"></textarea></div><button class="btn primary" type="submit">Save company context</button></form></div>`;
    root.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{const nav=document.querySelector(`.side-nav button[data-section="${b.dataset.jump}"]`);nav?.click()});
    renderMemory();
  }
  function renderMemory(){
    const box=$('opsMemoryView');if(!box)return;const m=local.memory;
    box.innerHTML=m?`<div class="ops-grid"><div><div class="small">Goals</div><p>${esc(m.goals||'Not documented yet.')}</p><div class="small">Systems</div><p>${esc(m.systems||'Not documented yet.')}</p></div><div><div class="small">Operating context</div><p>${esc(m.operating_context||'Not documented yet.')}</p><div class="small">Important decisions</div><p>${esc(m.decision_notes||'Not documented yet.')}</p></div></div>`:empty('Company context has not been documented yet.');
    if(state.admin&&$('editMemoryBtn'))$('editMemoryBtn').onclick=()=>{const f=$('opsMemoryForm');f.style.display=f.style.display==='none'?'block':'none';$('memGoals').value=m?.goals||'';$('memSystems').value=m?.systems||'';$('memContext').value=m?.operating_context||'';$('memTerms').value=m?.terminology||'';$('memDecisions').value=m?.decision_notes||''};
    if(state.admin&&$('opsMemoryForm'))$('opsMemoryForm').onsubmit=async e=>{e.preventDefault();const row={company_id:state.companyId,goals:$('memGoals').value.trim()||null,systems:$('memSystems').value.trim()||null,operating_context:$('memContext').value.trim()||null,terminology:$('memTerms').value.trim()||null,decision_notes:$('memDecisions').value.trim()||null,updated_by:state.user.id,updated_at:new Date().toISOString()};const {error}=await sb.from('nexus_company_memory').upsert(row,{onConflict:'company_id'});if(error)return toast(error.message);toast('Company context saved.');await refresh()};
  }
  function renderRequests(){
    const root=$('opsRequestsRoot');if(!root)return;
    root.innerHTML=`<div class="ops-toolbar"><div><div class="eyebrow">Request Center</div><h1>Requests</h1><p class="ops-section-copy">A structured place for new automation ideas, workflow changes, problems, reporting needs, and support requests.</p></div><button id="toggleRequestForm" class="btn primary" type="button">+ New request</button></div>
    <form id="opsRequestForm" class="ops-request-form" style="display:none"><div class="ops-form-grid"><div class="field"><label>Request type</label><select id="opsRequestCategory"><option value="automation">New automation</option><option value="workflow_change">Workflow change</option><option value="issue">Something is not working</option><option value="reporting">Reporting / dashboard</option><option value="training">Training / enablement</option><option value="other">Other</option></select></div><div class="field"><label>Priority</label><select id="opsRequestPriority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div></div><div class="field"><label>What do you need?</label><input id="opsRequestTitle" required></div><div class="field"><label>Describe the business need</label><textarea id="opsRequestDescription" required placeholder="What is happening now, what should change, and who is affected?"></textarea></div><button class="btn primary" type="submit">Submit request</button></form><div style="height:14px"></div><div class="ops-list">${local.requests.length?local.requests.map(r=>`<div class="ops-item"><div class="ops-item-head"><div><h3>${esc(r.title)}</h3><p>${esc(r.description||'')}</p></div>${badge(r.status)}</div><div class="ops-meta">${badge(r.category)}${badge(r.priority)}<span class="ops-badge">${dt(r.created_at)}</span></div>${state.admin?`<div class="ops-decision"><select class="ops-select request-status" data-id="${r.id}">${['submitted','reviewing','planned','in_progress','waiting_client','complete','declined'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s.replaceAll('_',' ')}</option>`).join('')}</select></div>`:''}</div>`).join(''):empty('No requests have been submitted yet.')}</div>`;
    $('toggleRequestForm').onclick=()=>{$('opsRequestForm').style.display=$('opsRequestForm').style.display==='none'?'block':'none'};
    $('opsRequestForm').onsubmit=async e=>{e.preventDefault();const row={company_id:state.companyId,project_id:state.projects?.[0]?.id||null,category:$('opsRequestCategory').value,title:$('opsRequestTitle').value.trim(),description:$('opsRequestDescription').value.trim(),priority:$('opsRequestPriority').value,requested_by:state.user.id};const {data,error}=await sb.from('nexus_client_requests').insert(row).select().single();if(error)return toast(error.message);if(log)await log('client_request_created','client_request',data.id,'Request submitted: '+row.title);toast('Request submitted.');e.target.reset();await refresh()};
    root.querySelectorAll('.request-status').forEach(s=>s.onchange=async()=>{const {error}=await sb.from('nexus_client_requests').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.id);if(error)return toast(error.message);toast('Request status updated.');await refresh()});
  }
  function renderApprovals(){
    const root=$('opsApprovalsRoot');if(!root)return;
    root.innerHTML=`<div class="ops-toolbar"><div><div class="eyebrow">Approval Center</div><h1>Approvals</h1><p class="ops-section-copy">Decisions that require explicit client review stay here with a clear audit trail.</p></div>${state.admin?'<button id="toggleApprovalForm" class="btn primary" type="button">+ Request approval</button>':''}</div>${state.admin?`<form id="opsApprovalForm" class="ops-request-form" style="display:none"><div class="field"><label>Decision needed</label><input id="opsApprovalTitle" required></div><div class="field"><label>What is being approved?</label><textarea id="opsApprovalDescription"></textarea></div><div class="field"><label>Due date (optional)</label><input id="opsApprovalDue" type="date"></div><button class="btn primary" type="submit">Send for approval</button></form><div style="height:14px"></div>`:''}<div class="ops-list">${local.approvals.length?local.approvals.map(a=>`<div class="ops-item"><div class="ops-item-head"><div><h3>${esc(a.title)}</h3><p>${esc(a.description||'')}</p></div>${badge(a.status)}</div><div class="ops-meta">${a.due_date?`<span class="ops-badge">Due ${date(a.due_date)}</span>`:''}${a.decided_at?`<span class="ops-badge">Decided ${dt(a.decided_at)}</span>`:''}</div>${a.decision_note?`<p><b>Decision note:</b> ${esc(a.decision_note)}</p>`:''}${!state.admin&&a.status==='pending'?`<div class="ops-decision"><button class="btn primary approval-decision" data-id="${a.id}" data-status="approved" type="button">Approve</button><button class="btn secondary approval-decision" data-id="${a.id}" data-status="changes_requested" type="button">Request changes</button></div>`:''}${state.admin&&a.status==='pending'?`<div class="ops-decision"><button class="btn secondary approval-cancel" data-id="${a.id}" type="button">Cancel request</button></div>`:''}</div>`).join(''):empty('No approvals are waiting right now.')}</div>`;
    if(state.admin&&$('toggleApprovalForm'))$('toggleApprovalForm').onclick=()=>{$('opsApprovalForm').style.display=$('opsApprovalForm').style.display==='none'?'block':'none'};
    if(state.admin&&$('opsApprovalForm'))$('opsApprovalForm').onsubmit=async e=>{e.preventDefault();const row={company_id:state.companyId,project_id:state.projects?.[0]?.id||null,title:$('opsApprovalTitle').value.trim(),description:$('opsApprovalDescription').value.trim()||null,due_date:$('opsApprovalDue').value||null,requested_by:state.user.id};const {data,error}=await sb.from('nexus_approvals').insert(row).select().single();if(error)return toast(error.message);if(log)await log('approval_requested','approval',data.id,'Approval requested: '+row.title);toast('Approval request created.');e.target.reset();await refresh()};
    root.querySelectorAll('.approval-decision').forEach(b=>b.onclick=async()=>{let note='';if(b.dataset.status==='changes_requested')note=prompt('What changes are needed?')||'';const row={status:b.dataset.status,decided_by:state.user.id,decision_note:note||null,decided_at:new Date().toISOString(),updated_at:new Date().toISOString()};const {error}=await sb.from('nexus_approvals').update(row).eq('id',b.dataset.id);if(error)return toast(error.message);toast(b.dataset.status==='approved'?'Approved.':'Changes requested.');await refresh()});
    root.querySelectorAll('.approval-cancel').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('nexus_approvals').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',b.dataset.id);if(error)return toast(error.message);await refresh()});
  }
  function renderAutomations(){
    const root=$('opsAutomationsRoot');if(!root)return;
    root.innerHTML=`<div class="ops-toolbar"><div><div class="eyebrow">Automation Command Center</div><h1>Automations</h1><p class="ops-section-copy">See what Nexus-supported systems do, whether they are healthy, who owns them, and where human control remains.</p></div>${state.admin?'<button id="toggleAutomationForm" class="btn primary" type="button">+ Add automation</button>':''}</div>${state.admin?`<form id="opsAutomationForm" class="ops-request-form" style="display:none"><div class="ops-form-grid"><div class="field"><label>Automation name</label><input id="opsAutomationName" required></div><div class="field"><label>Status</label><select id="opsAutomationStatus"><option value="building">Building</option><option value="healthy">Healthy</option><option value="attention">Needs attention</option><option value="action_required">Action required</option><option value="paused">Paused</option></select></div><div class="field"><label>Owner</label><input id="opsAutomationOwner" placeholder="Nexus, client team, shared"></div><div class="field"><label>Systems involved</label><input id="opsAutomationSystems" placeholder="HubSpot, Gmail, QuickBooks..."></div></div><div class="field"><label>Business purpose</label><textarea id="opsAutomationPurpose"></textarea></div><div class="field"><label>Human control / approval</label><textarea id="opsAutomationControl" placeholder="What still requires a person to review or approve?"></textarea></div><button class="btn primary" type="submit">Add automation</button></form><div style="height:14px"></div>`:''}<div class="ops-list">${local.automations.length?local.automations.map(a=>`<div class="ops-item"><div class="ops-item-head"><div><h3>${esc(a.name)}</h3><p>${esc(a.purpose||'No purpose documented yet.')}</p></div>${badge(a.status)}</div><div class="ops-meta">${a.owner_label?`<span class="ops-badge">Owner: ${esc(a.owner_label)}</span>`:''}${a.systems?`<span class="ops-badge">${esc(a.systems)}</span>`:''}${a.last_run_at?`<span class="ops-badge">Last run ${dt(a.last_run_at)}</span>`:''}</div>${a.human_control?`<p><b>Human control:</b> ${esc(a.human_control)}</p>`:''}${state.admin?`<div class="ops-decision"><select class="ops-select automation-status" data-id="${a.id}">${['building','healthy','attention','action_required','paused','retired'].map(s=>`<option value="${s}" ${a.status===s?'selected':''}>${s.replaceAll('_',' ')}</option>`).join('')}</select></div>`:''}</div>`).join(''):empty('No automations have been registered for this company yet.')}</div>`;
    if(state.admin&&$('toggleAutomationForm'))$('toggleAutomationForm').onclick=()=>{$('opsAutomationForm').style.display=$('opsAutomationForm').style.display==='none'?'block':'none'};
    if(state.admin&&$('opsAutomationForm'))$('opsAutomationForm').onsubmit=async e=>{e.preventDefault();const row={company_id:state.companyId,project_id:state.projects?.[0]?.id||null,name:$('opsAutomationName').value.trim(),purpose:$('opsAutomationPurpose').value.trim()||null,owner_label:$('opsAutomationOwner').value.trim()||null,systems:$('opsAutomationSystems').value.trim()||null,human_control:$('opsAutomationControl').value.trim()||null,status:$('opsAutomationStatus').value,created_by:state.user.id};const {data,error}=await sb.from('nexus_automations').insert(row).select().single();if(error)return toast(error.message);if(log)await log('automation_registered','automation',data.id,'Automation registered: '+row.name);toast('Automation added.');e.target.reset();await refresh()};
    root.querySelectorAll('.automation-status').forEach(s=>s.onchange=async()=>{const {error}=await sb.from('nexus_automations').update({status:s.value,last_reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',s.dataset.id);if(error)return toast(error.message);toast('Automation health updated.');await refresh()});
  }
  function renderOpportunities(){
    const root=$('opsOpportunityBlock');if(!root)return;
    root.innerHTML=`<div class="ops-panel"><div class="ops-toolbar"><div><h2>Opportunity Register</h2><p class="ops-section-copy">Potential improvements discovered by the client or Nexus. Score and prioritize before building.</p></div><button id="toggleOpportunityForm" class="btn secondary" type="button">+ ${state.admin?'Add opportunity':'Suggest opportunity'}</button></div><form id="opsOpportunityForm" class="ops-request-form" style="display:none"><div class="field"><label>Opportunity</label><input id="opsOpportunityTitle" required></div><div class="field"><label>Problem / friction</label><textarea id="opsOpportunityProblem"></textarea></div>${state.admin?`<div class="ops-form-grid"><div class="field"><label>Value (1–5)</label><input id="opsOpportunityValue" type="number" min="1" max="5"></div><div class="field"><label>Effort (1–5)</label><input id="opsOpportunityEffort" type="number" min="1" max="5"></div><div class="field"><label>Readiness (1–5)</label><input id="opsOpportunityReadiness" type="number" min="1" max="5"></div><div class="field"><label>Status</label><select id="opsOpportunityStatus"><option value="backlog">Backlog</option><option value="assessing">Assessing</option><option value="recommended">Recommended</option><option value="approved">Approved</option></select></div></div><div class="field"><label>Recommendation</label><textarea id="opsOpportunityRecommendation"></textarea></div>`:''}<button class="btn primary" type="submit">Save opportunity</button></form><div style="height:12px"></div><div class="ops-list">${local.opportunities.length?local.opportunities.map(o=>`<div class="ops-item"><div class="ops-item-head"><div><h3>${esc(o.title)}</h3><p>${esc(o.problem||'')}</p></div>${badge(o.status)}</div><div class="ops-meta">${o.value_score?`<span class="ops-badge">Value ${o.value_score}/5</span>`:''}${o.effort_score?`<span class="ops-badge">Effort ${o.effort_score}/5</span>`:''}${o.readiness_score?`<span class="ops-badge">Readiness ${o.readiness_score}/5</span>`:''}</div>${o.recommendation?`<p><b>Nexus recommendation:</b> ${esc(o.recommendation)}</p>`:''}${state.admin?`<div class="ops-decision"><select class="ops-select opportunity-status" data-id="${o.id}">${['backlog','assessing','recommended','approved','declined','implemented'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></div>`:''}</div>`).join(''):empty('No improvement opportunities recorded yet.')}</div></div>`;
    $('toggleOpportunityForm').onclick=()=>{$('opsOpportunityForm').style.display=$('opsOpportunityForm').style.display==='none'?'block':'none'};
    $('opsOpportunityForm').onsubmit=async e=>{e.preventDefault();const row={company_id:state.companyId,project_id:state.projects?.[0]?.id||null,title:$('opsOpportunityTitle').value.trim(),problem:$('opsOpportunityProblem').value.trim()||null,source:state.admin?'nexus':'client',status:state.admin?$('opsOpportunityStatus').value:'backlog',value_score:state.admin&&$('opsOpportunityValue').value?+$('opsOpportunityValue').value:null,effort_score:state.admin&&$('opsOpportunityEffort').value?+$('opsOpportunityEffort').value:null,readiness_score:state.admin&&$('opsOpportunityReadiness').value?+$('opsOpportunityReadiness').value:null,recommendation:state.admin?$('opsOpportunityRecommendation').value.trim()||null:null,created_by:state.user.id};const {data,error}=await sb.from('nexus_opportunities').insert(row).select().single();if(error)return toast(error.message);if(log)await log('opportunity_created','opportunity',data.id,'Opportunity added: '+row.title);toast('Opportunity saved.');e.target.reset();await refresh()};
    root.querySelectorAll('.opportunity-status').forEach(s=>s.onchange=async()=>{const {error}=await sb.from('nexus_opportunities').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.id);if(error)return toast(error.message);await refresh()});
  }
  function renderLifecycle(){
    const root=$('opsLifecycle');if(!root)return;const p=state.projects?.[0];const stages=['Assessment','Design','Implementation','Testing','Training','Measurement','Managed Operations'];let idx=0;const st=(p?.status||'planning').toLowerCase();if(st.includes('design'))idx=1;else if(st.includes('implement')||st==='active')idx=2;else if(st.includes('test'))idx=3;else if(st.includes('train'))idx=4;else if(st.includes('measure'))idx=5;else if(st.includes('managed')||st==='complete')idx=6;
    root.innerHTML=`<div class="eyebrow">Engagement lifecycle</div><h2 style="margin:6px 0">${esc(p?.name||'Nexus Workspace')}</h2><p class="ops-section-copy">${esc(p?.summary||'Track where the engagement sits from diagnosis through ongoing operation.')}</p><div class="ops-stage">${stages.map((s,i)=>`<span class="${i===idx?'active':''}">${i+1}. ${s}</span>`).join('')}</div>`;
  }
  function renderCommand(){
    if(!state.admin)return;const root=$('opsCommandRoot');if(!root)return;const openReq=global.requests.filter(openRequest),pending=global.approvals.filter(a=>a.status==='pending'),auto=global.automations.filter(a=>['attention','action_required'].includes(a.status)),docs=global.docRequests.filter(d=>d.status==='requested');
    root.innerHTML=`<div class="ops-hero"><div class="eyebrow">Nexus Admin</div><h1>Command Center</h1><p>See what needs attention across every Nexus client before opening an individual workspace.</p></div><div class="ops-stat-grid"><div class="ops-stat"><strong>${state.companies.length}</strong><span>Client workspaces</span></div><div class="ops-stat"><strong>${openReq.length}</strong><span>Open client requests</span></div><div class="ops-stat"><strong>${pending.length}</strong><span>Pending approvals</span></div><div class="ops-stat"><strong>${auto.length+docs.length}</strong><span>System / document attention items</span></div></div><div class="ops-grid"><div class="ops-panel"><h2>Needs Nexus attention</h2><div class="ops-list">${[...auto.slice(0,4).map(x=>({t:x.name,s:'Automation · '+x.status,c:x.company_id})),...openReq.slice(0,4).map(x=>({t:x.title,s:'Client request · '+x.status,c:x.company_id})),...docs.slice(0,4).map(x=>({t:x.title,s:'Outstanding document request',c:x.company_id}))].slice(0,8).map(x=>`<button class="ops-action open-company" data-company="${x.c}" type="button"><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span><span>→</span></button>`).join('')||empty('No cross-client attention items right now.')}</div></div><div class="ops-panel"><h2>Pending client decisions</h2><div class="ops-list">${pending.length?pending.slice(0,8).map(a=>`<button class="ops-action open-company" data-company="${a.company_id}" type="button"><span><b>${esc(a.title)}</b><small>Awaiting client approval${a.due_date?' · due '+date(a.due_date):''}</small></span><span>→</span></button>`).join(''):empty('No approvals are waiting.')}</div></div></div>`;
    root.querySelectorAll('.open-company').forEach(b=>b.onclick=()=>openCompany(b.dataset.company,'overview'));
  }
  function renderClients(){
    if(!state.admin)return;const root=$('opsClientsRoot');if(!root)return;
    root.innerHTML=`<div class="ops-toolbar"><div><div class="eyebrow">Nexus Admin</div><h1>Clients</h1><p class="ops-section-copy">Open any company workspace, then review requests, systems, files, projects, and measured improvements.</p></div></div><div class="ops-client-grid">${state.companies.map(c=>{const req=global.requests.filter(r=>r.company_id===c.id&&openRequest(r)).length,ap=global.approvals.filter(a=>a.company_id===c.id&&a.status==='pending').length,au=global.automations.filter(a=>a.company_id===c.id&&['attention','action_required'].includes(a.status)).length;const health=au?'action':(req+ap?'attention':'');return `<div class="ops-client"><h3><span class="ops-health ${health}"></span>${esc(c.name)}</h3><p>${esc(c.industry||c.website||'Client workspace')}</p><div class="ops-meta"><span class="ops-badge">${req} requests</span><span class="ops-badge">${ap} approvals</span><span class="ops-badge">${au} system issues</span></div><div class="actions" style="margin-top:12px"><button class="btn primary open-client" data-company="${c.id}" type="button">Open workspace →</button></div></div>`}).join('')}</div>`;
    root.querySelectorAll('.open-client').forEach(b=>b.onclick=()=>openCompany(b.dataset.company,'overview'));
  }
  async function openCompany(cid,section='overview'){
    state.companyId=cid;if($('companySelect'))$('companySelect').value=cid;await workspace();await loadLocal();renderAll();const b=document.querySelector(`.side-nav button[data-section="${section}"]`);b?.click();
  }
  function secureLabels(){
    const sec=$('section-documents');if(!sec)return;const h=sec.querySelector('h1');if(h)h.textContent='Secure Files';const headings=[...sec.querySelectorAll('.secure-doc-section h2')];if(headings[0])headings[0].textContent=state.admin?'Requested from Client':'Requested from You';if(headings[1])headings[1].textContent=state.admin?'Files Shared with Client':'Shared with You';const sub=sec.querySelector('.secure-subhead');if(sub)sub.textContent=state.admin?'Client Submissions':'Your Recent Submissions';
  }
  function renderAll(){roleUI();renderToday();renderRequests();renderApprovals();renderAutomations();renderOpportunities();renderLifecycle();secureLabels();renderCommand();renderClients()}
  async function refresh(){
    if(refreshing||!state.user)return;refreshing=true;try{await loadLocal();if(state.admin)await loadGlobal();renderAll()}catch(e){console.error('Portal operations refresh failed',e)}finally{refreshing=false}
  }
  async function setup(){
    if(setupDone)return;setupDone=true;ensureSections();buildNav();roleUI();
    $('companySelect')?.addEventListener('change',()=>setTimeout(refresh,350));window.addEventListener('focus',()=>setTimeout(refresh,100));
    if(state.admin){const b=document.querySelector('.side-nav button[data-section="command"]');activate('command',b)}
    await refresh();
  }
  const timer=setInterval(()=>{if(state.user&&document.querySelector('.side-nav')&&$('portalApp')){clearInterval(timer);setup()}},180);
  setTimeout(()=>clearInterval(timer),20000);
}