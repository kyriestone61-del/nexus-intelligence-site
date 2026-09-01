const portal=window.NexusPortal;
if(!portal)throw new Error('Nexus portal context is unavailable.');
const {sb,state,toast}=portal;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString():'—';
const activeProject=()=>window.NexusFoundationHardening?.activeProject?.()||null;
let draftRows=[];
let selectedDraftId=null;
let draftLoadBusy=false;
let lastDraftLoad={companyId:null,at:0};
let cohesionQueued=false;

const REQUEST_TEMPLATES=[
  {
    key:'kpi_report',
    title:'Existing KPI or performance report',
    purpose:'A baseline lets Nexus measure improvement later instead of relying on impressions.',
    examples:'Cycle time, response time, error/rework, labor hours, conversion, throughput.',
    redaction:'Share only information relevant to this request. Remove passwords, payment information, government identifiers, and unrelated customer or employee personal data.'
  },
  {
    key:'process_sop',
    title:'Current process, SOP, or workflow instructions',
    purpose:'This shows how the work is supposed to happen today and where handoffs, delays, or manual steps may exist.',
    examples:'SOP, checklist, written instructions, process map, screenshots, training notes.',
    redaction:'Remove credentials, secrets, unrelated customer details, and any regulated information Nexus does not need.'
  },
  {
    key:'recent_examples',
    title:'Representative recent work examples',
    purpose:'A few real examples help Nexus compare the documented process with how work actually happens.',
    examples:'Three to ten representative requests, tickets, orders, projects, reports, or anonymized screenshots.',
    redaction:'Redact names, contact information, payment data, credentials, and other unnecessary personal information.'
  },
  {
    key:'systems_list',
    title:'Systems and tools currently used',
    purpose:'This identifies where information lives, which systems do not connect, and where duplicate entry or manual handoffs occur.',
    examples:'Software list, spreadsheet list, CRM, inboxes, calendars, shared drives, forms, reporting tools.',
    redaction:'Do not include passwords, API keys, MFA codes, recovery codes, or private access links.'
  },
  {
    key:'current_reporting',
    title:'Current report or dashboard example',
    purpose:'This helps Nexus understand what the team can see today, what is missing, and how decisions are currently made.',
    examples:'Weekly report, dashboard screenshot, spreadsheet summary, management report, operating scorecard.',
    redaction:'Remove unnecessary customer identifiers, confidential account numbers, credentials, and unrelated sensitive data.'
  },
  {key:'custom',title:'Custom request',purpose:'',examples:'',redaction:'Share only the minimum information needed. Remove credentials, payment data, government identifiers, and unrelated sensitive information.'}
];

function activateSection(name){
  const section=document.getElementById(`section-${name}`);
  if(!section){toast?.('That Nexus workspace is not available right now. Refresh once and try again.');return false}
  document.querySelectorAll('.section').forEach(node=>node.classList.toggle('active',node===section));
  document.querySelectorAll('.side-nav button').forEach(node=>node.classList.toggle('active',node.dataset.section===name));
  window.scrollTo({top:0,left:0,behavior:'auto'});
  return true;
}

/*
 * The unified Inbox intentionally renames #notificationList to #nexusInboxRoot.
 * portal-client.js still has a legacy renderer that writes to #notificationList.
 * Keep a hidden compatibility sink so later workspace refreshes cannot crash.
 */
function ensureLegacyNotificationSink(){
  const inbox=document.getElementById('section-notifications');
  if(!inbox||!document.getElementById('nexusInboxRoot')||document.getElementById('notificationList'))return;
  const sink=document.createElement('div');
  sink.id='notificationList';
  sink.hidden=true;
  sink.setAttribute('aria-hidden','true');
  sink.dataset.legacyNotificationSink='1';
  inbox.appendChild(sink);
}

function preferencesSaved(){return !!state.notificationPrefs?.updated_at}
function ensureSettingsSection(){
  const main=document.querySelector('.main');
  if(!main)return null;
  let section=document.getElementById('section-settings');
  if(!section){
    section=document.createElement('section');
    section.id='section-settings';
    section.className='section nexus-settings-section';
    section.innerHTML=`<div class="toolbar"><div><div class="eyebrow">Profile & preferences</div><h1>Settings</h1><p class="small">Control how Nexus contacts you. You can change these preferences at any time.</p></div></div><div class="nexus-settings-account"><div class="kicker">Signed-in account</div><b>${esc(state.user?.email||'Nexus account')}</b></div><div id="nexusSettingsPreferencesHost"></div>`;
    main.appendChild(section);
  }
  return section;
}
function ensureSettingsNav(){
  const nav=document.querySelector('.side-nav');if(!nav)return;
  let button=nav.querySelector('button[data-section="settings"]');
  if(!button){
    button=document.createElement('button');button.type='button';button.dataset.section='settings';button.textContent='Settings';button.setAttribute('aria-label','Profile and notification settings');
    const inbox=nav.querySelector('button[data-section="notifications"]');
    const tools=nav.querySelector('details.admin-tool-drawer');
    if(inbox)inbox.after(button);else if(tools)nav.insertBefore(button,tools);else nav.appendChild(button);
  }
  if(button.dataset.cohesionBound!=='1'){
    button.dataset.cohesionBound='1';
    button.addEventListener('click',event=>{event.preventDefault();activateSection('settings');movePreferenceEditor();});
  }
}
function movePreferenceEditor(){
  const section=ensureSettingsSection();if(!section)return;
  const host=document.getElementById('nexusSettingsPreferencesHost');
  const panel=document.getElementById('emailPreferencePanel');
  if(panel&&host&&panel.parentElement!==host)host.appendChild(panel);
  if(panel)panel.classList.add('nexus-settings-preferences');
}
function syncInboxSetupPrompt(){
  const inbox=document.getElementById('section-notifications');if(!inbox)return;
  let prompt=inbox.querySelector('.nexus-notification-setup-prompt');
  if(preferencesSaved()){prompt?.remove();return}
  if(!prompt){
    prompt=document.createElement('div');prompt.className='nexus-notification-setup-prompt';
    prompt.innerHTML='<div><div class="kicker">One-time setup</div><b>Choose how Nexus should notify you.</b><p>Set email, report/Q&A, and optional SMS preferences once. After you save them, this setup card disappears from the Inbox and remains editable in Settings.</p></div><button class="btn primary" type="button" data-open-notification-settings>Open settings →</button>';
    const controls=inbox.querySelector('.nexus-inbox-controls');
    if(controls)controls.before(prompt);else inbox.querySelector('.toolbar')?.after(prompt);
  }
}

function labelInboxActions(){
  document.querySelectorAll('.nexus-inbox-card').forEach(card=>{
    const kind=card.querySelector('.pill')?.textContent?.trim()||'';
    const button=card.querySelector('[data-inbox-open]');if(!button)return;
    const label={
      'Action item':'Open action →',
      'Evidence request':'Open evidence request →',
      'Client question':'Open question →',
      'Founder decision':'Review decision →',
      'Update':'View update →'
    }[kind]||'Open item →';
    if(button.textContent!==label)button.textContent=label;
  });
}
function labelNeedsAction(){
  document.querySelectorAll('.ops-action[data-jump]').forEach(button=>{
    const section=button.dataset.jump;
    const cta={approvals:'Review decision →',tasks:'Open action →',documents:'Review evidence request →',automations:'Resolve automation →',requests:'Review request →'}[section]||'Open item →';
    const last=button.querySelector(':scope > span:last-child');if(last)last.textContent=cta;
    button.dataset.cohesionAction='1';
    const title=button.querySelector('b')?.textContent?.trim();if(title)button.setAttribute('aria-label',`${cta.replace(' →','')}: ${title}`);
  });
}
function scrollToNamedRecord(section,title){
  if(!title)return;
  const root=document.getElementById(`section-${section}`);if(!root)return;
  const candidate=[...root.querySelectorAll('h3,b')].find(node=>node.textContent?.trim()===title);
  candidate?.closest('.ops-item,.action-execution-card,.request-card,.panel,.box')?.scrollIntoView({behavior:'smooth',block:'center'});
}

function relabelIntakeSteps(){
  if(!state.admin)return;
  const intake=document.getElementById('section-intake');if(!intake)return;
  const flow=intake.querySelector('.intake-flow');
  if(flow)flow.innerHTML='<span><b>1</b> Discovery brief</span><span><b>2</b> Review client requests</span><span><b>3</b> Add transcript</span><span><b>4</b> Add evidence</span><span><b>5</b> Queue diagnosis</span><span><b>6</b> Review output</span>';
  intake.querySelectorAll('.intake-card .kicker').forEach(kicker=>{
    const t=kicker.textContent.trim();
    if(t==='Step 2 · Transcript')kicker.textContent='Step 3 · Transcript';
    else if(t==='Step 3 · Supporting evidence')kicker.textContent='Step 4 · Supporting evidence';
    else if(t==='Step 4 · Diagnosis packet')kicker.textContent='Step 5 · Diagnosis packet';
  });
}
function compactLegacyRequestEditors(){
  if(!state.admin)return;
  const intake=document.getElementById('section-intake');if(!intake)return;
  [...intake.querySelectorAll('label')].filter(label=>label.textContent.trim()==='Request title').forEach(label=>{
    const card=label.closest('form,.box,.panel,.intake-card,.request-card');
    if(card&&!card.closest('#nexusClientRequestManager'))card.classList.add('nexus-legacy-request-editor');
  });
}
function requestTemplateOptions(){return REQUEST_TEMPLATES.map(t=>`<option value="${esc(t.key)}">${esc(t.title)}</option>`).join('')}
function draftRow(row){
  return `<button class="nexus-request-draft-row ${selectedDraftId===row.id?'selected':''}" data-request-draft="${esc(row.id)}" type="button"><span><b>${esc(row.title)}</b><small>${row.source_diagnosis_run_id?'Generated from diagnosis':'Manual draft'} · ${esc(fmt(row.updated_at||row.created_at))}</small></span><span class="pill">Draft</span><span aria-hidden="true">›</span></button>`;
}
function selectedDraft(){return draftRows.find(row=>row.id===selectedDraftId)||null}
function selectedEditorMarkup(row){
  if(!row)return '<div class="empty nexus-request-empty-selection">Select a draft above to review or send it.</div>';
  return `<form id="nexusDraftEditor" class="nexus-request-editor" data-id="${esc(row.id)}"><div class="toolbar"><div><div class="kicker">Selected draft</div><h3>${esc(row.title)}</h3></div><span class="pill">Not visible to client</span></div><div class="field"><label>Request title</label><input id="nexusDraftTitle" value="${esc(row.title)}" required></div><div class="field"><label>Why Nexus needs it</label><textarea id="nexusDraftPurpose">${esc(row.purpose||'')}</textarea></div><div class="field"><label>Good examples</label><textarea id="nexusDraftExamples">${esc(row.examples||'')}</textarea></div><div class="field"><label>Privacy / redaction guidance</label><textarea id="nexusDraftRedaction">${esc(row.redaction_guidance||'')}</textarea></div><div class="form-grid"><div class="field"><label>Sensitivity</label><select id="nexusDraftSensitivity"><option value="standard" ${row.sensitivity!=='confidential'?'selected':''}>Standard business information</option><option value="confidential" ${row.sensitivity==='confidential'?'selected':''}>Confidential business information</option></select></div><div class="field"><label>Due date <span class="small">(optional)</span></label><input id="nexusDraftDue" type="date" value="${esc(row.due_date||'')}"></div></div><div class="actions"><button class="btn secondary" type="submit">Save changes</button><button class="btn primary" type="button" data-send-request-draft="${esc(row.id)}">Send request to client →</button></div><p class="small">Sending makes this request client-visible and creates the appropriate client notification. Nothing is sent until you choose Send request to client.</p></form>`;
}
function managerMarkup(){
  return `<div class="kicker">Step 2 · Client requests</div><h2>Review exactly what you want the client to provide.</h2><p class="small">Create one request at a time. Drafts stay compact until you select one. Nothing becomes client-visible until you explicitly send it.</p><div class="nexus-request-manager-grid"><details class="nexus-new-request" open><summary>Send a new request</summary><form id="nexusNewRequestForm"><div class="field"><label>Request title</label><select id="nexusNewRequestTemplate">${requestTemplateOptions()}</select></div><div class="field nexus-custom-title" style="display:none"><label>Custom request title</label><input id="nexusNewRequestTitle"></div><div class="field"><label>Why Nexus needs it</label><textarea id="nexusNewRequestPurpose"></textarea></div><div class="field"><label>Good examples</label><textarea id="nexusNewRequestExamples"></textarea></div><div class="field"><label>Privacy / redaction guidance</label><textarea id="nexusNewRequestRedaction"></textarea></div><div class="form-grid"><div class="field"><label>Sensitivity</label><select id="nexusNewRequestSensitivity"><option value="standard">Standard business information</option><option value="confidential">Confidential business information</option></select></div><div class="field"><label>Due date <span class="small">(optional)</span></label><input id="nexusNewRequestDue" type="date"></div></div><div class="actions"><button class="btn secondary" type="submit" data-save-new-draft>Save as draft</button><button class="btn primary" type="button" data-send-new-request>Send request to client →</button></div></form></details><section class="nexus-request-drafts"><div class="toolbar"><div><div class="kicker">Drafts</div><h3>${draftRows.length} request draft${draftRows.length===1?'':'s'}</h3></div></div><div class="nexus-request-draft-list">${draftRows.length?draftRows.map(draftRow).join(''):'<div class="empty">No request drafts. Create one above or approve a diagnosis to generate governed drafts.</div>'}</div><div id="nexusRequestDraftEditor">${selectedEditorMarkup(selectedDraft())}</div></section></div>`;
}
function fillNewTemplate(key){
  const template=REQUEST_TEMPLATES.find(t=>t.key===key)||REQUEST_TEMPLATES[0];
  const custom=document.querySelector('#nexusNewRequestForm .nexus-custom-title');if(custom)custom.style.display=template.key==='custom'?'block':'none';
  const customInput=document.getElementById('nexusNewRequestTitle');if(customInput){customInput.required=template.key==='custom';if(template.key!=='custom')customInput.value=''}
  const purpose=document.getElementById('nexusNewRequestPurpose'),examples=document.getElementById('nexusNewRequestExamples'),redaction=document.getElementById('nexusNewRequestRedaction');
  if(purpose)purpose.value=template.purpose;if(examples)examples.value=template.examples;if(redaction)redaction.value=template.redaction;
}
async function loadRequestDrafts({force=false}={}){
  if(!state.admin||!state.companyId||draftLoadBusy)return;
  if(!force&&lastDraftLoad.companyId===state.companyId&&Date.now()-lastDraftLoad.at<1200)return;
  draftLoadBusy=true;
  try{
    const {data,error}=await sb.from('nexus_document_requests').select('id,title,purpose,examples,redaction_guidance,sensitivity,due_date,status,source_diagnosis_run_id,created_at,updated_at').eq('company_id',state.companyId).eq('status','draft').order('updated_at',{ascending:false});
    if(error)throw error;
    draftRows=data||[];
    if(selectedDraftId&&!draftRows.some(row=>row.id===selectedDraftId))selectedDraftId=null;
    lastDraftLoad={companyId:state.companyId,at:Date.now()};
    renderRequestManager();
  }catch(error){console.error('Nexus request draft load failed',error);const root=document.getElementById('nexusClientRequestManager');if(root)root.innerHTML=`<div class="note error"><b>Request drafts could not load.</b><br>${esc(error.message||'Refresh and try again.')}</div>`}
  finally{draftLoadBusy=false}
}
function renderRequestManager(){
  const root=document.getElementById('nexusClientRequestManager');if(!root)return;
  root.innerHTML=managerMarkup();
  fillNewTemplate(document.getElementById('nexusNewRequestTemplate')?.value||REQUEST_TEMPLATES[0].key);
}
function ensureRequestManager(){
  if(!state.admin)return;
  const intake=document.getElementById('section-intake');if(!intake)return;
  relabelIntakeSteps();compactLegacyRequestEditors();
  let root=document.getElementById('nexusClientRequestManager');
  if(!root){
    root=document.createElement('section');root.id='nexusClientRequestManager';root.className='box intake-card nexus-client-request-manager';
    const step1=[...intake.querySelectorAll('.intake-card')].find(card=>card.querySelector('.kicker')?.textContent?.trim()==='Step 1 · Meeting record');
    if(step1)step1.after(root);else intake.querySelector('.intake-grid')?.after(root);
    renderRequestManager();loadRequestDrafts({force:true});
  }
}
function newRequestPayload(){
  const key=document.getElementById('nexusNewRequestTemplate')?.value||REQUEST_TEMPLATES[0].key;
  const template=REQUEST_TEMPLATES.find(t=>t.key===key)||REQUEST_TEMPLATES[0];
  const title=template.key==='custom'?document.getElementById('nexusNewRequestTitle')?.value?.trim():template.title;
  if(!title)throw new Error('Choose or enter a request title.');
  const project=activeProject();if(!project?.id)throw new Error('Select an active client engagement before creating a request.');
  return {company_id:state.companyId,project_id:project.id,title,purpose:document.getElementById('nexusNewRequestPurpose')?.value?.trim()||null,examples:document.getElementById('nexusNewRequestExamples')?.value?.trim()||null,redaction_guidance:document.getElementById('nexusNewRequestRedaction')?.value?.trim()||null,sensitivity:document.getElementById('nexusNewRequestSensitivity')?.value||'standard',due_date:document.getElementById('nexusNewRequestDue')?.value||null,status:'draft',requested_by:state.user.id};
}
async function createRequestDraft({send=false}={}){
  if(!state.admin||!state.companyId)return;
  try{
    const payload=newRequestPayload();
    const {data,error}=await sb.from('nexus_document_requests').insert(payload).select('id').single();if(error)throw error;
    toast?.(send?'Request draft created. Confirming client release…':'Request saved as a draft.');
    if(send)await releaseRequestDraft(data.id,{skipConfirm:false});
    else{selectedDraftId=data.id;await loadRequestDrafts({force:true})}
  }catch(error){toast?.(error.message||'Request draft could not be created.')}
}
async function saveSelectedDraft(form){
  const id=form?.dataset.id;if(!id)return;
  const row={title:document.getElementById('nexusDraftTitle')?.value?.trim(),purpose:document.getElementById('nexusDraftPurpose')?.value?.trim()||null,examples:document.getElementById('nexusDraftExamples')?.value?.trim()||null,redaction_guidance:document.getElementById('nexusDraftRedaction')?.value?.trim()||null,sensitivity:document.getElementById('nexusDraftSensitivity')?.value||'standard',due_date:document.getElementById('nexusDraftDue')?.value||null,updated_at:new Date().toISOString()};
  if(!row.title)return toast?.('Request title is required.');
  const {error}=await sb.from('nexus_document_requests').update(row).eq('id',id).eq('status','draft');if(error)return toast?.(error.message);
  toast?.('Request draft saved.');await loadRequestDrafts({force:true});
}
async function releaseRequestDraft(id,{skipConfirm=false}={}){
  if(!id||!state.admin)return;
  if(!skipConfirm&&!window.confirm('Send this request to the client workspace?\n\nThe request will become client-visible and Nexus will create the appropriate client notification.'))return;
  const {error}=await sb.rpc('nexus_release_document_request',{p_request_id:id});
  if(error)return toast?.(error.message||'Request could not be sent.');
  toast?.('Request sent to the client workspace.');selectedDraftId=null;await loadRequestDrafts({force:true});window.dispatchEvent(new CustomEvent('nexus:diagnosis-changed'));
}

function scheduleCohesion(){
  if(cohesionQueued)return;cohesionQueued=true;
  requestAnimationFrame(()=>{
    cohesionQueued=false;
    ensureLegacyNotificationSink();ensureSettingsSection();ensureSettingsNav();movePreferenceEditor();syncInboxSetupPrompt();labelInboxActions();labelNeedsAction();ensureRequestManager();compactLegacyRequestEditors();bindDiagnosisCloseContract();
  });
}

let diagnosisTimer=null;
let pendingDiagnosisId=null;
function forceHideDiagnosis(){
  const modal=document.getElementById('diagnosisReviewModal');if(!modal)return;
  modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('diagnosis-review-open');
}
function bindDiagnosisCloseContract(){
  const modal=document.getElementById('diagnosisReviewModal');if(!modal)return;
  const close=modal.querySelector('#closeDiagnosisReview');
  if(close){
    close.setAttribute('data-diagnosis-review-close','');
    if(close.dataset.cohesionCloseFallback!=='1'){
      close.dataset.cohesionCloseFallback='1';
      close.addEventListener('click',()=>requestAnimationFrame(()=>{if(modal.classList.contains('open'))forceHideDiagnosis()}));
    }
  }
  const body=document.getElementById('diagnosisReviewBody');
  const loading=!!body?.querySelector('.diagnosis-review-loading');
  if(!modal.classList.contains('open')||!loading){if(diagnosisTimer){clearTimeout(diagnosisTimer);diagnosisTimer=null}return}
  if(diagnosisTimer)return;
  diagnosisTimer=setTimeout(()=>{
    diagnosisTimer=null;
    const currentModal=document.getElementById('diagnosisReviewModal'),currentBody=document.getElementById('diagnosisReviewBody');
    if(!currentModal?.classList.contains('open')||!currentBody?.querySelector('.diagnosis-review-loading'))return;
    const id=pendingDiagnosisId;
    currentModal.querySelector('#closeDiagnosisReview')?.click();
    setTimeout(()=>{
      if(!currentModal.isConnected)return;
      currentModal.classList.add('open');currentModal.setAttribute('aria-hidden','false');document.body.classList.add('diagnosis-review-open');
      currentBody.innerHTML=`<div class="note error"><b>Diagnosis is taking longer than expected.</b><p>The review request was stopped so you are never trapped on a loading screen. Retry now, or close and reopen Review Diagnosis.</p><div class="actions">${id?`<button class="btn primary" data-diagnosis-review-reload="${esc(id)}" type="button">Retry now</button>`:''}<button class="btn secondary" data-diagnosis-review-close type="button">Close</button></div></div>`;
    },30);
  },4500);
}

const observer=new MutationObserver(scheduleCohesion);observer.observe(document.body,{childList:true,subtree:true});
document.querySelector('.side-nav')&&new MutationObserver(scheduleCohesion).observe(document.querySelector('.side-nav'),{childList:true,subtree:true});

document.addEventListener('click',event=>{
  const settings=event.target.closest?.('[data-open-notification-settings]');if(settings){event.preventDefault();activateSection('settings');movePreferenceEditor();return}
  const diagnosis=event.target.closest?.('.diagnosis-review-btn');if(diagnosis?.dataset.id){pendingDiagnosisId=diagnosis.dataset.id;setTimeout(bindDiagnosisCloseContract,0);setTimeout(bindDiagnosisCloseContract,120)}
  const action=event.target.closest?.('.ops-action[data-cohesion-action="1"]');
  if(action){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const section=action.dataset.jump,title=action.querySelector('b')?.textContent?.trim();
    if(activateSection(section))setTimeout(()=>scrollToNamedRecord(section,title),80);return;
  }
  const inboxButton=event.target.closest?.('.nexus-inbox-card [data-inbox-open]');
  if(inboxButton){
    const card=inboxButton.closest('.nexus-inbox-card'),kind=card?.querySelector('.pill')?.textContent?.trim();
    if(kind==='Client question'){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(!activateSection('diagnosis-reports'))toast?.('Open Reports & Q&A to answer this client question.');return;
    }
  }
  const draft=event.target.closest?.('[data-request-draft]');if(draft){selectedDraftId=draft.dataset.requestDraft;renderRequestManager();return}
  const sendDraft=event.target.closest?.('[data-send-request-draft]');if(sendDraft){event.preventDefault();releaseRequestDraft(sendDraft.dataset.sendRequestDraft);return}
  const sendNew=event.target.closest?.('[data-send-new-request]');if(sendNew){event.preventDefault();createRequestDraft({send:true});return}
  if(event.target.closest?.('#savePrefs,#vnextSaveChannels'))setTimeout(()=>{movePreferenceEditor();syncInboxSetupPrompt()},500);
},true);

document.addEventListener('change',event=>{
  if(event.target?.id==='nexusNewRequestTemplate')fillNewTemplate(event.target.value);
});
document.addEventListener('submit',event=>{
  if(event.target?.id==='nexusNewRequestForm'){event.preventDefault();event.stopPropagation();createRequestDraft({send:false});return}
  if(event.target?.id==='nexusDraftEditor'){event.preventDefault();event.stopPropagation();saveSelectedDraft(event.target)}
},true);

document.getElementById('companySelect')?.addEventListener('change',()=>{
  selectedDraftId=null;draftRows=[];lastDraftLoad={companyId:null,at:0};setTimeout(()=>{scheduleCohesion();loadRequestDrafts({force:true})},320);
});
window.addEventListener('nexus:diagnosis-changed',()=>setTimeout(()=>{loadRequestDrafts({force:true});scheduleCohesion()},180));
for(const ms of [0,100,320,900,1800])setTimeout(scheduleCohesion,ms);

window.NexusWorkflowCohesion={scheduleCohesion,ensureSettingsSection,ensureLegacyNotificationSink,loadRequestDrafts,releaseRequestDraft,activateSection};
