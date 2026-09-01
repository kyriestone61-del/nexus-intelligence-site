import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm';
import {initAuthUX} from '/portal-auth.js';
import {createPortalRuntime} from '/portal-runtime-core.js';

const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const SUPABASE_KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';
const BUCKET='nexus-client-documents';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(`${v}T00:00:00`).toLocaleDateString():'—';
const dt=v=>v?new Date(v).toLocaleString():'—';
const initialState={user:null,admin:false,companies:[],companyId:null,projects:[],tasks:[],miles:[],metrics:[],docs:[],notes:[],activity:[],dataRequirements:[],docRequests:[],notificationPrefs:null,emailConfigured:false};

function toast(message){const el=$('toast');if(!el)return;el.textContent=String(message||'');el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3600)}
const runtime=createPortalRuntime(initialState,{notify:toast,getById:$});
const {state,stateController,storage,events,boundary,modals,workspaceRequests,views}=runtime;
let currentRequirementId=null,currentRequestId=null;
let identityInFlight=null,identityUserId=null;

function authMsg(message,bad=false){const el=$('authMessage');if(!el)return;el.textContent=message;el.style.color=bad?'#ffb1ba':'var(--nx-muted)'}
const pane=id=>views.authPane(id);
const show=view=>views.root(view);
function formatBytes(v){const n=Number(v||0);if(!n)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`}
function queryData(result,label){if(result?.error)throw new Error(`${label}: ${result.error.message||'query failed'}`);return result?.data||[]}
function setBusy(button,busy,label){if(!button)return;if(busy){button.dataset.nexusLabel=button.textContent;button.disabled=true;if(label)button.textContent=label}else{button.disabled=false;if(button.dataset.nexusLabel){button.textContent=button.dataset.nexusLabel;delete button.dataset.nexusLabel}}}

function bindStaticEvents(){
  events.bind($('tabSignIn'),'click','auth:signin-tab',()=>pane('signInPane'));
  events.bind($('tabCreate'),'click','auth:create-tab',()=>pane('createPane'));
  events.bind($('returnSignIn'),'click','auth:return-signin',()=>{pane('signInPane');if($('signInEmail'))$('signInEmail').value=storage.get('nexus_pending_email','');authMsg('Email verified? Sign in with the password you created.')});
  events.bind($('signOutBtn'),'click','auth:signout',boundary.wrap('sign out',()=>sb.auth.signOut()));

  events.bind($('createForm'),'submit','auth:create',boundary.wrap('account creation',async event=>{
    event.preventDefault();
    const button=$('createBtn'),email=$('createEmail')?.value.trim()||'';
    storage.setJSON('nexus_pending_company',{name:$('createCompany')?.value.trim()||'',website:$('createWebsite')?.value.trim()||''});
    storage.set('nexus_pending_email',email);
    setBusy(button,true,'Creating account…');authMsg('Submitting account…');
    let timer;
    try{
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The signup request took too long. Check your inbox before trying again.')),12000)});
      const request=sb.auth.signUp({email,password:$('createPassword')?.value||'',options:{emailRedirectTo:`${location.origin}/portal`,data:{full_name:$('createName')?.value.trim()||''}}});
      const {data,error}=await Promise.race([request,timeout]);
      if(error)throw error;
      if(data?.session){authMsg('Account created and signed in.');return}
      pane('confirmPane');if($('confirmText'))$('confirmText').textContent=`We sent a confirmation email to ${email}. Open it, click Confirm email address, then return to Nexus and sign in.`;authMsg('');
    }catch(error){authMsg(error.message||'Account creation could not be completed.',true)}
    finally{clearTimeout(timer);setBusy(button,false)}
  },{silent:true}));

  events.bind($('signInForm'),'submit','auth:signin',boundary.wrap('sign in',async event=>{
    event.preventDefault();const button=$('signInBtn');setBusy(button,true,'Signing in…');authMsg('');
    try{const {error}=await sb.auth.signInWithPassword({email:$('signInEmail')?.value.trim()||'',password:$('signInPassword')?.value||''});if(error)throw error}
    catch(error){authMsg(error.message||'Sign in failed.',true)}
    finally{setBusy(button,false)}
  },{silent:true}));

  events.bind($('onboardForm'),'submit','workspace:activate',boundary.wrap('workspace activation',async event=>{
    event.preventDefault();const button=event.submitter;setBusy(button,true,'Activating…');
    try{
      const {data,error}=await sb.rpc('nexus_activate_client_workspace',{p_name:$('onboardCompany')?.value.trim()||'',p_website:$('onboardWebsite')?.value.trim()||null,p_industry:$('onboardIndustry')?.value.trim()||null});
      if(error)throw error;
      storage.remove('nexus_pending_company');
      toast(`Workspace activated${data?.company_name?`: ${data.company_name}`:''}.`);
      await companies();
    }finally{setBusy(button,false)}
  }));

  events.bind($('companySelect'),'change','workspace:company-select',boundary.wrap('company selection',async event=>{
    const nextId=event.currentTarget?.value;if(!nextId||nextId===state.companyId)return;
    event.currentTarget.disabled=true;
    const previous=state.companyId;
    try{await workspace(nextId,{reason:'company-selector'})}
    catch(error){event.currentTarget.value=previous||'';throw error}
    finally{event.currentTarget.disabled=false}
  },{rethrow:false}));

  events.bind($('uploadForm'),'submit','documents:upload',boundary.wrap('secure upload',handleUpload));
  events.bind($('taskForm'),'submit','tasks:create',boundary.wrap('action creation',handleTaskCreate));
  events.bind($('metricForm'),'submit','metrics:create',boundary.wrap('measurement creation',handleMetricCreate));
  events.bind($('milestoneForm'),'submit','milestones:create',boundary.wrap('milestone creation',handleMilestoneCreate));
  events.bind($('documentRequestForm'),'submit','documents:request',boundary.wrap('document request',handleDocumentRequest));
  events.bind($('readAllBtn'),'click','notifications:read-all',boundary.wrap('mark notifications read',markAllRead));
  events.bind($('alertsBtn'),'click','notifications:browser',boundary.wrap('browser notification permission',requestBrowserAlerts));

  for(const [buttonId,modalId] of [['newTaskBtn','taskModal'],['newMetricBtn','metricModal'],['newMilestoneBtn','milestoneModal'],['newDocumentRequestBtn','documentRequestModal']]){
    events.bind($(buttonId),'click',`modal:open:${modalId}`,event=>modals.open(modalId,event.currentTarget));
  }
  document.querySelectorAll('.modal').forEach(modal=>modals.register(modal,modal.id));
  document.querySelectorAll('.side-nav button[data-section]').forEach(button=>events.bind(button,'click',`nav:${button.dataset.section}`,()=>views.section(button.dataset.section)));
}

async function ensureProfile(){
  const user=state.user;if(!user)return;
  const result=await sb.from('nexus_profiles').select('user_id').eq('user_id',user.id).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data){const insert=await sb.from('nexus_profiles').insert({user_id:user.id,full_name:user.user_metadata?.full_name||''});if(insert.error)throw insert.error}
}

async function resolveAdmin(){
  try{const {data,error}=await sb.rpc('nexus_is_platform_admin');if(error)throw error;return data===true}
  catch(error){
    console.warn('Canonical Nexus administrator check failed; using compatibility fallback.',error?.message||error);
    const fallback=await sb.from('nexus_platform_admins').select('user_id').eq('user_id',state.user.id).maybeSingle();
    if(fallback.error)throw fallback.error;return !!fallback.data;
  }
}

async function identity(userOverride=null){
  const user=userOverride||(await sb.auth.getUser()).data.user;
  if(!user){stateController.patch({user:null,admin:false,companies:[],companyId:null},'auth:signed-out');show('auth');return}
  if(identityInFlight&&identityUserId===user.id)return identityInFlight;
  identityUserId=user.id;
  identityInFlight=(async()=>{
    stateController.patch({user},'auth:user');
    await ensureProfile();
    const admin=await resolveAdmin();
    stateController.patch({admin},'auth:authorization');
    await companies();
  })();
  try{await identityInFlight}finally{identityInFlight=null}
}

async function companies(){
  let companyRows=[];
  if(state.admin){companyRows=queryData(await sb.from('nexus_companies').select('*').order('created_at',{ascending:false}),'Companies')}
  else{
    const members=queryData(await sb.from('nexus_company_members').select('company_id').eq('user_id',state.user.id).eq('active',true),'Company membership');
    const ids=members.map(row=>row.company_id);
    if(ids.length)companyRows=queryData(await sb.from('nexus_companies').select('*').in('id',ids),'Companies');
  }
  stateController.patch({companies:companyRows},'workspace:companies');
  if(!companyRows.length&&!state.admin){
    show('onboard');const pending=storage.getJSON('nexus_pending_company',{});if($('onboardCompany'))$('onboardCompany').value=pending?.name||'';if($('onboardWebsite'))$('onboardWebsite').value=pending?.website||'';return;
  }
  show('portal');
  if($('roleLabel'))$('roleLabel').textContent=state.admin?'Nexus administrator':'Client workspace';
  if($('newMilestoneBtn'))$('newMilestoneBtn').style.display=state.admin?'inline-flex':'none';
  if($('newDocumentRequestBtn'))$('newDocumentRequestBtn').style.display=state.admin?'inline-flex':'none';
  const select=$('companySelect');
  if(select){select.innerHTML=companyRows.map(company=>`<option value="${company.id}">${esc(company.name)}</option>`).join('');select.style.display=companyRows.length>1||state.admin?'block':'none'}
  const preferred=companyRows.some(company=>company.id===state.companyId)?state.companyId:companyRows[0]?.id||null;
  if(preferred){if(select)select.value=preferred;await workspace(preferred,{reason:'company-list'})}
}

async function fetchEmailStatus(){
  try{const response=await fetch('/api/email-status',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();return !!data.configured}
  catch(error){console.warn('Nexus email status unavailable',error);return false}
}

async function fetchNotificationPrefs(companyId){
  if(!state.user||!companyId)return null;
  const result=await sb.from('nexus_notification_preferences').select('*').eq('company_id',companyId).eq('user_id',state.user.id).maybeSingle();
  if(result.error)throw result.error;return result.data||null;
}

async function fetchDataRequirements(project){
  if(!project)return [];
  const rows=queryData(await sb.from('nexus_project_data_requirements').select('*').eq('project_id',project.id).order('created_at'),'Data requirements');
  const ids=[...new Set(rows.map(row=>row.catalog_id).filter(Boolean))];
  let catalog=[];
  if(ids.length)catalog=queryData(await sb.from('nexus_data_requirement_catalog').select('*').in('id',ids),'Data requirement catalog');
  const byId=Object.fromEntries(catalog.map(item=>[item.id,item]));
  return rows.map(row=>({...row,catalog:byId[row.catalog_id]||null})).sort((a,b)=>(a.catalog?.sort_order||999)-(b.catalog?.sort_order||999));
}

async function workspace(companyId=state.companyId,{reason='refresh'}={}){
  if(!companyId)return;
  const token=workspaceRequests.begin();
  const company=state.companies.find(item=>item.id===companyId);
  const queries=await Promise.all([
    sb.from('nexus_projects').select('*').eq('company_id',companyId).order('created_at',{ascending:false}),
    sb.from('nexus_tasks').select('*').eq('company_id',companyId).order('created_at',{ascending:false}),
    sb.from('nexus_milestones').select('*').eq('company_id',companyId).order('sort_order').order('due_date'),
    sb.from('nexus_metrics').select('*').eq('company_id',companyId).order('updated_at',{ascending:false}),
    sb.from('nexus_documents').select('*').eq('company_id',companyId).order('created_at',{ascending:false}),
    sb.from('nexus_notifications').select('*').eq('company_id',companyId).order('created_at',{ascending:false}),
    sb.from('nexus_activity_log').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
    sb.from('nexus_document_requests').select('*').eq('company_id',companyId).order('created_at',{ascending:false})
  ]);
  const projects=queryData(queries[0],'Projects');
  const next={
    companyId,
    projects,
    tasks:queryData(queries[1],'Tasks'),
    miles:queryData(queries[2],'Milestones'),
    metrics:queryData(queries[3],'Metrics'),
    docs:queryData(queries[4],'Documents'),
    notes:queryData(queries[5],'Notifications').filter(item=>!item.user_id||item.user_id===state.user?.id),
    activity:queryData(queries[6],'Activity'),
    docRequests:queryData(queries[7],'Document requests')
  };
  const [dataRequirements,notificationPrefs,emailConfigured]=await Promise.all([fetchDataRequirements(projects[0]||null),fetchNotificationPrefs(companyId),fetchEmailStatus()]);
  if(!workspaceRequests.isCurrent(token))return;
  Object.assign(next,{dataRequirements,notificationPrefs,emailConfigured});
  stateController.patch(next,`workspace:${reason}`);
  const select=$('companySelect');if(select&&select.value!==companyId)select.value=companyId;
  if($('companyMini'))$('companyMini').innerHTML=`<div class="kicker">Active workspace</div><b>${esc(company?.name||'Workspace')}</b><div class="small">${esc(company?.industry||company?.website||'Nexus client workspace')}</div>`;
  if($('workspaceTitle'))$('workspaceTitle').textContent=company?.name||'Company workspace';
  render();
  window.dispatchEvent(new CustomEvent('nexus:workspace-ready',{detail:{companyId,revision:stateController.revision}}));
}

function taskRow(item){return `<div class="row"><div class="grow"><span class="pill">${esc(item.assignee)}</span> <span class="pill">${esc(item.priority)}</span><br><b>${esc(item.title)}</b><div class="small">${esc(item.description||'')}</div><div class="small">${item.due_date?'Due '+date(item.due_date):'No fixed due date'}</div></div><select class="task-status" data-id="${item.id}" aria-label="Status for ${esc(item.title)}">${[['open','Open'],['in_progress','In progress'],['blocked','Blocked'],['done','Done']].map(([value,label])=>`<option value="${value}" ${item.status===value?'selected':''}>${label}</option>`).join('')}</select></div>`}
function docRow(item){const source=item.source_role==='nexus'?'Nexus':'Client';return `<div class="row"><div class="grow"><span class="pill">${esc(item.category)}</span> <span class="pill">${source}</span> <span class="pill">v${item.version_number}</span><br><b>${esc(item.file_name)}</b><div class="small">${esc(item.note||'')}</div><div class="small">${dt(item.created_at)}${item.size_bytes?' · '+formatBytes(item.size_bytes):''}</div></div><button class="btn secondary download" data-id="${item.id}" type="button">Download ↓</button></div>`}
function mileRow(item){return `<div class="mile"><span class="pill">${esc(item.status)}</span><br><b>${esc(item.title)}</b><div class="small">${esc(item.description||'')}</div><div class="small">${date(item.start_date)} → ${date(item.due_date)}</div></div>`}

function render(){
  try{
    const openTasks=state.tasks.filter(item=>item.status!=='done'),activeMiles=state.miles.filter(item=>item.status!=='complete'),unread=state.notes.filter(item=>!item.read_at);
    if($('sTasks'))$('sTasks').textContent=openTasks.length;if($('sDocs'))$('sDocs').textContent=state.docs.length;if($('sMiles'))$('sMiles').textContent=activeMiles.length;if($('sNotes'))$('sNotes').textContent=unread.length;
    if($('overviewTasks'))$('overviewTasks').innerHTML=openTasks.slice(0,5).map(taskRow).join('')||'<div class="empty">No open actions.</div>';
    if($('overviewDocs'))$('overviewDocs').innerHTML=state.docs.slice(0,5).map(docRow).join('')||'<div class="empty">No documents yet.</div>';
    if($('overviewTimeline'))$('overviewTimeline').innerHTML=state.miles.slice(0,4).map(mileRow).join('')||'<div class="empty">No milestones yet.</div>';
    if($('taskList'))$('taskList').innerHTML=state.tasks.map(taskRow).join('')||'<div class="empty">No tasks yet.</div>';
    if($('documentList'))$('documentList').innerHTML=state.docs.map(docRow).join('')||'<div class="empty">No files have been shared yet.</div>';
    if($('milestoneList'))$('milestoneList').innerHTML=state.miles.map(mileRow).join('')||'<div class="empty">No milestones yet.</div>';
    const project=state.projects[0];if($('projectBox'))$('projectBox').innerHTML=project?`<span class="pill">${esc(project.status)}</span><h3>${esc(project.name)}</h3><p class="small">${esc(project.summary||project.service_type||'Nexus engagement workspace')}</p><div class="small">${date(project.start_date)} → ${date(project.target_end_date)}</div>`:'<div class="empty">No project configured.</div>';
    if($('metricList'))$('metricList').innerHTML=state.metrics.map(item=>`<div class="metric-card"><span class="pill">${esc(item.unit||'metric')}</span><h3>${esc(item.name)}</h3><div class="small">Baseline</div><b style="font-size:22px">${item.baseline_value??'—'} ${esc(item.unit||'')}</b><div class="small" style="margin-top:8px">Current: ${item.current_value??'—'} · Target: ${item.target_value??'—'}</div><p class="small">${esc(item.measurement_method||'Measurement method not yet documented.')}</p></div>`).join('')||'<div class="empty">No measurements yet.</div>';
    if($('notificationList'))$('notificationList').innerHTML=state.notes.map(item=>`<div class="row"><div class="grow"><span class="pill">${esc(item.notification_type)}</span><br><b>${esc(item.title)}</b><div class="small">${esc(item.message||'')}</div><div class="small">${dt(item.created_at)}</div></div>${item.read_at?'':'<span class="pill">new</span>'}</div>`).join('')||'<div class="empty">No notifications yet.</div>';
    if($('activityList'))$('activityList').innerHTML=state.activity.map(item=>`<div class="row"><div class="grow"><b>${esc(item.summary||item.action)}</b><div class="small">${esc(item.entity_type||'activity')}</div></div><div class="small">${dt(item.created_at)}</div></div>`).join('')||'<div class="empty">No activity yet.</div>';
    renderDataRoom();renderEmailPrefs();bindRenderedControls();
  }catch(error){console.error('Nexus base workspace render failed',error);toast('The workspace could not finish rendering. Refresh and try again.')}
}

function addressedStatus(status){return ['ready','uploaded','build_with_nexus','not_available','not_applicable'].includes(status)}
function detail(label,text,extra=''){return `<div class="req-detail ${extra}"><b>${esc(label)}</b><p>${esc(text||'—')}</p></div>`}
function requirementCard(row){
  const catalog=row.catalog||{},fileLike=['file','export'].includes(catalog.input_type),answerLike=['answer','list','access_context'].includes(catalog.input_type),addressed=addressedStatus(row.status);
  let html=`<article class="requirement-card ${addressed?'addressed':''}"><div class="requirement-head"><div><span class="pill">${esc(catalog.category||'Preparation')}</span> <span class="pill">${esc((catalog.importance||'helpful').replaceAll('_',' '))}</span></div><span class="req-status ${esc(row.status)}">${esc(String(row.status||'open').replaceAll('_',' '))}</span></div><h3>${esc(catalog.title||'Preparation item')}</h3>`;
  html+=detail('Why Nexus needs it',catalog.why_needed||'This helps Nexus understand the current state without guessing.');html+=detail('How to find it',catalog.how_to_find||'Ask the person closest to the workflow or check the systems where the work happens.');html+=detail('Good examples',catalog.good_examples||'A representative example is enough.');html+=detail('Don’t have it?',catalog.if_missing||'That is okay. Nexus can help build the minimum useful version with you.','missing');if(row.client_note)html+=detail('Your note / response',row.client_note);
  if(!state.admin){html+='<div class="req-actions">';if(fileLike)html+=`<button class="btn primary req-upload" data-id="${row.id}" data-title="${esc(catalog.title||'this item')}" type="button">Upload evidence</button>`;if(answerLike)html+=`<button class="btn secondary req-answer-btn" data-id="${row.id}" type="button">Answer here</button>`;html+=`<button class="btn secondary req-build" data-id="${row.id}" type="button">Build with Nexus</button><button class="btn secondary req-na" data-id="${row.id}" type="button">Not applicable</button></div><div class="req-answer" data-id="${row.id}"><textarea id="req-note-${row.id}" placeholder="Be specific. A short list or clear explanation is enough.">${esc(row.client_note||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn primary req-save" data-id="${row.id}" type="button">Save response</button></div></div>`}
  return html+'</article>';
}
function documentRequestCard(row){let html='<div class="row"><div class="grow"><span class="pill">Requested by Nexus</span>';if(row.due_date)html+=` <span class="pill">Due ${date(row.due_date)}</span>`;html+=`<br><b>${esc(row.title)}</b><div class="small">${esc(row.purpose||'')}</div>`;if(row.examples)html+=`<div class="small"><b>Examples:</b> ${esc(row.examples)}</div>`;if(row.redaction_guidance)html+=`<div class="small"><b>Privacy:</b> ${esc(row.redaction_guidance)}</div>`;html+='<div class="small">If you do not have this item, tell Nexus—we can help create or reconstruct the minimum useful version.</div></div>';if(!state.admin)html+=`<button class="btn primary upload-request" data-id="${row.id}" data-title="${esc(row.title)}" type="button">Upload →</button>`;return html+'</div>'}
function renderDataRoom(){const root=$('dataRoomRequirements');if(!root)return;const total=state.dataRequirements.length,addressed=state.dataRequirements.filter(row=>addressedStatus(row.status)).length,pct=total?Math.round(addressed/total*100):0;if($('dataRoomProgress'))$('dataRoomProgress').innerHTML=`<div class="data-room-meter-track"><div class="data-room-meter-fill" style="width:${pct}%"></div></div><strong>${addressed} of ${total||'—'} preparation items addressed</strong>`;root.innerHTML=state.dataRequirements.length?state.dataRequirements.map(requirementCard).join(''):'<div class="empty">Nexus has not assigned a preparation checklist to this project yet.</div>';const requestRoot=$('explicitDocumentRequests'),openRequests=state.docRequests.filter(row=>row.status==='requested');if(requestRoot)requestRoot.innerHTML=openRequests.length?`<div class="request-strip">${openRequests.map(documentRequestCard).join('')}</div>`:'<div class="empty">No additional one-off document requests are outstanding.</div>'}

function renderEmailPrefs(){const root=$('emailPreferencePanel');if(!root)return;const pref=state.notificationPrefs||{email_enabled:true,task_emails:true,approval_emails:true,document_request_emails:true,digest_cadence:'daily'};root.innerHTML=`<div class="email-control"><div class="toolbar" style="margin-bottom:0"><div><div class="kicker">Notification routing</div><h3 style="margin:4px 0">Stay clear on what Nexus needs from you.</h3></div><span class="email-status ${state.emailConfigured?'live':''}">${state.emailConfigured?'Email delivery connected':'Email delivery provider connection pending'}</span></div><details class="nexus-progressive-help"><summary>Notification details</summary><p class="small">Choose which action notices reach email. In-app activity remains available in Nexus.</p></details><div class="pref-grid"><label class="pref-toggle"><input id="prefEmail" type="checkbox" ${pref.email_enabled?'checked':''}><span><b>Email notifications</b><span>Master email preference.</span></span></label><label class="pref-toggle"><input id="prefTasks" type="checkbox" ${pref.task_emails?'checked':''}><span><b>Tasks</b><span>New client actions.</span></span></label><label class="pref-toggle"><input id="prefApprovals" type="checkbox" ${pref.approval_emails?'checked':''}><span><b>Approvals</b><span>Decisions that need you.</span></span></label><label class="pref-toggle"><input id="prefDocs" type="checkbox" ${pref.document_request_emails?'checked':''}><span><b>File requests</b><span>Evidence Nexus requests.</span></span></label></div><div class="field" style="max-width:260px;margin-top:10px"><label>Action-summary cadence</label><select id="prefDigest"><option value="daily" ${pref.digest_cadence==='daily'?'selected':''}>Daily when actions exist</option><option value="weekly" ${pref.digest_cadence==='weekly'?'selected':''}>Weekly</option><option value="off" ${pref.digest_cadence==='off'?'selected':''}>Off</option></select></div><div class="actions" style="margin-top:12px"><button id="savePrefs" class="btn secondary" type="button">Save preferences</button></div></div>`}

function bindRenderedControls(){
  document.querySelectorAll('.task-status').forEach(control=>events.bind(control,'change',`task-status:${control.dataset.id}`,boundary.wrap('task status update',async()=>{const result=await sb.from('nexus_tasks').update({status:control.value,updated_at:new Date().toISOString()}).eq('id',control.dataset.id);if(result.error)throw result.error;await workspace()})));
  document.querySelectorAll('.download').forEach(button=>events.bind(button,'click',`download:${button.dataset.id}`,()=>downloadDocument(button.dataset.id)));
  document.querySelectorAll('.req-upload').forEach(button=>events.bind(button,'click',`requirement-upload:${button.dataset.id}`,()=>prepareUpload({requirementId:button.dataset.id,title:button.dataset.title})));
  document.querySelectorAll('.req-answer-btn').forEach(button=>events.bind(button,'click',`requirement-answer:${button.dataset.id}`,()=>document.querySelector(`.req-answer[data-id="${CSS.escape(button.dataset.id)}"]`)?.classList.toggle('open')));
  document.querySelectorAll('.req-save').forEach(button=>events.bind(button,'click',`requirement-save:${button.dataset.id}`,boundary.wrap('preparation response save',()=>saveRequirementAnswer(button.dataset.id))));
  document.querySelectorAll('.req-build').forEach(button=>events.bind(button,'click',`requirement-build:${button.dataset.id}`,boundary.wrap('preparation status update',()=>setRequirementStatus(button.dataset.id,'build_with_nexus'))));
  document.querySelectorAll('.req-na').forEach(button=>events.bind(button,'click',`requirement-na:${button.dataset.id}`,boundary.wrap('preparation status update',()=>setRequirementStatus(button.dataset.id,'not_applicable'))));
  document.querySelectorAll('.upload-request').forEach(button=>events.bind(button,'click',`request-upload:${button.dataset.id}`,()=>prepareUpload({requestId:button.dataset.id,title:button.dataset.title})));
  events.bind($('savePrefs'),'click','preferences:save',boundary.wrap('notification preferences save',saveNotificationPrefs));
}

async function saveRequirementAnswer(id){const note=$(`req-note-${id}`)?.value.trim();if(!note){toast('Add a response before saving.');return}const result=await sb.from('nexus_project_data_requirements').update({client_note:note,status:'ready',updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('id',id);if(result.error)throw result.error;toast('Preparation response saved.');await workspace()}
async function setRequirementStatus(id,status){const result=await sb.from('nexus_project_data_requirements').update({status,updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('id',id);if(result.error)throw result.error;toast(status==='build_with_nexus'?'Marked for Nexus to help build.':'Preparation item updated.');await workspace()}
function prepareUpload({requirementId=null,requestId=null,title=''}){try{currentRequirementId=requirementId;currentRequestId=requestId;const box=$('uploadContext');if(!box)return;box.classList.add('show');box.innerHTML=`<b>Upload for:</b> ${esc(title)} <button id="clearUploadContext" class="btn secondary" type="button" style="min-height:30px;padding:0 9px;margin-left:8px">Clear</button>`;if($('docNote'))$('docNote').value=$('docNote').value||`Evidence for ${title}`;events.bind($('clearUploadContext'),'click','upload-context:clear',clearUploadContext);box.scrollIntoView({behavior:'smooth',block:'center'});$('docFile')?.focus()}catch(error){console.error('Nexus upload preparation failed',error);toast('The upload form could not be prepared.')}}
function clearUploadContext(){currentRequirementId=null;currentRequestId=null;const box=$('uploadContext');if(box){box.classList.remove('show');box.innerHTML=''}}

async function saveNotificationPrefs(){const row={company_id:state.companyId,user_id:state.user.id,email_enabled:!!$('prefEmail')?.checked,task_emails:!!$('prefTasks')?.checked,approval_emails:!!$('prefApprovals')?.checked,document_request_emails:!!$('prefDocs')?.checked,digest_cadence:$('prefDigest')?.value||'daily',updated_at:new Date().toISOString()};const result=await sb.from('nexus_notification_preferences').upsert(row,{onConflict:'company_id,user_id'});if(result.error)throw result.error;toast('Notification preferences saved.');stateController.patch({notificationPrefs:await fetchNotificationPrefs(state.companyId)},'preferences:saved');renderEmailPrefs();bindRenderedControls()}

async function downloadDocument(id){const doc=state.docs.find(item=>item.id===id);if(!doc){toast('Document record not found.');return}const buttons=[...document.querySelectorAll(`.download[data-id="${CSS.escape(id)}"]`)];buttons.forEach(button=>{button.disabled=true;button.textContent='Preparing…'});try{const signed=await sb.storage.from(BUCKET).createSignedUrl(doc.storage_path,120,{download:doc.file_name});if(!signed.error&&signed.data?.signedUrl){const anchor=document.createElement('a');anchor.href=signed.data.signedUrl;anchor.download=doc.file_name;anchor.rel='noopener';document.body.appendChild(anchor);anchor.click();anchor.remove();return}const fallback=await sb.storage.from(BUCKET).download(doc.storage_path);if(fallback.error)throw fallback.error;const url=URL.createObjectURL(fallback.data),anchor=document.createElement('a');anchor.href=url;anchor.download=doc.file_name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2500)}catch(error){console.error('Document download failed',error);toast(`Download failed: ${error.message||'access could not be verified'}`)}finally{buttons.forEach(button=>{button.disabled=false;button.textContent='Download ↓'})}}

async function handleUpload(event){event.preventDefault();const form=event.currentTarget,file=$('docFile')?.files?.[0];if(!file)return;if(file.size>26214400){toast('File exceeds the 25 MB limit.');return}const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${state.companyId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;const requirement=state.dataRequirements.find(row=>row.id===currentRequirementId),request=state.docRequests.find(row=>row.id===currentRequestId),sensitivity=requirement?.catalog?.sensitivity||request?.sensitivity||'standard';const upload=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(upload.error)throw upload.error;try{const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category:$('docCategory')?.value||'General',status:'shared',note:$('docNote')?.value.trim()||null,uploaded_by:state.user.id,sensitivity,request_id:currentRequestId||null,data_requirement_id:currentRequirementId||null,document_area:state.admin?'nexus_deliverable':'client_submission',source_role:state.admin?'nexus':'client'};const insert=await sb.from('nexus_documents').insert(row).select().single();if(insert.error)throw insert.error;await log('document_uploaded','document',insert.data.id,`${state.admin?'Nexus':'Client'} uploaded ${file.name}`);form.reset();clearUploadContext();toast('Document uploaded securely.');await workspace()}catch(error){await sb.storage.from(BUCKET).remove([path]).catch(()=>{});throw error}}
async function handleTaskCreate(event){event.preventDefault();const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,title:$('taskTitle')?.value.trim()||'',description:$('taskDescription')?.value.trim()||null,assignee:$('taskAssignee')?.value||'client',status:'open',priority:$('taskPriority')?.value||'normal',due_date:$('taskDue')?.value||null,created_by:state.user.id};const result=await sb.from('nexus_tasks').insert(row).select().single();if(result.error)throw result.error;await log('task_created','task',result.data.id,`Task created: ${row.title}`);modals.close('taskModal');event.currentTarget.reset();await workspace()}
async function handleMetricCreate(event){event.preventDefault();const num=value=>value===''?null:Number(value),row={company_id:state.companyId,project_id:state.projects[0]?.id||null,name:$('metricName')?.value.trim()||'',unit:$('metricUnit')?.value.trim()||null,baseline_value:num($('metricBaseline')?.value||''),current_value:num($('metricCurrent')?.value||''),target_value:num($('metricTarget')?.value||''),measurement_method:$('metricMethod')?.value.trim()||null,measured_at:new Date().toISOString(),created_by:state.user.id};const result=await sb.from('nexus_metrics').insert(row).select().single();if(result.error)throw result.error;await log('measurement_added','metric',result.data.id,`Measurement added: ${row.name}`);modals.close('metricModal');event.currentTarget.reset();await workspace()}
async function handleMilestoneCreate(event){event.preventDefault();if(!state.admin)return;const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,title:$('milestoneTitle')?.value.trim()||'',description:$('milestoneDescription')?.value.trim()||null,start_date:$('milestoneStart')?.value||null,due_date:$('milestoneDue')?.value||null,status:$('milestoneStatus')?.value||'planned',created_by:state.user.id};const result=await sb.from('nexus_milestones').insert(row).select().single();if(result.error)throw result.error;await log('milestone_created','milestone',result.data.id,`Milestone added: ${row.title}`);modals.close('milestoneModal');event.currentTarget.reset();await workspace()}
async function handleDocumentRequest(event){event.preventDefault();if(!state.admin)return;const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,title:$('requestDocTitle')?.value.trim()||'',purpose:$('requestDocPurpose')?.value.trim()||null,examples:$('requestDocExamples')?.value.trim()||null,redaction_guidance:$('requestDocPrivacy')?.value.trim()||null,sensitivity:$('requestDocSensitivity')?.value||'standard',due_date:$('requestDocDue')?.value||null,requested_by:state.user.id};const result=await sb.from('nexus_document_requests').insert(row).select().single();if(result.error)throw result.error;await log('document_requested','document_request',result.data.id,`Document requested: ${row.title}`);modals.close('documentRequestModal');event.currentTarget.reset();toast('Document request sent to the client workspace.');await workspace()}
async function log(action,type,id,summary){try{const result=await sb.from('nexus_activity_log').insert({company_id:state.companyId,actor_id:state.user.id,action,entity_type:type,entity_id:id,summary});if(result.error)console.warn('Nexus activity log write failed',result.error)}catch(error){console.warn('Nexus activity log write failed',error)}}
async function markAllRead(){const ids=state.notes.filter(item=>!item.read_at&&(!item.user_id||item.user_id===state.user.id)).map(item=>item.id);if(ids.length){const result=await sb.from('nexus_notifications').update({read_at:new Date().toISOString()}).in('id',ids);if(result.error)throw result.error}await workspace()}
async function requestBrowserAlerts(){if(!('Notification'in window)){toast('Browser alerts are unavailable here.');return}const permission=await Notification.requestPermission();toast(permission==='granted'?'Browser alerts enabled.':'Browser alerts were not enabled.')}

bindStaticEvents();
window.NexusPortal={sb,state,stateController,runtime,$,toast,workspace,log,downloadDocument};
await initAuthUX({sb,$,pane,show,runtime});

async function handleAuthSession(session){
  if(session?.user){await identity(session.user);return}
  workspaceRequests.invalidate();identityUserId=null;stateController.patch({user:null,admin:false,companies:[],companyId:null,projects:[],tasks:[],miles:[],metrics:[],docs:[],notes:[],activity:[],dataRequirements:[],docRequests:[]},'auth:signed-out');show('auth');
}

sb.auth.onAuthStateChange((_event,session)=>{queueMicrotask(()=>boundary.run('authentication state change',()=>handleAuthSession(session),{silent:true}))});
const sessionResult=await sb.auth.getSession();if(sessionResult.error)console.warn('Initial Nexus session lookup failed',sessionResult.error);await boundary.run('initial portal session',()=>handleAuthSession(sessionResult.data?.session||null),{silent:false});
