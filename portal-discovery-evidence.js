import {functionFailure} from './portal-function-errors.js';
import {persistEvidence} from './portal-evidence-upload.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const freeSections={business_context:'Business Context',current_processes:'Current Processes',observed_problems:'Observed Problems',key_findings:'Key Findings',opportunity_areas:'Opportunity Areas',missing_information:'Missing Information',evidence_confidence:'Evidence Confidence'};
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
export function freeReportMarkup(run){
 if(!run?.report)return '';
 const r=run.report;return `<article class="relystra-free-report" data-free-report="${esc(run.id)}"><h2>Basic / Free Diagnosis · version ${esc(run.version)}</h2><p>Based on ${esc(r.coverage?.documents||run.document_ids?.length||0)} documents. Review these findings before agreeing further work.</p>${Object.entries(freeSections).map(([key,label])=>`<section><h3>${label}</h3>${(r[key]||[]).map(item=>`<p>${esc(item.text)} <small class="evidence-confidence">${esc(item.confidence.replaceAll('_',' '))}</small></p>`).join('')}</section>`).join('')}${r.contradictions?.length?`<section><h3>Conflicting information to resolve</h3>${r.contradictions.map(x=>`<p>${esc(x.text)}</p>`).join('')}</section>`:''}<details><summary>Sources and supporting context</summary>${(r.evidence_ledger||[]).map(x=>`<div><b>${esc(x.source_id)}</b>${(x.extraction?.observations||[]).map(o=>`<p>${esc(o.statement)}<br><q>${esc(o.excerpt)}</q></p>`).join('')}</div>`).join('')}</details></article>`;
}
export function mountDiscoveryEvidence(root,portal,{onChange=()=>{},navigate=()=>{}}={}){
 const {sb,state}=portal;let data=null,company=null,project=null,busy=false,message='',error='',epoch=0,selectedVersion=null,pollTimer=null,generationRequest=null;
 const same=(co,pr,v)=>state.companyId===co&&company===co&&project===pr&&epoch===v;
 async function command(action='view',extra={}){
  const co=company,pr=project,v=epoch;
  const result=await sb.rpc('relystra_discovery_workspace',{p_company_id:co,p_project_id:pr,p_action:action,...extra});
  if(result.error)throw result.error;
  if(same(co,pr,v)){data=result.data;state.discoveryEvidence={company_id:co,project_id:pr,...data};const removed=new Set(data.documents.filter(d=>d.state==='removed').map(d=>d.id));state.docs=(state.docs||[]).map(d=>({...d,discovery_removed:removed.has(d.id)}));render();onChange(data)}
  return result.data;
 }
 function render(){
  // Keep a selected local file input through background status refreshes. Browsers cannot restore its FileList from HTML.
  const selectedInput=!busy?root.querySelector('[data-discovery-upload] input[type=file]'):null;
  const selectedCategory=root.querySelector('[data-discovery-upload] select')?.value;
  const reviewNote=!busy?root.querySelector('[data-discovery-review] textarea')?.value:null;
  const status=discoveryState(data),docs=data?.documents||[],live=docs.filter(d=>d.state!=='removed'),parsed=live.filter(d=>d.state==='parsed'),failed=live.filter(d=>d.state==='failed');
  const ready=live.length>0&&parsed.length===live.length;const complete=selectedVersion?data?.reports.find(r=>r.id===selectedVersion):status.complete;
  root.innerHTML=`<header><div class="eyebrow">Step 1 · Discovery intake</div><h1>Upload Discovery Material</h1><p>Add all meeting transcripts, interview notes and process documents for this engagement. Every active document is processed before diagnosis.</p></header>
  <section class="relystra-build-card"><form data-discovery-upload><label>Discovery documents<input name="documents" type="file" multiple accept=".pdf,.docx,.txt,.md,.srt,.vtt" ${busy||state.previewReadOnly?'disabled':''} required></label><label>Source category<select name="category"><option>Discovery Transcript</option><option>Discovery Material</option></select></label><p>PDF, DOCX, TXT, Markdown, SRT and VTT · up to 25 MB per file. Scanned PDFs need searchable text. Originals are retained; removing a file excludes it from future analysis.</p><button class="btn primary" ${busy||state.previewReadOnly?'disabled':''}>Upload & process documents</button></form>
  <p data-discovery-count>${live.length} uploaded · ${parsed.length} processed · ${failed.length} failed</p>
  <div class="discovery-document-list">${docs.map(d=>`<article class="relystra-build-card" data-discovery-document="${esc(d.id)}"><h3>${esc(d.file_name)}</h3><p>${esc(d.mime_type||'Unknown type')} · ${esc(d.category)} · ${esc(new Date(d.created_at).toLocaleString())}</p><p><b>${esc(d.state)}</b>${d.duplicate_of?' · Duplicate content: original retained, counted once in analysis':''}${d.chunk_count?` · ${d.chunks_processed}/${d.chunk_count} source segments reviewed`:''}</p>${d.error?`<p role="alert">${esc(d.error)}</p>`:''}${d.state!=='removed'?`<button type="button" class="btn secondary" data-doc-open="${esc(d.id)}">Open Evidence</button><button type="button" class="btn secondary" data-doc-remove="${esc(d.id)}" ${busy||state.previewReadOnly?'disabled':''}>Remove from evidence</button>${d.state==='failed'?`<button type="button" class="btn secondary" data-doc-retry="${esc(d.id)}" ${busy?'disabled':''}>Reprocess document</button>`:''}`:''}</article>`).join('')||'<p>No discovery documents have been uploaded in this engagement.</p>'}</div>
  ${live.some(d=>['uploaded','parsing'].includes(d.state))?`<button type="button" class="btn secondary" data-discovery-process ${busy?'disabled':''}>Process remaining documents</button>`:''}</section>
  <section class="relystra-build-card"><div class="eyebrow">Step 2 · Free Diagnosis</div><h2 data-discovery-status>${esc(status.label)}</h2><p>Relystra synthesizes every processed source, checks contradictions and preserves uncertainty. No payment is needed for this initial diagnosis.</p>${data?.reports[0]?.error?`<p role="alert">${esc(data.reports[0].error)}</p>`:''}${status.state==='outdated'?'<p role="status">The previous report is retained below. Review and regenerate it to include the current evidence set.</p>':''}<button type="button" class="btn primary" data-free-generate ${!ready||busy||status.state==='generating'||state.previewReadOnly?'disabled':''}>${data?.reports.length?'Regenerate Free Diagnosis':'Generate Free Diagnosis'}</button>${status.state==='generating'?`<button type="button" class="btn secondary" data-discovery-resume >Refresh diagnosis status</button>`:''}${!ready?'<p>Process at least one document and resolve any failed uploads to enable generation.</p>':''}<p data-discovery-message role="status">${esc(message)}</p>${error?`<p role="alert">${esc(error)}</p><button type="button" class="btn secondary" data-discovery-refresh>Refresh saved status</button>`:''}</section>
  <section class="relystra-build-card"><div class="eyebrow">Step 3 · Review Findings</div>${data?.reports.some(r=>r.status==='complete')?`<label>Diagnosis history<select data-free-version><option value="">Latest complete report</option>${data.reports.filter(r=>r.status==='complete').map(r=>`<option value="${esc(r.id)}" ${selectedVersion===r.id?'selected':''}>Version ${r.version} · evidence revision ${r.evidence_revision}</option>`).join('')}</select></label>`:''}${freeReportMarkup(complete)||'<p>Your structured findings will appear here after all documents are processed and Free Diagnosis completes.</p>'}${complete?`<form data-discovery-review><label>Corrections or additional context<textarea name="note" rows="4" placeholder="Explain any incorrect or missing information."></textarea></label><button class="btn primary" name="decision" value="verified" ${busy||complete.evidence_revision!==data.revision||state.previewReadOnly?'disabled':''}>Verify these findings</button><button class="btn secondary" name="decision" value="correction_requested" ${busy||complete.evidence_revision!==data.revision||state.previewReadOnly?'disabled':''}>Save correction as new evidence</button></form>${(data.reviews||[]).filter(r=>r.run_id===complete.id).map(r=>`<p>${r.decision==='verified'?'Findings verified':'Correction requested'} · ${esc(r.note)}</p>`).join('')}`:''}</section>
  <section class="relystra-build-card"><button type="button" class="btn primary" data-discovery-full>Continue to Full Diagnosis</button><h2>Step 4 · Full Diagnosis / Action Planning</h2><p>After review, Relystra confirms the first Build and its commercial terms. Full Diagnosis and the deeper Roadmap remain included in the first paid engagement.</p>${state.admin?'<button type="button" class="btn secondary" data-discovery-commercial>Prepare first Build scope & Basic Report</button>':''}</section>`;
  if(selectedInput?.files?.length)root.querySelector('[data-discovery-upload] input[type=file]')?.replaceWith(selectedInput);
  if(selectedCategory)root.querySelector('[data-discovery-upload] select').value=selectedCategory;
  if(reviewNote&&root.querySelector('[data-discovery-review] textarea'))root.querySelector('[data-discovery-review] textarea').value=reviewNote;
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
  generationRequest??=crypto.randomUUID();
  const co=company,pr=project,v=epoch;
  const result=await sb.rpc('relystra_request_free_diagnosis',{p_company_id:co,p_project_id:pr,p_request_id:generationRequest,p_regenerate:!!data?.reports.length});
  if(result.error)throw result.error;
  if(!same(co,pr,v))return;
  generationRequest=null;await command();await drive();
 }

 async function act(fn){if(busy||state.previewReadOnly)return;const co=company,pr=project,v=epoch;busy=true;error='';render();try{await fn()}catch(e){if(same(co,pr,v)){error=e.message;try{await command()}catch{}}}finally{if(same(co,pr,v)){busy=false;render()}}}
 root.addEventListener('submit',event=>{
  const form=event.target;if(!form.matches('[data-discovery-upload],[data-discovery-review]'))return;event.preventDefault();
  const fd=new FormData(form),files=form.elements.documents?[...form.elements.documents.files]:[],decision=event.submitter?.value;
  act(async()=>{
   const co=company,pr=project,v=epoch;
   if(form.matches('[data-discovery-review]')){
    const run=selectedVersion?data.reports.find(r=>r.id===selectedVersion):data.reports.find(r=>r.status==='complete');const note=String(fd.get('note')||'').trim();
    await command(decision,{p_run_id:run.id,p_note:note});
    if(decision==='correction_requested')files.push(new File([note],`Discovery review correction ${Date.now()}.txt`,{type:'text/plain'}));
    else{message='Your review has been saved.';return;}
   }
   const failures=[];
   for(const file of files){if(!same(co,pr,v))return;try{
    if(!/\.(pdf|docx|txt|md|srt|vtt)$/i.test(file.name))throw new Error(`${file.name}: unsupported format. Choose PDF, DOCX, TXT, Markdown, SRT or VTT.`);
    const doc=await persistEvidence(sb,{file,companyId:co,userId:state.user.id,projectId:pr,category:String(fd.get('category')||'Discovery Material'),sourceRole:state.admin?'nexus':'client'});
    if(!same(co,pr,v))return;state.docs=[doc,...(state.docs||[]).filter(d=>d.id!==doc.id)];await command('attach',{p_document_id:doc.id});
   }catch(e){failures.push(e.message)}}
   await command();if(failures.length)error=failures.join('\n');await drive();
  });
 });
 root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-discovery-full'))return navigate('diagnosis');
  if(b.dataset.docOpen)return act(async()=>{const doc=(state.docs||[]).find(d=>d.id===b.dataset.docOpen);if(!doc)throw Error('Evidence metadata unavailable. Refresh saved status.');const r=await sb.storage.from('nexus-client-documents').createSignedUrl(doc.storage_path,60);if(r.error)throw r.error;const a=document.createElement('a');a.href=r.data.signedUrl;a.target='_blank';a.rel='noopener';a.click();});
  if(b.hasAttribute('data-discovery-commercial'))return navigate('commercial-report');
  if(b.dataset.docRemove)return act(()=>command('remove',{p_document_id:b.dataset.docRemove}));
  if(b.dataset.docRetry)return act(async()=>{await command('reprocess',{p_document_id:b.dataset.docRetry});await drive()});
  if(b.hasAttribute('data-free-generate'))return act(async()=>{selectedVersion=null;await generate()});
  if(b.hasAttribute('data-discovery-resume'))return act(()=>command());
  if(b.hasAttribute('data-discovery-process'))return act(async()=>{await command('process');await drive()});
  if(b.hasAttribute('data-discovery-refresh'))return act(()=>command());
 });
 root.addEventListener('change',event=>{if(event.target.matches('[data-free-version]')){selectedVersion=event.target.value||null;render()}});
 return {async refresh(snapshot){const co=state.companyId,pr=snapshot?.project_id||null;if(company!==co||project!==pr){clearTimeout(pollTimer);generationRequest=null;root.replaceChildren();epoch++;company=co;project=pr;data=null;busy=false;error='';message='';selectedVersion=null;}if(!co){root.innerHTML='<p>Select a client company to open Discovery.</p>';return}if(busy)return;render();try{await command();if(['processing','generating'].includes(discoveryState(data).state))startPolling()}catch(e){error=e.message;render()}},destroy(){clearTimeout(pollTimer);epoch++;root.replaceChildren()},get data(){return data}};
}
