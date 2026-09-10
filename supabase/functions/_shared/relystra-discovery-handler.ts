import {classifyError,clientErrorMessage} from './relystra-errors.ts';
import {chunkDiscoveryText,validateExtraction,validateSynthesis,validateFreeDiagnosis,applyFreeDiagnosisReview,extractionPrompt,synthesisPrompt,freeDiagnosisPrompt} from './relystra-discovery-evidence.ts';
type Dependencies={db:any;config:()=>Promise<any>;parse:(doc:any,cfg:any)=>Promise<any>;call:(cfg:any,label:string,instruction:string,payload:any,temperature?:number,timeout?:number)=>Promise<any>;hash:(text:string)=>Promise<string>};
async function rows(query:any){const r=await query;if(r.error)throw classifyError(r.error,'database');return r.data;}
export async function discoveryWork(deps:Dependencies,engagementId:string|null=null){
 const {db}=deps;const lease=await rows(db.rpc('relystra_claim_discovery_work',{p_engagement_id:engagementId}));
 if(!lease)return {ok:true,status:'idle_or_busy'};
 let documentId:string|null=null,runId:string|null=null,stage='claim';const started=Date.now(),requestId=crypto.randomUUID();
 const metadata=()=>({request_id:requestId,company_id:lease.company_id,engagement_id:lease.id,run_id:runId,evidence_revision:lease.revision,stage,model:'openai/gpt-5.6-sol',provider:'vercel-ai-gateway',duration_ms:Date.now()-started});
 const commit=async(action:string,payload:any)=>{const ok=await rows(db.rpc('relystra_commit_discovery_work',{p_engagement_id:lease.id,p_lease_id:lease.lease_id,p_revision:lease.revision,p_action:action,p_payload:payload}));console.info(JSON.stringify({event:'discovery_stage_committed',...metadata(),action,accepted:ok}));return {ok:true,status:ok?'processing':'evidence_changed',action};};
 try{
  const documents=await rows(db.from('relystra_discovery_documents').select('*').eq('engagement_id',lease.id).in('state',['uploaded','parsing']).order('updated_at').limit(1));
  const document=documents?.[0];
  if(document){
   stage=document.state==='uploaded'?'parse':'extract';documentId=document.document_id;
   if(document.state==='uploaded'){
    const doc=await rows(db.from('nexus_documents').select('*').eq('id',documentId).eq('company_id',lease.company_id).single());
    if(doc.project_id!==lease.project_id)throw new Error('DOCUMENT_ENGAGEMENT_MISMATCH');
    const parsed=await deps.parse(doc,await deps.config());
    if(!parsed.parsed)throw new Error('UNSUPPORTED_DOCUMENT: Upload PDF, DOCX, TXT, Markdown, SRT or VTT.');
    const chunks=chunkDiscoveryText(parsed.text,documentId!);
    return await commit('parse',{document_id:documentId,chunks,parser:parsed.parser,text_chars:parsed.text.length,hash:await deps.hash(parsed.text)});
   }
   const chunk=await rows(db.from('relystra_discovery_chunks').select('id,source_text').eq('document_id',documentId).is('extraction',null).order('ordinal').limit(1).maybeSingle());
   if(!chunk)throw new Error('MISSING_SOURCE_CHUNK: Reprocess this document.');
   const cfg={...await deps.config(),request_id:requestId};
   const result=validateExtraction(await deps.call(cfg,'Document evidence extractor',extractionPrompt,{source_id:chunk.id,text:chunk.source_text},0.05,80000),{id:chunk.id,text:chunk.source_text});
   return await commit('extract',{document_id:documentId,chunk_id:chunk.id,extraction:result});
  }
  const run=await rows(db.from('relystra_free_diagnoses').select('*').eq('engagement_id',lease.id).eq('status','generating').order('version',{ascending:false}).limit(1).maybeSingle());
  if(!run)return await commit('idle',{});
  runId=run.id;
  if(run.evidence_revision!==lease.revision)throw new Error('EVIDENCE_CHANGED: Generate an updated diagnosis.');
  const job=await rows(db.from('relystra_discovery_synthesis').select('*').eq('run_id',run.id).single());
  stage=job.stage;console.info(JSON.stringify({event:'discovery_stage_started',...metadata()}));
  const cfg={...await deps.config(),request_id:requestId};
  if(job.stage==='reduce'){
   if(job.nodes.length<=4)return await commit('synthesis',{...job,run_id:run.id,stage:'report'});
   const batch=job.nodes.slice(job.cursor,job.cursor+4);
   const sourceIds=[...new Set(batch.flatMap((x:any)=>x.source_ids))] as string[];
   const result=validateSynthesis(await deps.call(cfg,'Cross-document evidence synthesis',synthesisPrompt,{nodes:batch},0.05,80000),new Set(sourceIds));
   const next=[...job.next_nodes,{source_ids:sourceIds,evidence:result}];
   if(job.cursor+4>=job.nodes.length)return await commit('synthesis',{run_id:run.id,nodes:next,next_nodes:[],cursor:0,level:job.level+1,stage:next.length<=4?'report':'reduce'});
   return await commit('synthesis',{...job,run_id:run.id,next_nodes:next,cursor:job.cursor+4});
  }
  if(job.stage==='report'){
   const report=validateFreeDiagnosis(await deps.call(cfg,'Free Diagnosis consultant',freeDiagnosisPrompt,{nodes:job.nodes,documents:run.document_ids},0.05,90000),run.source_ids);
   return await commit('synthesis',{...job,run_id:run.id,stage:'qa',draft:report});
  }
  const review=await deps.call(cfg,'Independent source fidelity and contradiction reviewer',`Review the complete draft against all supplied evidence. Return ONLY {corrections:[{section,items}],qa:{pass:boolean,issues:[string]}}. Corrections replace ONLY changed report sections; use [] when the draft is sound. Allowed sections: business_context,current_processes,observed_problems,key_findings,opportunity_areas,missing_information,evidence_confidence,contradictions. Items preserve the existing {text,confidence,source_refs} schema (contradictions use {text,source_refs}). Do not rewrite or return the complete report. Correct unsupported claims, overlooked conflicts and overconfidence. Missing business information is an honest gap, not a report defect when disclosed. An inference is acceptable when labeled. Set pass true only when no report-quality defects remain after applying your corrections; issues lists ONLY unresolved defects. Never invent new evidence. Keep corrections concise, preferably under 6000 characters.`,{draft:job.draft,evidence:job.nodes,previous_unresolved_issues:job.draft?._qa_previous_issues||[]},0.05,90000);
  const report=applyFreeDiagnosisReview(job.draft,review,run.source_ids);
  if(review.qa?.pass!==true||!Array.isArray(review.qa?.issues)||review.qa.issues.length){
   const issues=Array.isArray(review.qa?.issues)?review.qa.issues.filter((x:any)=>typeof x==='string'):['The quality reviewer did not return the required decision.'];
   if(Number(job.draft?._qa_attempts||0)<1)return await commit('synthesis',{...job,run_id:run.id,stage:'qa',draft:{...report,_qa_attempts:1,_qa_previous_issues:issues}});
   throw new Error('DIAGNOSIS_QA_FAILED: '+(issues.join('; ')||'The quality reviewer could not confirm source fidelity. Review the evidence and retry.'));
  }
  return await commit('complete',{run_id:run.id,metadata:metadata(),report:{...report,analysis_context:job.nodes,qa:{pass:true,issues:[]},coverage:{documents:run.document_ids.length,chunks:run.source_ids.length,complete:true},pipeline_version:2}});
 }catch(error){
  const failure=classifyError(error,stage==='parse'?'parsing':'application');
  console.error(JSON.stringify({event:'discovery_stage_failed',...metadata(),error_code:failure.code,boundary:failure.boundary,retryable:failure.retryable}));
  const saved=await commit('fail',{document_id:documentId,run_id:runId,error:failure.code,error_code:failure.code,retryable:failure.retryable,metadata:metadata()});
  return {ok:false,status:saved.status==='evidence_changed'?'evidence_changed':'failed',error:clientErrorMessage(failure),error_code:failure.code,retryable:failure.retryable,request_id:requestId};
 }
}
export async function authorizeDiscovery(db:any,userId:string,companyId:string,engagementId:string){
 const admin=await rows(db.from('nexus_platform_admins').select('user_id').eq('user_id',userId).maybeSingle());
 if(!admin){const member=await rows(db.from('nexus_company_members').select('user_id').eq('user_id',userId).eq('company_id',companyId).eq('active',true).maybeSingle());if(!member)throw new Error('Company access required');}
 const engagement=await rows(db.from('relystra_discovery_engagements').select('company_id').eq('id',engagementId).eq('company_id',companyId).maybeSingle());
 if(!engagement)throw new Error('Engagement/company mismatch');
}
