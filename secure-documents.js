export async function init({sb,state,$,toast,download,log,workspace}){
  const section=$('section-documents');
  if(!section||section.dataset.secureDocs==='1')return;
  section.dataset.secureDocs='1';
  const nav=[...document.querySelectorAll('.side-nav button')].find(b=>b.dataset.section==='documents');
  if(nav)nav.textContent='Secure Files';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString():'No due date';
  const fmtDt=v=>v?new Date(v).toLocaleString():'—';
  let requests=[];
  let loading=false;

  section.innerHTML=`
    <div class="toolbar"><div><div class="eyebrow">Secure Files & Requests</div><h1 style="font-size:36px;margin:6px 0">Documents</h1><p class="muted" style="margin:6px 0 0">Upload only information that is relevant to the work. Nexus will request specific documents whenever possible so you do not have to guess what is needed.</p></div><div id="secureAdminBar" class="secure-admin-bar"></div></div>
    <div class="secure-docs-intro">
      <div class="secure-guide good"><h3>✓ Good to upload</h3><p>Normal business information that helps Nexus understand or improve a process.</p><ul><li>SOPs and process documents</li><li>Business plans and operating models</li><li>Templates, reports and dashboards</li><li>Org charts, policies and workflow screenshots</li></ul></div>
      <div class="secure-guide caution"><h3>△ Confidential — only when needed</h3><p>Upload only when relevant to the engagement, and redact details Nexus does not need.</p><ul><li>P&Ls, budgets and forecasts</li><li>Internal pricing and strategy</li><li>Contracts and customer lists</li><li>CRM exports and internal performance reports</li></ul></div>
      <div class="secure-guide restricted"><h3>✕ Never upload here</h3><p>The standard portal is not intended for restricted credentials or highly sensitive regulated data.</p><ul><li>Passwords, API keys or MFA codes</li><li>Bank-login credentials or full card numbers</li><li>SSNs, passport/license copies</li><li>Payroll/tax files with personal identifiers</li><li>Medical records or crypto private keys</li></ul></div>
    </div>
    <div class="secure-doc-note"><b>Financial information:</b> A relevant P&L, budget, forecast or operating report can be appropriate. Prefer summaries or redacted copies when possible. Do not upload banking credentials, full payment-card data, or unnecessary personal identifiers.</div>
    <div class="secure-doc-grid">
      <div class="secure-doc-section"><h2>Requested from You</h2><p class="section-copy">Specific information Nexus needs, why it is needed, what a good file looks like, and what should be removed first.</p><div id="requestedDocs"></div></div>
      <div class="secure-doc-section"><h2>Shared with You</h2><p class="section-copy">Reports, revised files, deliverables and other documents Nexus has returned to your company.</p><div id="sharedDocs"></div></div>
      <div class="secure-doc-section"><h2>Company Library</h2><p class="section-copy">Reference files worth keeping available over time, such as approved SOPs, policies, templates and current business documentation.</p><div id="libraryDocs"></div></div>
      <div class="secure-doc-section"><h2>Upload Other File</h2><p class="section-copy">Use this when a file is relevant but Nexus has not specifically requested it.</p>
        <div class="secure-upload"><form id="secureUploadForm">
          <div class="form-grid"><div class="field"><label>File</label><input id="secureDocFile" type="file" required accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg"></div><div class="field"><label>Fulfills a Nexus request?</label><select id="secureRequest"><option value="">No — general upload</option></select></div></div>
          <div class="form-grid"><div class="field"><label>Document type</label><select id="secureCategory"><option value="General">General business document</option><option value="Client Source">Source / reference material</option><option value="Report">Report</option><option value="Process Document">SOP / process document</option><option value="Measurement">Measurement / KPI evidence</option><option value="Company Library">Company Library reference</option></select></div><div class="field"><label>Sensitivity</label><select id="secureSensitivity"><option value="standard">Standard business information</option><option value="confidential">Confidential business information</option></select></div></div>
          <div class="field"><label>Why are you sharing this? (optional)</label><textarea id="secureNote" placeholder="Example: Current weekly sales report for the reporting-workflow review."></textarea></div>
          <label class="secure-policy-check"><input id="secureConfirm" type="checkbox" required><span>I confirm this file is relevant to Nexus work and does not contain passwords, API secrets, MFA codes, full payment-card data, SSNs, medical records, crypto private keys, or other restricted information that Nexus has not expressly approved.</span></label>
          <button class="btn primary" type="submit">Upload securely</button><p class="small">PDF, DOCX, XLSX, CSV, TXT, PNG or JPG · Maximum 25 MB · Access is limited to the authenticated company workspace and authorized Nexus administrators.</p>
        </form></div>
        <div class="secure-subhead">Your recent submissions</div><div id="clientSubmissions"></div>
      </div>
    </div>
    <div id="documentList" style="display:none"></div>`;

  document.body.insertAdjacentHTML('beforeend',`
    <div id="requestDocModal" class="modal"><div class="modal-card"><div class="toolbar"><div><div class="eyebrow">Nexus administrator</div><h2 style="margin:4px 0 0">Request a document</h2></div><button id="closeRequestDoc" class="btn secondary" type="button">Close</button></div><form id="requestDocForm"><div class="field"><label>What do you need?</label><input id="requestTitle" required placeholder="Example: Current lead-handling SOP"></div><div class="field"><label>Why is it needed?</label><textarea id="requestPurpose" placeholder="Explain how this will be used in the engagement."></textarea></div><div class="field"><label>Good examples</label><textarea id="requestExamples" placeholder="Example: SOP, process map, written instructions, screenshots."></textarea></div><div class="field"><label>What should the client remove or redact?</label><textarea id="requestRedaction" placeholder="Example: Remove passwords, customer SSNs and payment-card information."></textarea></div><div class="form-grid"><div class="field"><label>Sensitivity expected</label><select id="requestSensitivity"><option value="standard">Standard business information</option><option value="confidential">Confidential business information</option></select></div><div class="field"><label>Due date (optional)</label><input id="requestDue" type="date"></div></div><button class="btn primary" type="submit">Send request</button></form></div></div>`);

  if(state.admin){$('secureAdminBar').innerHTML='<button id="newDocumentRequestBtn" class="btn primary" type="button">+ Request document</button>';$('newDocumentRequestBtn').onclick=()=>$('requestDocModal').classList.add('show')}
  $('closeRequestDoc').onclick=()=>$('requestDocModal').classList.remove('show');$('requestDocModal').onclick=e=>{if(e.target===$('requestDocModal'))$('requestDocModal').classList.remove('show')};

  async function loadRequests(){
    if(!state.companyId){requests=[];return}
    const {data,error}=await sb.from('nexus_document_requests').select('*').eq('company_id',state.companyId).order('created_at',{ascending:false});
    if(error){console.error(error);requests=[];return}
    requests=data||[];
  }

  function fileRow(d){return '<div class="secure-file-row"><div class="grow"><div class="request-meta"><span class="sensitivity '+esc(d.sensitivity||'standard')+'">'+(d.sensitivity==='confidential'?'Confidential':'Standard')+'</span><span class="pill">'+esc(d.category||'General')+'</span></div><b>'+esc(d.file_name)+'</b><div class="small">'+esc(d.note||'')+'</div><div class="small">'+fmtDt(d.created_at)+'</div></div><button class="btn secondary secure-download" data-id="'+d.id+'" type="button">Download</button></div>'}

  function renderRequests(){
    const box=$('requestedDocs');if(!box)return;
    const visible=requests.filter(r=>!['cancelled'].includes(r.status));
    box.innerHTML=visible.length?visible.map(r=>'<div class="request-card '+(r.status==='received'?'received':'')+'"><div class="request-meta"><span class="pill">'+esc(r.status)+'</span><span class="sensitivity '+esc(r.sensitivity)+'">'+(r.sensitivity==='confidential'?'Confidential':'Standard')+'</span><span class="pill">'+esc(fmtDate(r.due_date))+'</span></div><h3>'+esc(r.title)+'</h3>'+(r.purpose?'<div class="small"><b>Why Nexus needs it:</b> '+esc(r.purpose)+'</div>':'')+(r.examples?'<div class="small"><b>Good examples:</b> '+esc(r.examples)+'</div>':'')+(r.redaction_guidance?'<div class="small"><b>Remove / redact first:</b> '+esc(r.redaction_guidance)+'</div>':'')+'<div class="actions" style="margin-top:10px">'+(r.status==='requested'?'<button class="btn primary upload-for-request" data-id="'+r.id+'" type="button">Upload for this request</button>':'')+(state.admin?'<select class="secure-status request-status-admin" data-id="'+r.id+'"><option value="requested" '+(r.status==='requested'?'selected':'')+'>Requested</option><option value="received" '+(r.status==='received'?'selected':'')+'>Received</option><option value="waived" '+(r.status==='waived'?'selected':'')+'>Waived</option><option value="cancelled" '+(r.status==='cancelled'?'selected':'')+'>Cancelled</option></select>':'')+'</div></div>').join(''):'<div class="secure-empty">No document requests right now. Nexus will place specific requests here when information is needed.</div>';
    const open=requests.filter(r=>r.status==='requested');$('secureRequest').innerHTML='<option value="">No — general upload</option>'+open.map(r=>'<option value="'+r.id+'">'+esc(r.title)+'</option>').join('');
    document.querySelectorAll('.upload-for-request').forEach(b=>b.onclick=()=>{$('secureRequest').value=b.dataset.id;$('secureUploadForm').scrollIntoView({behavior:'smooth',block:'center'});$('secureDocFile').focus()});
    document.querySelectorAll('.request-status-admin').forEach(s=>s.onchange=async()=>{const {error}=await sb.from('nexus_document_requests').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.id);if(error)return toast(error.message);await loadRequests();renderSecure()});
  }

  function renderSecure(){
    renderRequests();
    const docs=state.docs||[];
    const shared=docs.filter(d=>d.document_area==='nexus_shared'||d.source_role==='nexus'&&d.document_area!=='company_library');
    const library=docs.filter(d=>d.document_area==='company_library');
    const submitted=docs.filter(d=>d.source_role!=='nexus'&&d.document_area!=='company_library').slice(0,8);
    $('sharedDocs').innerHTML=shared.length?shared.map(fileRow).join(''):'<div class="secure-empty">No Nexus-shared documents yet.</div>';
    $('libraryDocs').innerHTML=library.length?library.map(fileRow).join(''):'<div class="secure-empty">No Company Library documents yet.</div>';
    $('clientSubmissions').innerHTML=submitted.length?submitted.map(fileRow).join(''):'<div class="secure-empty">No submissions yet.</div>';
    document.querySelectorAll('.secure-download').forEach(b=>b.onclick=()=>download(b.dataset.id));
  }

  async function refresh(){if(loading)return;loading=true;try{await loadRequests();renderSecure()}finally{loading=false}}

  $('requestDocForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.admin||!state.companyId)return;const row={company_id:state.companyId,project_id:state.projects?.[0]?.id||null,title:$('requestTitle').value.trim(),purpose:$('requestPurpose').value.trim()||null,examples:$('requestExamples').value.trim()||null,redaction_guidance:$('requestRedaction').value.trim()||null,sensitivity:$('requestSensitivity').value,due_date:$('requestDue').value||null,requested_by:state.user.id};const {data,error}=await sb.from('nexus_document_requests').insert(row).select().single();if(error)return toast(error.message);await log('document_requested','document_request',data.id,'Document requested: '+row.title);e.target.reset();$('requestDocModal').classList.remove('show');toast('Document request added.');await refresh()});

  $('secureUploadForm').addEventListener('submit',async e=>{e.preventDefault();const f=$('secureDocFile').files[0];if(!f)return;if(f.size>26214400)return toast('File exceeds 25 MB.');if(!$('secureConfirm').checked)return toast('Please confirm the upload policy first.');const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=state.companyId+'/'+Date.now()+'-'+crypto.randomUUID()+'-'+safe;const {error:u}=await sb.storage.from('nexus-client-documents').upload(path,f,{contentType:f.type||undefined});if(u)return toast(u.message);const category=$('secureCategory').value,sourceRole=state.admin?'nexus':'client',area=category==='Company Library'?'company_library':state.admin?'nexus_shared':'client_submission';const row={company_id:state.companyId,project_id:state.projects?.[0]?.id||null,storage_path:path,file_name:f.name,mime_type:f.type||null,size_bytes:f.size,category,status:'shared',note:$('secureNote').value.trim()||null,uploaded_by:state.user.id,sensitivity:$('secureSensitivity').value,request_id:$('secureRequest').value||null,document_area:area,source_role:sourceRole};const {data,error}=await sb.from('nexus_documents').insert(row).select().single();if(error){await sb.storage.from('nexus-client-documents').remove([path]);return toast(error.message)}await log('document_uploaded','document',data.id,(state.admin?'Nexus':'Client')+' uploaded '+f.name);e.target.reset();toast('Document uploaded.');await workspace();await refresh()});

  const hidden=$('documentList');if(hidden){const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(refresh,80)});observer.observe(hidden,{childList:true,subtree:true})}
  if(nav)nav.addEventListener('click',refresh);
  await refresh();
}
