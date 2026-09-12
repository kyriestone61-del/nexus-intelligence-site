import {functionFailure} from './portal-function-errors.js';
import {persistEvidence} from './portal-evidence-upload.js';
import {confidenceText,freeDiagnosisFilename,freeReportMarkup,freeReportStateMarkup,freeSections,printFreeDiagnosis,reportDate,reportText} from './portal-free-diagnosis-report.js?v=20260911-free-diagnosis-v3';
export {freeReportMarkup,freeSections};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function discoveryState(data){
 if(!data)return {state:'loading',label:'Loading discovery evidence…'};
 const documents=data.documents.filter(d=>d.state!=='removed'),latest=data.reports[0],complete=data.reports.find(r=>r.status==='complete');
 if(latest?.status==='generating')return {state:'generating',label:'Generating Free Diagnosis',complete};
 if(latest?.status==='failed'&&latest.evidence_revision===data.revision)return {state:'failed',label:'Diagnosis generation failed',complete};
 if(complete&&complete.evidence_revision!==data.revision)return {state:'outdated',label:'Outdated · new evidence added or removed',complete};
 if(latest?.status==='failed')return {state:'failed',label:'Diagnosis generation failed',complete};
 if(complete)return {state:'complete',label:'Free Diagnosis complete',complete};
 if(!documents.length)return {state:'not_ready',label:'Not ready · upload discovery material first'};
 if(documents.some(d=>d.state==='failed'))return {state:'not_ready',label:'Not ready · retry or remove failed documents'};
 if(documents.some(d=>d.state!=='parsed'))return {state:'processing',label:'Processing discovery documents'};
 return {state:'ready',label:'Ready to generate Free Diagnosis'};
}
export function mountDiscoveryEvidence(root,portal,{onChange=()=>{},navigate=()=>{}}={}){
 const roots=root?.nodeType?{transcript:root,freeDiagnosis:root,reviewFindings:root}:root||{};
 const transcriptRoot=roots.transcript,freeDiagnosisRoot=roots.freeDiagnosis,reviewFindingsRoot=roots.reviewFindings;
 if(!transcriptRoot||!freeDiagnosisRoot||!reviewFindingsRoot)throw new Error('Discovery workflow requires dedicated Step 1, Step 2, and Step 3 roots.');
 const eventRoots=[...new Set([transcriptRoot,freeDiagnosisRoot,reviewFindingsRoot])];
 const {sb,state}=portal;let data=null,company=null,project=null,busy=false,queueing=false,message='',error='',epoch=0,selectedVersion=null,pollTimer=null,generationRequest=null;
 const same=(co,pr,v)=>state.companyId===co&&company===co&&project===pr&&epoch===v;
 const query=selector=>eventRoots.map(node=>node.querySelector(selector)).find(Boolean)||null;
 async function command(action='view',extra={}){
  const co=company,pr=project,v=epoch;
  const result=await sb.rpc('relystra_discovery_workspace',{p_company_id:co,p_project_id:pr,p_action:action,...extra});
  if(result.error)throw result.error;
  if(same(co,pr,v)){data=result.data;state.discoveryEvidence={company_id:co,project_id:pr,...data};const removed=new Set(data.documents.filter(d=>d.state==='removed').map(d=>d.id));state.docs=(state.docs||[]).map(d=>({...d,discovery_removed:removed.has(d.id)}));render();onChange(data)}
  return result.data;
 }
 function reviewSection(key,label,items=[]){return items.length?`<section class="relystra-review-group" data-review-group="${esc(key)}"><header><span>${String(['key_findings','opportunity_areas','missing_information'].indexOf(key)+1).padStart(2,'0')}</span><div><h2>${esc(label)}</h2><p>${key==='key_findings'?'The evidence-backed observations that should guide the engagement.':key==='opportunity_areas'?'The areas with the clearest potential to improve the current workflow.':'Unknowns that should stay explicit until stronger evidence is available.'}</p></div></header><div class="relystra-review-list">${items.map((item,index)=>`<article class="relystra-review-finding"><div class="relystra-review-finding-number">${String(index+1).padStart(2,'0')}</div><div><h3>${key==='key_findings'?'Finding':key==='opportunity_areas'?'Priority opportunity':'Open question'} ${index+1}</h3><p>${esc(reportText(item))}</p>${confidenceText(item)?`<small class="evidence-confidence">Evidence confidence · ${esc(confidenceText(item))}</small>`:''}</div></article>`).join('')}</div></section>`:''}
 function stepOneMarkup({docs,live,parsed,failed}){return `<div class="relystra-workflow-step" data-workflow-step="1"><header><div class="eyebrow">Step 1 of 11 · Discovery intake</div><h1>Upload Discovery Material</h1><p>Add all meeting transcripts, interview notes and process documents for this engagement. Every active document is processed before diagnosis.</p></header>
  <section class="relystra-build-card"><form data-discovery-upload><label>Discovery documents<input name="documents" type="file" multiple accept=".pdf,.docx,.txt,.md,.srt,.vtt" ${busy||state.previewReadOnly?'disabled':''} required></label><label>Source category<select name="category"><option>Discovery Transcript</option><option>Discovery Material</option></select></label><p>PDF, DOCX, TXT, Markdown, SRT and VTT · up to 25 MB per file. Scanned PDFs need searchable text. Originals are retained; removing a file excludes it from future analysis.</p><button class="btn primary" ${busy||state.previewReadOnly?'disabled':''}>Upload & process documents</button></form>
  <p data-discovery-count>${live.length} uploaded · ${parsed.length} processed · ${failed.length} failed</p>
  <div class="discovery-document-list">${docs.map(d=>`<article class="relystra-build-card" data-discovery-document="${esc(d.id)}"><h3>${esc(d.file_name)}</h3><p>${esc(d.mime_type||'Unknown type')} · ${esc(d.category)} · ${esc(new Date(d.created_at).toLocaleString())}</p><p><b>${esc(d.state)}</b>${d.duplicate_of?' · Duplicate content: original retained, counted once in analysis':''}${d.chunk_count?` · ${d.chunks_processed}/${d.chunk_count} source segments reviewed`:''}</p>${d.error?`<p role="alert">${esc(d.error)}</p>`:''}${d.state!=='removed'?`<button type="button" class="btn secondary" data-doc-open="${esc(d.id)}">Open Evidence</button><button type="button" class="btn secondary" data-doc-remove="${esc(d.id)}" ${busy||state.previewReadOnly?'disabled':''}>Remove from evidence</button>${d.state==='failed'?`<button type="button" class="btn secondary" data-doc-retry="${esc(d.id)}" ${busy?'disabled':''}>Reprocess document</button>`:''}`:''}</article>`).join('')||'<p>No discovery documents have been uploaded in this engagement.</p>'}</div>
  ${live.some(d=>['uploaded','parsing'].includes(d.state))?`<button type="button" class="btn secondary" data-discovery-process ${busy?'disabled':''}>Process remaining documents</button>`:''}</section></div>`}
 function stepTwoMarkup({status,ready,complete,docs}){
  const companyName=state.companies?.find(c=>c.id===state.companyId)?.name||'your organization';
  const projectName=state.projects?.find(item=>item.id===project)?.name||'';
  const versions=(data?.reports||[]).filter(run=>run.status==='complete');
  const locked=busy||queueing||state.previewReadOnly;
  const actions=[],generationActive=['requesting','generating'].includes(status.state);
  if(!generationActive&&complete){
   actions.push(`<button type="button" class="btn secondary" data-free-diagnosis-export ${locked?'disabled':''}>Export PDF</button>`);
   actions.push(`<button type="button" class="btn secondary relystra-btn-tertiary" data-free-generate ${!ready||locked||status.state==='generating'?'disabled':''}>Regenerate</button>`);
  }else if(!generationActive&&['ready','failed'].includes(status.state))actions.push(`<button type="button" class="btn primary" data-free-generate ${!ready||locked?'disabled':''}>${status.state==='failed'?'Retry diagnosis':'Generate Free Diagnosis'}</button>`);
  if(!generationActive&&status.state==='processing')actions.push(`<button type="button" class="btn secondary" data-discovery-resume ${locked?'disabled':''}>Refresh status</button>`);
  if(!generationActive&&!complete&&['not_ready','processing','failed'].includes(status.state))actions.push('<button type="button" class="btn secondary" data-report-return-step-one>Return to Step 1</button>');
  if(!generationActive&&versions.length)actions.push(`<label><span>Report version</span><select data-free-version><option value="">Latest complete report</option>${versions.map(run=>`<option value="${esc(run.id)}" ${selectedVersion===run.id?'selected':''}>Version ${run.version} · evidence revision ${run.evidence_revision}</option>`).join('')}</select></label>`);
  const stateCopy=status.state==='complete'?'Ready for review and export.':status.state==='outdated'?'A saved version remains available while the evidence is refreshed.':'Source material and report progress remain saved to this engagement.';
  return `<div class="relystra-workflow-step relystra-report-page" data-workflow-step="2"><header class="relystra-step-context"><div class="eyebrow">Step 2 of 11 · Free Diagnosis</div><p>Review a concise, evidence-backed preliminary assessment prepared from the discovery information saved in Step 1.</p></header>
  <section class="relystra-report-controls" aria-label="Free Diagnosis report controls"><div class="relystra-report-control-status"><span>Report status</span><strong data-discovery-status>${esc(status.label)}</strong><small>${esc(stateCopy)}</small></div><div class="relystra-report-control-actions">${actions.join('')}</div>${status.state==='outdated'?'<p class="relystra-report-stale" role="status">This saved version does not include the latest discovery changes. Regenerate before approval.</p>':''}${error?`<p role="alert">The saved report could not be refreshed. ${esc(error)}</p>${generationActive?'':`<button type="button" class="btn secondary" data-discovery-refresh>Retry status check</button>`}`:''}<p data-discovery-message role="status">${esc(message)}</p></section>
  ${complete?freeReportMarkup(complete,{companyName,projectName,documents:docs,headingLevel:1,includeWorkflowNextStep:true,includeNavigation:true,showSourceEvidence:!!state.admin}):freeReportStateMarkup({status,companyName,documents:docs})}</div>`;
 }
 function stepThreeMarkup({complete}){
  const report=complete?.report||{},reviews=complete?(data.reviews||[]).filter(r=>r.run_id===complete.id):[],latestReview=reviews.at(-1),verified=latestReview?.decision==='verified',outdated=!!complete&&complete.evidence_revision!==data.revision;
  const findingCount=(report.key_findings||[]).length,opportunityCount=(report.opportunity_areas||[]).length,questionCount=(report.missing_information||[]).length;
  return `<div class="relystra-workflow-step relystra-review-page" data-workflow-step="3"><header class="relystra-step-page-head" data-step-page="review-findings"><div class="relystra-step-page-copy"><div class="eyebrow">Step 3 of 11 · Review Findings</div><h1>Review Findings</h1><p>Confirm the important findings, identify what matters most, and correct anything that should not carry into the Full Diagnosis.</p></div><aside class="relystra-step-state" aria-label="Step status"><span>${outdated?'Needs a fresh report':verified?'Review complete':'Decision needed'}</span><strong>${outdated?'Evidence changed':verified?'Findings verified':'Client review pending'}</strong><small>Next · Full Diagnosis &amp; Approval</small></aside></header>
  ${complete?`<section class="relystra-review-summary" aria-label="Findings review summary"><div><span>Report being reviewed</span><strong>Free Diagnosis · Version ${esc(complete.version)}</strong><button type="button" class="relystra-text-action" data-review-back>Open the complete report in Step 2 →</button></div><dl><div><dt>Important findings</dt><dd>${findingCount}</dd></div><div><dt>Priority areas</dt><dd>${opportunityCount}</dd></div><div><dt>Open questions</dt><dd>${questionCount}</dd></div></dl></section>
  <main class="relystra-review-workspace"><div class="relystra-review-findings">${reviewSection('key_findings','Important Findings',report.key_findings||[])}${reviewSection('opportunity_areas','Areas That Matter Most',report.opportunity_areas||[])}${reviewSection('missing_information','Information Still Missing',report.missing_information||[])}</div><aside class="relystra-review-decision"><div class="relystra-review-decision-head"><span>Review decision</span><h2>${verified?'Findings verified':'Are these findings ready to continue?'}</h2><p>${verified?'This version is confirmed and remains available to revisit. Add a correction only if the underlying record should change.':'Confirm that the findings are accurate enough for deeper diagnosis, or add a correction that becomes new evidence.'}</p></div>${outdated?'<p class="relystra-review-warning" role="status">Evidence changed after this report. Regenerate the Free Diagnosis before confirming it.</p>':''}<form data-discovery-review><label><span>Correction or additional context <small>(optional when confirming)</small></span><textarea name="note" rows="5" placeholder="Name the finding and explain what should change. Do not include passwords or secrets."></textarea></label><div class="relystra-review-actions"><button class="btn primary" name="decision" value="verified" ${busy||outdated||state.previewReadOnly?'disabled':''}>${verified?'Reconfirm & continue':'Confirm findings & continue'}</button><button class="btn secondary" name="decision" value="correction_requested" ${busy||outdated||state.previewReadOnly?'disabled':''}>Save a correction</button></div></form>${latestReview?`<div class="relystra-review-record"><span>Latest review</span><strong>${verified?'Verified':'Correction requested'}${latestReview.created_at?` · ${esc(reportDate(latestReview.created_at))}`:''}</strong>${latestReview.note?`<p>${esc(latestReview.note)}</p>`:''}</div>`:''}${verified?'<button type="button" class="btn secondary relystra-review-continue" data-review-continue>Continue to Full Diagnosis →</button>':''}</aside></main>`:`<section class="relystra-review-empty"><div><span>Step 2 required</span><h2>Generate the Free Diagnosis first.</h2><p>The findings review opens when a complete report is available. Your uploaded discovery material remains saved.</p></div><button type="button" class="btn primary" data-review-back>Go to Free Diagnosis</button></section>`}
  ${state.admin?'<p class="relystra-review-admin-link"><button type="button" class="btn secondary" data-discovery-commercial>Prepare first Build scope & Basic Report</button></p>':''}</div>`
 }
 function render(){
  // Keep local file and note inputs through status refreshes. Browsers cannot restore a FileList from HTML.
  const selectedInput=transcriptRoot.querySelector('[data-discovery-upload] input[type=file]');
  const selectedCategory=transcriptRoot.querySelector('[data-discovery-upload] select')?.value;
  const reviewNote=reviewFindingsRoot.querySelector('[data-discovery-review] textarea')?.value;
  const status=queueing?{...discoveryState(data),state:'requesting',label:'Requesting Free Diagnosis…'}:discoveryState(data),docs=data?.documents||[],live=docs.filter(d=>d.state!=='removed'),parsed=live.filter(d=>d.state==='parsed'),failed=live.filter(d=>d.state==='failed');
  const ready=live.length>0&&parsed.length===live.length,complete=selectedVersion?data?.reports.find(r=>r.id===selectedVersion):status.complete;
  const context={status,docs,live,parsed,failed,ready,complete};
  if(eventRoots.length===1)eventRoots[0].innerHTML=stepOneMarkup(context)+stepTwoMarkup(context)+stepThreeMarkup(context);
  else{transcriptRoot.innerHTML=stepOneMarkup(context);freeDiagnosisRoot.innerHTML=stepTwoMarkup(context);reviewFindingsRoot.innerHTML=stepThreeMarkup(context)}
  if(selectedInput){selectedInput.disabled=busy||state.previewReadOnly;transcriptRoot.querySelector('[data-discovery-upload] input[type=file]')?.replaceWith(selectedInput)}
  if(selectedCategory&&transcriptRoot.querySelector('[data-discovery-upload] select'))transcriptRoot.querySelector('[data-discovery-upload] select').value=selectedCategory;
  if(reviewNote&&reviewFindingsRoot.querySelector('[data-discovery-review] textarea'))reviewFindingsRoot.querySelector('[data-discovery-review] textarea').value=reviewNote;
 }
 async function drive(){
  const co=company,pr=project,v=epoch;
  message='Processing saved evidence. You can leave and return; completed stages are retained.';render();
  const result=await sb.functions.invoke('nexus-diagnosis-execute',{body:{operation:'discovery_kick',company_id:co,engagement_id:data.id}});
  if(result.error||result.data?.ok!==true)throw await functionFailure(result,'Discovery processing');
  if(!same(co,pr,v))return;
  startPolling();
 }
 function startPolling(){
  clearTimeout(pollTimer);const co=company,pr=project,v=epoch;
  pollTimer=setTimeout(async()=>{if(!same(co,pr,v))return;try{await command();const status=discoveryState(data);if(['processing','generating'].includes(status.state))startPolling();else{message=status.state==='complete'?'Free Diagnosis saved. Review your findings below.':'Saved status refreshed.';render();}}catch(e){error='Saved status could not be refreshed. Your evidence is safe.';render();startPolling();}},3000);
 }
 async function generate(){
  queueing=true;render();
  generationRequest??=crypto.randomUUID();
  const co=company,pr=project,v=epoch;
  try{
  const result=await sb.rpc('relystra_request_free_diagnosis',{p_company_id:co,p_project_id:pr,p_request_id:generationRequest,p_regenerate:!!data?.reports.length});
  if(result.error)throw result.error;
  if(!same(co,pr,v))return;
  generationRequest=null;await command();await drive();
  }finally{if(same(co,pr,v)){queueing=false;render();}}
 }

 async function exportFreeDiagnosis(button){
  const run=selectedVersion?data?.reports.find(item=>item.id===selectedVersion):discoveryState(data).complete;
  if(!run?.report)return;
  const companyName=state.companies?.find(item=>item.id===state.companyId)?.name||'Client';
  const fallback=freeDiagnosisFilename(companyName,run.completed_at||run.created_at);
  try{
   if(window.NexusDiagnosisPdf?.download)await window.NexusDiagnosisPdf.download({free_run_id:run.id},{button,fallback});
   else{printFreeDiagnosis({companyName,generatedAt:run.completed_at||run.created_at});message=`Print dialog opened for ${fallback}`;render()}
  }catch(cause){error=cause?.message||'The PDF could not be prepared. Try again.';render()}
 }

 async function act(fn){if(busy||state.previewReadOnly)return;const co=company,pr=project,v=epoch;busy=true;error='';render();try{await fn()}catch(e){if(same(co,pr,v)){error=e.message;try{await command()}catch{}}}finally{if(same(co,pr,v)){busy=false;render()}}}
 const onSubmit=event=>{
  const form=event.target;if(!form.matches('[data-discovery-upload],[data-discovery-review]'))return;event.preventDefault();
  const fd=new FormData(form),files=form.elements.documents?[...form.elements.documents.files]:[],decision=event.submitter?.value;
  act(async()=>{
   const co=company,pr=project,v=epoch;
   if(form.matches('[data-discovery-review]')){
    const run=selectedVersion?data.reports.find(r=>r.id===selectedVersion):data.reports.find(r=>r.status==='complete');const note=String(fd.get('note')||'').trim();
    await command(decision,{p_run_id:run.id,p_note:note});
    if(decision==='correction_requested')files.push(new File([note],`Discovery review correction ${Date.now()}.txt`,{type:'text/plain'}));
    else{const noteInput=query('[data-discovery-review] textarea');if(noteInput)noteInput.value='';message='Your review has been saved.';navigate('diagnosis');return;}
   }
   const failures=[];
   for(const file of files){if(!same(co,pr,v))return;try{
    if(!/\.(pdf|docx|txt|md|srt|vtt)$/i.test(file.name))throw new Error(`${file.name}: unsupported format. Choose PDF, DOCX, TXT, Markdown, SRT or VTT.`);
    const doc=await persistEvidence(sb,{file,companyId:co,userId:state.user.id,projectId:pr,category:String(fd.get('category')||'Discovery Material'),sourceRole:state.admin?'nexus':'client'});
    if(!same(co,pr,v))return;state.docs=[doc,...(state.docs||[]).filter(d=>d.id!==doc.id)];await command('attach',{p_document_id:doc.id});
   }catch(e){failures.push(e.message)}}
   await command();if(failures.length)error=failures.join('\n');else{const input=query('[data-discovery-upload] input');if(input)input.value='';}await drive();
  });
 };
 const onClick=event=>{const b=event.target.closest('button');if(!b)return;
  if(b.dataset.docOpen)return act(async()=>{const doc=(state.docs||[]).find(d=>d.id===b.dataset.docOpen);if(!doc)throw Error('Evidence metadata unavailable. Refresh saved status.');const r=await sb.storage.from('nexus-client-documents').createSignedUrl(doc.storage_path,60);if(r.error)throw r.error;const a=document.createElement('a');a.href=r.data.signedUrl;a.target='_blank';a.rel='noopener';a.click();});
  if(b.hasAttribute('data-discovery-commercial'))return navigate('commercial-report');
  if(b.hasAttribute('data-review-back'))return navigate('free-diagnosis');
  if(b.hasAttribute('data-review-continue'))return navigate('diagnosis');
  if(b.hasAttribute('data-report-return-step-one'))return navigate('transcript');
  if(b.dataset.docRemove)return act(()=>command('remove',{p_document_id:b.dataset.docRemove}));
  if(b.dataset.docRetry)return act(async()=>{await command('reprocess',{p_document_id:b.dataset.docRetry});await drive()});
  if(b.hasAttribute('data-free-generate'))return act(async()=>{selectedVersion=null;await generate()});
  if(b.hasAttribute('data-discovery-resume'))return act(()=>command());
  if(b.hasAttribute('data-discovery-process'))return act(async()=>{await command('process');await drive()});
  if(b.hasAttribute('data-discovery-refresh'))return act(()=>command());
  if(b.hasAttribute('data-report-review'))return navigate('review-findings');
  if(b.hasAttribute('data-free-diagnosis-export'))return exportFreeDiagnosis(b);
 };
 const onVersionChange=event=>{if(event.target.matches('[data-free-version]')){selectedVersion=event.target.value||null;render()}};
 for(const node of eventRoots){node.addEventListener('submit',onSubmit);node.addEventListener('click',onClick);node.addEventListener('change',onVersionChange)}
 return {async refresh(snapshot){const co=state.companyId,pr=snapshot?.project_id||null;if(company!==co||project!==pr){clearTimeout(pollTimer);generationRequest=null;eventRoots.forEach(node=>node.replaceChildren());epoch++;company=co;project=pr;data=null;busy=false;queueing=false;error='';message='';selectedVersion=null;}if(!co){eventRoots.forEach(node=>{node.innerHTML='<p>Select a client company to open Discovery.</p>'});return}if(busy)return;render();try{await command();if(['processing','generating'].includes(discoveryState(data).state))startPolling()}catch(e){error=e.message;render()}},destroy(){clearTimeout(pollTimer);epoch++;for(const node of eventRoots){node.removeEventListener('submit',onSubmit);node.removeEventListener('click',onClick);node.removeEventListener('change',onVersionChange);node.replaceChildren()}},get data(){return data}};
}
