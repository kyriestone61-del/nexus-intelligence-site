import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm';
import {initAuthUX} from '/portal-auth.js';
import {initOps} from '/portal-ops.js';

const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const SUPABASE_KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';
const BUCKET='nexus-client-documents';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v+'T00:00:00').toLocaleDateString():'—';
const dt=v=>v?new Date(v).toLocaleString():'—';
const state={user:null,admin:false,companies:[],companyId:null,projects:[],tasks:[],miles:[],metrics:[],docs:[],notes:[],activity:[],dataRequirements:[],docRequests:[],notificationPrefs:null,emailConfigured:false};
let currentRequirementId=null,currentRequestId=null;

function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3600)}
function authMsg(message,bad=false){const el=$('authMessage');if(!el)return;el.textContent=message;el.style.color=bad?'#ffb1ba':'var(--nx-muted)'}
function pane(id){['signInPane','createPane','confirmPane'].forEach(x=>$(x)?.classList.toggle('active',x===id));$('tabSignIn')?.classList.toggle('active',id==='signInPane');$('tabCreate')?.classList.toggle('active',id==='createPane')}
function show(view){if($('authView'))$('authView').style.display=view==='auth'?'block':'none';if($('onboardView'))$('onboardView').style.display=view==='onboard'?'block':'none';if($('portalApp'))$('portalApp').style.display=view==='portal'?'block':'none'}
function formatBytes(v){const n=Number(v||0);if(!n)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`}

$('tabSignIn')?.addEventListener('click',()=>pane('signInPane'));
$('tabCreate')?.addEventListener('click',()=>pane('createPane'));
$('returnSignIn')?.addEventListener('click',()=>{pane('signInPane');$('signInEmail').value=localStorage.getItem('nexus_pending_email')||'';authMsg('Email verified? Sign in with the password you created.')});
$('signOutBtn')?.addEventListener('click',()=>sb.auth.signOut());

$('createForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('createBtn'),email=$('createEmail').value.trim();
  localStorage.setItem('nexus_pending_company',JSON.stringify({name:$('createCompany').value.trim(),website:$('createWebsite').value.trim()}));
  localStorage.setItem('nexus_pending_email',email);
  btn.disabled=true;btn.textContent='Creating account…';authMsg('Submitting account…');
  let timer;
  try{
    const timeout=new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('The signup request took too long. Check your inbox before trying again.')),12000));
    const request=sb.auth.signUp({email,password:$('createPassword').value,options:{emailRedirectTo:`${location.origin}/portal`,data:{full_name:$('createName').value.trim()}}});
    const {data,error}=await Promise.race([request,timeout]);
    if(error)throw error;
    if(data?.session){authMsg('Account created and signed in.');return}
    pane('confirmPane');$('confirmText').textContent=`We sent a confirmation email to ${email}. Open it, click Confirm email address, then return to Nexus and sign in.`;authMsg('');
  }catch(error){authMsg(error.message||'Account creation could not be completed.',true)}
  finally{clearTimeout(timer);btn.disabled=false;btn.textContent='Create account'}
});

$('signInForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const btn=$('signInBtn');btn.disabled=true;btn.textContent='Signing in…';authMsg('');
  try{const {error}=await sb.auth.signInWithPassword({email:$('signInEmail').value.trim(),password:$('signInPassword').value});if(error)throw error}
  catch(error){authMsg(error.message||'Sign in failed.',true)}
  finally{btn.disabled=false;btn.textContent='Sign in'}
});

async function ensureProfile(){const {data}=await sb.from('nexus_profiles').select('user_id').eq('user_id',state.user.id).maybeSingle();if(!data)await sb.from('nexus_profiles').insert({user_id:state.user.id,full_name:state.user.user_metadata?.full_name||''})}
async function identity(){state.user=(await sb.auth.getUser()).data.user;if(!state.user){show('auth');return}await ensureProfile();state.admin=!!(await sb.from('nexus_platform_admins').select('user_id').eq('user_id',state.user.id).maybeSingle()).data;await companies()}

async function companies(){
  if(state.admin){const {data,error}=await sb.from('nexus_companies').select('*').order('created_at',{ascending:false});if(error)throw error;state.companies=data||[]}
  else{
    const {data:members,error}=await sb.from('nexus_company_members').select('company_id').eq('user_id',state.user.id).eq('active',true);if(error)throw error;
    const ids=(members||[]).map(x=>x.company_id);
    if(ids.length){const {data,error:e}=await sb.from('nexus_companies').select('*').in('id',ids);if(e)throw e;state.companies=data||[]}else state.companies=[];
  }
  if(!state.companies.length&&!state.admin){show('onboard');try{const pending=JSON.parse(localStorage.getItem('nexus_pending_company')||'{}');$('onboardCompany').value=pending.name||'';$('onboardWebsite').value=pending.website||''}catch{}return}
  show('portal');$('roleLabel').textContent=state.admin?'Nexus administrator':'Client workspace';$('newMilestoneBtn').style.display=state.admin?'inline-flex':'none';$('newDocumentRequestBtn').style.display=state.admin?'inline-flex':'none';
  $('companySelect').innerHTML=state.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');$('companySelect').style.display=state.companies.length>1||state.admin?'block':'none';
  const keep=state.companies.some(c=>c.id===state.companyId)?state.companyId:null;state.companyId=keep||state.companies[0]?.id||null;
  if(state.companyId){$('companySelect').value=state.companyId;await workspace()}
}

$('onboardForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;if(button)button.disabled=true;
  try{
    const {data:company,error}=await sb.from('nexus_companies').insert({name:$('onboardCompany').value.trim(),website:$('onboardWebsite').value.trim()||null,industry:$('onboardIndustry').value.trim()||null,created_by:state.user.id}).select().single();if(error)throw error;
    const {error:memberError}=await sb.from('nexus_company_members').insert({company_id:company.id,user_id:state.user.id,member_role:'owner'});if(memberError)throw memberError;
    const {error:projectError}=await sb.from('nexus_projects').insert({company_id:company.id,name:'Nexus Opportunity Assessment',service_type:'AI Opportunity Assessment / Intake',service_slug:'ai-opportunity-assessment',status:'planning',summary:'Initial Nexus discovery, evidence preparation, and opportunity definition.',created_by:state.user.id});if(projectError)throw projectError;
    localStorage.removeItem('nexus_pending_company');toast('Workspace created. Your preparation checklist is ready.');await companies();
  }catch(error){toast(error.message||'Workspace setup failed.')}
  finally{if(button)button.disabled=false}
});
$('companySelect')?.addEventListener('change',async()=>{state.companyId=$('companySelect').value;await workspace()});

async function loadDataRequirements(){
  const project=state.projects[0];if(!project){state.dataRequirements=[];return}
  const {data:rows,error}=await sb.from('nexus_project_data_requirements').select('*').eq('project_id',project.id).order('created_at');
  if(error){console.error(error);state.dataRequirements=[];return}
  const ids=[...new Set((rows||[]).map(r=>r.catalog_id))];let catalog=[];
  if(ids.length){const res=await sb.from('nexus_data_requirement_catalog').select('*').in('id',ids);catalog=res.data||[]}
  const byId=Object.fromEntries(catalog.map(c=>[c.id,c]));
  state.dataRequirements=(rows||[]).map(r=>({...r,catalog:byId[r.catalog_id]||null})).sort((a,b)=>(a.catalog?.sort_order||999)-(b.catalog?.sort_order||999));
}
async function loadEmailStatus(){try{const r=await fetch('/api/email-status',{cache:'no-store'});const d=await r.json();state.emailConfigured=!!d.configured}catch{state.emailConfigured=false}}
async function loadNotificationPrefs(){if(!state.user||!state.companyId){state.notificationPrefs=null;return}const {data}=await sb.from('nexus_notification_preferences').select('*').eq('company_id',state.companyId).eq('user_id',state.user.id).maybeSingle();state.notificationPrefs=data||null}

async function workspace(){
  const company=state.companies.find(x=>x.id===state.companyId);$('companyMini').innerHTML=`<div class="kicker">Active workspace</div><b>${esc(company?.name||'Workspace')}</b><div class="small">${esc(company?.industry||company?.website||'Nexus client workspace')}</div>`;$('workspaceTitle').textContent=company?.name||'Company workspace';
  const calls=await Promise.all([
    sb.from('nexus_projects').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}),
    sb.from('nexus_tasks').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}),
    sb.from('nexus_milestones').select('*').eq('company_id',state.companyId).order('sort_order').order('due_date'),
    sb.from('nexus_metrics').select('*').eq('company_id',state.companyId).order('updated_at',{ascending:false}),
    sb.from('nexus_documents').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}),
    sb.from('nexus_notifications').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}),
    sb.from('nexus_activity_log').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false}).limit(100),
    sb.from('nexus_document_requests').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false})
  ]);
  state.projects=calls[0].data||[];state.tasks=calls[1].data||[];state.miles=calls[2].data||[];state.metrics=calls[3].data||[];state.docs=calls[4].data||[];state.notes=(calls[5].data||[]).filter(x=>!x.user_id||x.user_id===state.user.id);state.activity=calls[6].data||[];state.docRequests=calls[7].data||[];
  await Promise.all([loadDataRequirements(),loadNotificationPrefs(),loadEmailStatus()]);render();
}

function taskRow(x){return `<div class="row"><div class="grow"><span class="pill">${esc(x.assignee)}</span> <span class="pill">${esc(x.priority)}</span><br><b>${esc(x.title)}</b><div class="small">${esc(x.description||'')}</div><div class="small">${x.due_date?'Due '+date(x.due_date):'No fixed due date'}</div></div><select class="task-status" data-id="${x.id}">${[['open','Open'],['in_progress','In progress'],['blocked','Blocked'],['done','Done']].map(([v,l])=>`<option value="${v}" ${x.status===v?'selected':''}>${l}</option>`).join('')}</select></div>`}
function docRow(x){const source=x.source_role==='nexus'?'Nexus':'Client';return `<div class="row"><div class="grow"><span class="pill">${esc(x.category)}</span> <span class="pill">${source}</span> <span class="pill">v${x.version_number}</span><br><b>${esc(x.file_name)}</b><div class="small">${esc(x.note||'')}</div><div class="small">${dt(x.created_at)}${x.size_bytes?' · '+formatBytes(x.size_bytes):''}</div></div><button class="btn secondary download" data-id="${x.id}" type="button">Download ↓</button></div>`}
function mileRow(x){return `<div class="mile"><span class="pill">${esc(x.status)}</span><br><b>${esc(x.title)}</b><div class="small">${esc(x.description||'')}</div><div class="small">${date(x.start_date)} → ${date(x.due_date)}</div></div>`}

function render(){
  const open=state.tasks.filter(x=>x.status!=='done'),active=state.miles.filter(x=>x.status!=='complete'),unread=state.notes.filter(x=>!x.read_at);
  $('sTasks').textContent=open.length;$('sDocs').textContent=state.docs.length;$('sMiles').textContent=active.length;$('sNotes').textContent=unread.length;
  $('overviewTasks').innerHTML=open.slice(0,5).map(taskRow).join('')||'<div class="empty">No open actions.</div>';
  $('overviewDocs').innerHTML=state.docs.slice(0,5).map(docRow).join('')||'<div class="empty">No documents yet.</div>';
  $('overviewTimeline').innerHTML=state.miles.slice(0,4).map(mileRow).join('')||'<div class="empty">No milestones yet.</div>';
  $('taskList').innerHTML=state.tasks.map(taskRow).join('')||'<div class="empty">No tasks yet.</div>';
  $('documentList').innerHTML=state.docs.map(docRow).join('')||'<div class="empty">No files have been shared yet.</div>';
  $('milestoneList').innerHTML=state.miles.map(mileRow).join('')||'<div class="empty">No milestones yet.</div>';
  const project=state.projects[0];$('projectBox').innerHTML=project?`<span class="pill">${esc(project.status)}</span><h3>${esc(project.name)}</h3><p class="small">${esc(project.summary||project.service_type||'Nexus engagement workspace')}</p><div class="small">${date(project.start_date)} → ${date(project.target_end_date)}</div>`:'<div class="empty">No project configured.</div>';
  $('metricList').innerHTML=state.metrics.map(x=>`<div class="metric-card"><span class="pill">${esc(x.unit||'metric')}</span><h3>${esc(x.name)}</h3><div class="small">Baseline</div><b style="font-size:22px">${x.baseline_value??'—'} ${esc(x.unit||'')}</b><div class="small" style="margin-top:8px">Current: ${x.current_value??'—'} · Target: ${x.target_value??'—'}</div><p class="small">${esc(x.measurement_method||'Measurement method not yet documented.')}</p></div>`).join('')||'<div class="empty">No measurements yet.</div>';
  $('notificationList').innerHTML=state.notes.map(x=>`<div class="row"><div class="grow"><span class="pill">${esc(x.notification_type)}</span><br><b>${esc(x.title)}</b><div class="small">${esc(x.message||'')}</div><div class="small">${dt(x.created_at)}</div></div>${x.read_at?'':'<span class="pill">new</span>'}</div>`).join('')||'<div class="empty">No notifications yet.</div>';
  $('activityList').innerHTML=state.activity.map(x=>`<div class="row"><div class="grow"><b>${esc(x.summary||x.action)}</b><div class="small">${esc(x.entity_type||'activity')}</div></div><div class="small">${dt(x.created_at)}</div></div>`).join('')||'<div class="empty">No activity yet.</div>';
  renderDataRoom();renderEmailPrefs();bindRows();
}

function addressedStatus(status){return ['ready','uploaded','build_with_nexus','not_available','not_applicable'].includes(status)}
function detail(label,text,extra=''){return `<div class="req-detail ${extra}"><b>${esc(label)}</b><p>${esc(text||'—')}</p></div>`}
function requirementCard(r){
  const c=r.catalog||{},fileLike=['file','export'].includes(c.input_type),answerLike=['answer','list','access_context'].includes(c.input_type),addressed=addressedStatus(r.status);
  let html=`<article class="requirement-card ${addressed?'addressed':''}">`;
  html+=`<div class="requirement-head"><div><span class="pill">${esc(c.category||'Preparation')}</span> <span class="pill">${esc((c.importance||'helpful').replaceAll('_',' '))}</span></div><span class="req-status ${esc(r.status)}">${esc(r.status.replaceAll('_',' '))}</span></div>`;
  html+=`<h3>${esc(c.title||'Preparation item')}</h3>`;
  html+=detail('Why Nexus needs it',c.why_needed||'This helps Nexus understand the current state without guessing.');
  html+=detail('How to find it',c.how_to_find||'Ask the person closest to the workflow or check the systems where the work happens.');
  html+=detail('Good examples',c.good_examples||'A representative example is enough.');
  html+=detail('Don’t have it?',c.if_missing||'That is okay. Nexus can help build the minimum useful version with you.','missing');
  if(r.client_note)html+=detail('Your note / response',r.client_note);
  if(!state.admin){
    html+='<div class="req-actions">';
    if(fileLike)html+=`<button class="btn primary req-upload" data-id="${r.id}" data-title="${esc(c.title||'this item')}" type="button">Upload evidence</button>`;
    if(answerLike)html+=`<button class="btn secondary req-answer-btn" data-id="${r.id}" type="button">Answer here</button>`;
    html+=`<button class="btn secondary req-build" data-id="${r.id}" type="button">Build with Nexus</button><button class="btn secondary req-na" data-id="${r.id}" type="button">Not applicable</button></div>`;
    html+=`<div class="req-answer" data-id="${r.id}"><textarea id="req-note-${r.id}" placeholder="Be specific. A short list or clear explanation is enough.">${esc(r.client_note||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn primary req-save" data-id="${r.id}" type="button">Save response</button></div></div>`;
  }
  return html+'</article>';
}
function documentRequestCard(r){
  let html='<div class="row"><div class="grow"><span class="pill">Requested by Nexus</span>';
  if(r.due_date)html+=` <span class="pill">Due ${date(r.due_date)}</span>`;
  html+=`<br><b>${esc(r.title)}</b><div class="small">${esc(r.purpose||'')}</div>`;
  if(r.examples)html+=`<div class="small"><b>Examples:</b> ${esc(r.examples)}</div>`;
  if(r.redaction_guidance)html+=`<div class="small"><b>Privacy:</b> ${esc(r.redaction_guidance)}</div>`;
  html+='<div class="small">If you do not have this item, tell Nexus—we can help create or reconstruct the minimum useful version.</div></div>';
  if(!state.admin)html+=`<button class="btn primary upload-request" data-id="${r.id}" data-title="${esc(r.title)}" type="button">Upload →</button>`;
  return html+'</div>';
}
function renderDataRoom(){
  const root=$('dataRoomRequirements');if(!root)return;
  const total=state.dataRequirements.length,addressed=state.dataRequirements.filter(r=>addressedStatus(r.status)).length,pct=total?Math.round(addressed/total*100):0;
  $('dataRoomProgress').innerHTML=`<div class="data-room-meter-track"><div class="data-room-meter-fill" style="width:${pct}%"></div></div><strong>${addressed} of ${total||'—'} preparation items addressed</strong>`;
  root.innerHTML=state.dataRequirements.length?state.dataRequirements.map(requirementCard).join(''):'<div class="empty">Nexus has not assigned a preparation checklist to this project yet.</div>';
  const requestRoot=$('explicitDocumentRequests'),openRequests=state.docRequests.filter(r=>r.status==='requested');
  requestRoot.innerHTML=openRequests.length?`<div class="request-strip">${openRequests.map(documentRequestCard).join('')}</div>`:'<div class="empty">No additional one-off document requests are outstanding.</div>';
  root.querySelectorAll('.req-upload').forEach(b=>b.onclick=()=>prepareUpload({requirementId:b.dataset.id,title:b.dataset.title}));
  root.querySelectorAll('.req-answer-btn').forEach(b=>b.onclick=()=>document.querySelector(`.req-answer[data-id="${b.dataset.id}"]`)?.classList.toggle('open'));
  root.querySelectorAll('.req-save').forEach(b=>b.onclick=()=>saveRequirementAnswer(b.dataset.id));
  root.querySelectorAll('.req-build').forEach(b=>b.onclick=()=>setRequirementStatus(b.dataset.id,'build_with_nexus'));
  root.querySelectorAll('.req-na').forEach(b=>b.onclick=()=>setRequirementStatus(b.dataset.id,'not_applicable'));
  requestRoot.querySelectorAll('.upload-request').forEach(b=>b.onclick=()=>prepareUpload({requestId:b.dataset.id,title:b.dataset.title}));
}
async function saveRequirementAnswer(id){const note=$(`req-note-${id}`)?.value.trim();if(!note)return toast('Add a response before saving.');const {error}=await sb.from('nexus_project_data_requirements').update({client_note:note,status:'ready',updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message);toast('Preparation response saved.');await workspace()}
async function setRequirementStatus(id,status){const {error}=await sb.from('nexus_project_data_requirements').update({status,updated_by:state.user.id,updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message);toast(status==='build_with_nexus'?'Marked for Nexus to help build.':'Preparation item updated.');await workspace()}
function prepareUpload({requirementId=null,requestId=null,title=''}){currentRequirementId=requirementId;currentRequestId=requestId;const box=$('uploadContext');box.classList.add('show');box.innerHTML=`<b>Upload for:</b> ${esc(title)} <button id="clearUploadContext" class="btn secondary" type="button" style="min-height:30px;padding:0 9px;margin-left:8px">Clear</button>`;$('docNote').value=$('docNote').value||`Evidence for ${title}`;box.scrollIntoView({behavior:'smooth',block:'center'});$('clearUploadContext')?.addEventListener('click',clearUploadContext);$('docFile').focus()}
function clearUploadContext(){currentRequirementId=null;currentRequestId=null;$('uploadContext').classList.remove('show');$('uploadContext').innerHTML=''}

function renderEmailPrefs(){
  const root=$('emailPreferencePanel');if(!root)return;const p=state.notificationPrefs||{email_enabled:true,task_emails:true,approval_emails:true,document_request_emails:true,digest_cadence:'daily'};
  root.innerHTML=`<div class="email-control"><div class="toolbar" style="margin-bottom:0"><div><div class="kicker">Notification routing</div><h3 style="margin:4px 0">Stay clear on what Nexus needs from you.</h3></div><span class="email-status ${state.emailConfigured?'live':''}">${state.emailConfigured?'Email delivery connected':'Email delivery provider connection pending'}</span></div><p class="small">In-app alerts are active now. Your email preferences are stored here so task, approval, document-request, and action-summary emails follow your choices when outbound delivery is connected.</p><div class="pref-grid"><label class="pref-toggle"><input id="prefEmail" type="checkbox" ${p.email_enabled?'checked':''}><span><b>Email notifications</b><span>Master email preference.</span></span></label><label class="pref-toggle"><input id="prefTasks" type="checkbox" ${p.task_emails?'checked':''}><span><b>Tasks & responsibilities</b><span>New client action items.</span></span></label><label class="pref-toggle"><input id="prefApprovals" type="checkbox" ${p.approval_emails?'checked':''}><span><b>Approvals</b><span>Decisions Nexus needs from your team.</span></span></label><label class="pref-toggle"><input id="prefDocs" type="checkbox" ${p.document_request_emails?'checked':''}><span><b>Document requests</b><span>New evidence or files Nexus requests.</span></span></label></div><div class="field" style="max-width:260px;margin-top:10px"><label>Action-summary cadence</label><select id="prefDigest"><option value="daily" ${p.digest_cadence==='daily'?'selected':''}>Daily when actions exist</option><option value="weekly" ${p.digest_cadence==='weekly'?'selected':''}>Weekly</option><option value="off" ${p.digest_cadence==='off'?'selected':''}>Off</option></select></div><div class="actions" style="margin-top:12px"><button id="savePrefs" class="btn secondary" type="button">Save notification preferences</button></div></div>`;
  $('savePrefs').onclick=saveNotificationPrefs;
}
async function saveNotificationPrefs(){const row={company_id:state.companyId,user_id:state.user.id,email_enabled:$('prefEmail').checked,task_emails:$('prefTasks').checked,approval_emails:$('prefApprovals').checked,document_request_emails:$('prefDocs').checked,digest_cadence:$('prefDigest').value,updated_at:new Date().toISOString()};const {error}=await sb.from('nexus_notification_preferences').upsert(row,{onConflict:'company_id,user_id'});if(error)return toast(error.message);toast('Notification preferences saved.');await loadNotificationPrefs();renderEmailPrefs()}

function bindRows(){document.querySelectorAll('.task-status').forEach(el=>el.onchange=async()=>{const {error}=await sb.from('nexus_tasks').update({status:el.value,updated_at:new Date().toISOString()}).eq('id',el.dataset.id);if(error)return toast(error.message);await workspace()});document.querySelectorAll('.download').forEach(b=>b.onclick=()=>downloadDocument(b.dataset.id))}
async function downloadDocument(id){
  const doc=state.docs.find(x=>x.id===id);if(!doc)return toast('Document record not found.');
  const buttons=[...document.querySelectorAll(`.download[data-id="${id}"]`)];buttons.forEach(b=>{b.disabled=true;b.textContent='Preparing…'});
  try{
    const signed=await sb.storage.from(BUCKET).createSignedUrl(doc.storage_path,120,{download:doc.file_name});
    if(!signed.error&&signed.data?.signedUrl){const a=document.createElement('a');a.href=signed.data.signedUrl;a.download=doc.file_name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();return}
    const fallback=await sb.storage.from(BUCKET).download(doc.storage_path);if(fallback.error)throw fallback.error;
    const url=URL.createObjectURL(fallback.data),a=document.createElement('a');a.href=url;a.download=doc.file_name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
  }catch(error){console.error('Document download failed',error);toast(`Download failed: ${error.message||'access could not be verified'}`)}
  finally{buttons.forEach(b=>{b.disabled=false;b.textContent='Download ↓'})}
}

$('uploadForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const f=$('docFile').files[0];if(!f)return;if(f.size>26214400)return toast('File exceeds the 25 MB limit.');
  const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${state.companyId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const requirement=state.dataRequirements.find(r=>r.id===currentRequirementId),request=state.docRequests.find(r=>r.id===currentRequestId),sensitivity=requirement?.catalog?.sensitivity||request?.sensitivity||'standard';
  const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,f,{contentType:f.type||undefined});if(uploadError)return toast(uploadError.message);
  const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,storage_path:path,file_name:f.name,mime_type:f.type||null,size_bytes:f.size,category:$('docCategory').value,status:'shared',note:$('docNote').value.trim()||null,uploaded_by:state.user.id,sensitivity,request_id:currentRequestId||null,data_requirement_id:currentRequirementId||null,document_area:state.admin?'nexus_deliverable':'client_submission',source_role:state.admin?'nexus':'client'};
  const {data,error}=await sb.from('nexus_documents').insert(row).select().single();if(error){await sb.storage.from(BUCKET).remove([path]);return toast(error.message)}
  await log('document_uploaded','document',data.id,`${state.admin?'Nexus':'Client'} uploaded ${f.name}`);e.target.reset();clearUploadContext();toast('Document uploaded securely.');await workspace();
});

$('taskForm')?.addEventListener('submit',async e=>{e.preventDefault();const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,title:$('taskTitle').value.trim(),description:$('taskDescription').value.trim()||null,assignee:$('taskAssignee').value,status:'open',priority:$('taskPriority').value,due_date:$('taskDue').value||null,created_by:state.user.id};const {data,error}=await sb.from('nexus_tasks').insert(row).select().single();if(error)return toast(error.message);await log('task_created','task',data.id,`Task created: ${row.title}`);closeAll();e.target.reset();await workspace()});
$('metricForm')?.addEventListener('submit',async e=>{e.preventDefault();const num=v=>v===''?null:Number(v),row={company_id:state.companyId,project_id:state.projects[0]?.id||null,name:$('metricName').value.trim(),unit:$('metricUnit').value.trim()||null,baseline_value:num($('metricBaseline').value),current_value:num($('metricCurrent').value),target_value:num($('metricTarget').value),measurement_method:$('metricMethod').value.trim()||null,measured_at:new Date().toISOString(),created_by:state.user.id};const {data,error}=await sb.from('nexus_metrics').insert(row).select().single();if(error)return toast(error.message);await log('measurement_added','metric',data.id,`Measurement added: ${row.name}`);closeAll();e.target.reset();await workspace()});
$('milestoneForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!state.admin)return;const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,title:$('milestoneTitle').value.trim(),description:$('milestoneDescription').value.trim()||null,start_date:$('milestoneStart').value||null,due_date:$('milestoneDue').value||null,status:$('milestoneStatus').value,created_by:state.user.id};const {data,error}=await sb.from('nexus_milestones').insert(row).select().single();if(error)return toast(error.message);await log('milestone_created','milestone',data.id,`Milestone added: ${row.title}`);closeAll();e.target.reset();await workspace()});
$('documentRequestForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!state.admin)return;const row={company_id:state.companyId,project_id:state.projects[0]?.id||null,title:$('requestDocTitle').value.trim(),purpose:$('requestDocPurpose').value.trim()||null,examples:$('requestDocExamples').value.trim()||null,redaction_guidance:$('requestDocPrivacy').value.trim()||null,sensitivity:$('requestDocSensitivity').value,due_date:$('requestDocDue').value||null,requested_by:state.user.id};const {data,error}=await sb.from('nexus_document_requests').insert(row).select().single();if(error)return toast(error.message);await log('document_requested','document_request',data.id,`Document requested: ${row.title}`);closeAll();e.target.reset();toast('Document request sent to the client workspace.');await workspace()});

async function log(action,type,id,summary){try{await sb.from('nexus_activity_log').insert({company_id:state.companyId,actor_id:state.user.id,action,entity_type:type,entity_id:id,summary})}catch{}}
$('readAllBtn')?.addEventListener('click',async()=>{const ids=state.notes.filter(x=>!x.read_at&&x.user_id===state.user.id).map(x=>x.id);if(ids.length)await sb.from('nexus_notifications').update({read_at:new Date().toISOString()}).in('id',ids);await workspace()});
$('alertsBtn')?.addEventListener('click',async()=>{if(!('Notification'in window))return toast('Browser alerts are unavailable here.');const permission=await Notification.requestPermission();toast(permission==='granted'?'Browser alerts enabled.':'Browser alerts were not enabled.')});
function open(id){$(id)?.classList.add('show')}function closeAll(){document.querySelectorAll('.modal').forEach(x=>x.classList.remove('show'))}
$('newTaskBtn')?.addEventListener('click',()=>open('taskModal'));$('newMetricBtn')?.addEventListener('click',()=>open('metricModal'));$('newMilestoneBtn')?.addEventListener('click',()=>open('milestoneModal'));$('newDocumentRequestBtn')?.addEventListener('click',()=>open('documentRequestModal'));document.querySelectorAll('.close').forEach(b=>b.onclick=closeAll);document.querySelectorAll('.modal').forEach(m=>m.onclick=e=>{if(e.target===m)closeAll()});
document.querySelectorAll('.side-nav button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.side-nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id==='section-'+b.dataset.section));window.scrollTo(0,0)}));

window.NexusPortal={sb,state,$,toast,workspace,log,downloadDocument};
await initAuthUX({sb,$,pane,show});
await initOps({sb,state,$,toast,workspace,log});
sb.auth.onAuthStateChange(async(_event,session)=>{if(session?.user){try{await identity()}catch(error){console.error(error);toast(error.message||'Portal could not load.')}}else{state.user=null;show('auth')}});
const initial=(await sb.auth.getSession()).data.session;if(initial?.user){try{await identity()}catch(error){console.error(error);toast(error.message||'Portal could not load.')}}else show('auth');
