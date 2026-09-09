import {persistEvidence} from './portal-evidence-upload.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const freeSections={business_context:'Business Context',current_processes:'Current Processes',observed_problems:'Observed Problems',key_findings:'Key Findings',opportunity_areas:'Opportunity Areas',missing_information:'Missing Information',evidence_confidence:'Evidence Confidence'};
export function discoveryState(data){
 if(!data)return {state:'loading',label:'Loading discovery evidence…'};
 const documents=data.documents.filter(d=>d.state!=='removed'),latest=data.reports[0],complete=data.reports.find(r=>r.status==='complete');
 if(latest?.status==='generating')return {state:'generating',label:'Generating Free Diagnosis',complete};
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
 const {sb,state}=portal;let data=null,company=null,project=null,busy=false,message='',error='',epoch=0,selectedVersion=null;
 const same=(co,pr,v)=>state.companyId===co&&company===co&&project===pr&&epoch===v;
 async function command(action='view',extra={}){
  const co=company,pr=project,v=epoch;
  const result=await sb.rpc('relystra_discovery_workspace',{p_company_id:co,p_project_id:pr,p_action:action,...extra});
  if(result.error)throw result.error;
  if(same(co,pr,v)){data=result.data;state.discoveryEvidence={company_id:co,project_id:pr,...data};render();onChange(data)}
  return result.data;
 }
 function render(){
  const status=discoveryState(data),docs=data?.documents||[],live=docs.filter(d=>d.state!=='removed'),parsed=live.filter(d=>d.state==='parsed'),failed=live.filter(d=>d.state==='failed');
  const ready=live.length>0&&parsed.length===live.length;const complete=selectedVersion?data?.reports.find(r=>r.id===selectedVersion):status.complete;
  root.innerHTML=`<header><div class="eyebrow">Step 1 · Discovery intake</div><h1>Upload Discovery Material</h1><p>Add all meeting transcripts, interview notes and process documents for this engagement. Every active document is processed before diagnosis.</p></header>
  <section class="relystra-build-card"><form data-discovery-upload><label>Discovery documents<input name="documents" type="file" multiple accept=".pdf,.docx,.txt,.md,.srt,.vtt" ${busy||state.previewReadOnly?'disabled':''} required></label><label>Source category<select name="category"><option>Discovery Transcript</option><option>Discovery Material</option></select></label><p>PDF, DOCX, TXT, Markdown, SRT and VTT · up to 25 MB per file. Scanned PDFs need searchable text. Originals are retained; removing a file excludes it from future analysis.</p><button class="btn primary" ${busy||state.previewReadOnly?'disabled':''}>Upload & process documents</button></form>
  <p data-discovery-count>${live.length} uploaded · ${parsed.length} processed · ${failed.length} failed</p>
  <div class="discovery-document-list">${docs.map(d=>`<article class="relystra-build-card" data-discovery-document="${esc(d.id)}"><h3>${esc(d.file_name)}</h3><p>${esc(d.mime_type||'Unknown type')} · ${esc(d.category)} · ${esc(new Date(d.created_at).toLocaleString())}</p><p><b>${esc(d.state)}</b>${d.chunk_count?` · ${d.chunks_processed}/${d.chunk_count} source segments reviewed`:''}</p>${d.error?`<p role="alert">${esc(d.error)}</p>`:''}${d.state!=='removed'?`<button type="button" class="btn secondary" data-doc-remove="${esc(d.id)}" ${busy||state.previewReadOnly?'disabled':''}>Remove from evidence</button>${d.state==='failed'?`<button type="button" class="btn secondary" data-doc-retry="${esc(d.id)}" ${busy?'disabled':''}>Reprocess document</button>`:''}`:''}</article>`).join('')||'<p>No discovery documents have been uploaded in this engagement.</p>'}</div>
  ${live.some(d=>['uploaded','parsing'].includes(d.state))?`<button type="button" class="btn secondary" data-discovery-process ${busy?'disabled':''}>Process remaining documents</button>`:''}</section>
  <section class="relystra-build-card"><div class="eyebrow">Step 2 · Free Diagnosis</div><h2 data-discovery-status>${esc(status.label)}</h2><p>Relystra synthesizes every processed source, checks contradictions and preserves uncertainty. No payment is needed for this initial diagnosis.</p>${data?.reports[0]?.error?`<p role="alert">${esc(data.reports[0].error)}</p>`:''}${status.state==='outdated'?'<p role="status">The previous report is retained below. Review and regenerate it to include the current evidence set.</p>':''}<button type="button" class="btn primary" data-free-generate ${!ready||busy||status.state==='generating'||status.state==='complete'||state.previewReadOnly?'disabled':''}>${data?.reports.length?'Regenerate Free Diagnosis':'Generate Free Diagnosis'}</button>${status.state==='generating'?`<button type="button" class="btn secondary" data-discovery-resume ${busy?'disabled':''}>Resume / refresh diagnosis</button>`:''}<p data-discovery-message role="status">${esc(message)}</p>${error?`<p role="alert">${esc(error)}</p><button type="button" class="btn secondary" data-discovery-refresh>Refresh saved status</button>`:''}</section>
  <section class="relystra-build-card"><div class="eyebrow">Step 3 · Review Findings</div>${data?.reports.some(r=>r.status==='complete')?`<label>Diagnosis history<select data-free-version><option value="">Latest complete report</option>${data.reports.filter(r=>r.status==='complete').map(r=>`<option value="${esc(r.id)}" ${selectedVersion===r.id?'selected':''}>Version ${r.version} · evidence revision ${r.evidence_revision}</option>`).join('')}</select></label>`:''}${freeReportMarkup(complete)||'<p>Your structured findings will appear here after all documents are processed and Free Diagnosis completes.</p>'}${complete?`<form data-discovery-review><label>Corrections or additional context<textarea name="note" rows="4" placeholder="Explain any incorrect or missing information."></textarea></label><button class="btn primary" name="decision" value="verified" ${busy||complete.evidence_revision!==data.revision||state.previewReadOnly?'disabled':''}>Verify these findings</button><button class="btn secondary" name="decision" value="correction_requested" ${busy||complete.evidence_revision!==data.revision||state.previewReadOnly?'disabled':''}>Save correction as new evidence</button></form>${(data.reviews||[]).filter(r=>r.run_id===complete.id).map(r=>`<p>${r.decision==='verified'?'Findings verified':'Correction requested'} · ${esc(r.note)}</p>`).join('')}`:''}</section>
  <section class="relystra-build-card"><h2>Step 4 · Full Diagnosis / Action Planning</h2><p>After review, Relystra confirms the first Build and its commercial terms. Full Diagnosis and the deeper Roadmap remain included in the first paid engagement.</p>${state.admin?'<button type="button" class="btn secondary" data-discovery-commercial>Prepare first Build scope & Basic Report</button>':''}</section>`;
 }
 async function drive(){
  const co=company,pr=project,v=epoch;
  // One bounded server stage per request. Saved work resumes through the worker if this page closes.
  for(let step=0;step<600&&same(co,pr,v);step++){
   message='Processing saved evidence. You can leave and return; completed stages are retained.';render();
   const result=await sb.functions.invoke('nexus-diagnosis-execute',{body:{operation:'discovery_step',company_id:co,engagement_id:data.id}});
   if(!same(co,pr,v))return;
   if(result.error||result.data?.ok!==true){let detail=result.data?.error;try{detail=detail||(await result.error?.context?.json())?.error}catch{}throw new Error(detail||result.error?.message||'Discovery processing failed. Refresh status and retry.');}
   await command();const status=discoveryState(data);
   if(result.data.status==='idle_or_busy'||(!['processing','generating'].includes(status.state)&&!data.documents.some(d=>['uploaded','parsing'].includes(d.state))))break;
  }
  if(same(co,pr,v)){message='Saved status refreshed. Review the evidence and diagnosis below.';render();}
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
  if(b.hasAttribute('data-discovery-commercial'))return navigate('commercial-report');
  if(b.dataset.docRemove)return act(()=>command('remove',{p_document_id:b.dataset.docRemove}));
  if(b.dataset.docRetry)return act(async()=>{await command('reprocess',{p_document_id:b.dataset.docRetry});await drive()});
  if(b.hasAttribute('data-free-generate'))return act(async()=>{selectedVersion=null;await command('generate');await drive()});
  if(b.hasAttribute('data-discovery-process')||b.hasAttribute('data-discovery-resume'))return act(async()=>{await command('process');await drive()});
  if(b.hasAttribute('data-discovery-refresh'))return act(()=>command());
 });
 root.addEventListener('change',event=>{if(event.target.matches('[data-free-version]')){selectedVersion=event.target.value||null;render()}});
 return {async refresh(snapshot){const co=state.companyId,pr=snapshot?.project_id||null;if(company!==co||project!==pr){epoch++;company=co;project=pr;data=null;busy=false;error='';message='';selectedVersion=null;}if(!co){root.innerHTML='<p>Select a client company to open Discovery.</p>';return}if(busy)return;render();try{await command()}catch(e){error=e.message;render()}},destroy(){epoch++;root.replaceChildren()},get data(){return data}};
}
