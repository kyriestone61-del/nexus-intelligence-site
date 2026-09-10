import {PipelineError} from './relystra-errors.ts';
export const coveragePrompt=`Evaluate ALL framework requirements against the authorized evidence. Return ONLY {assessments:[[code,status,confidence,[source_aliases],reason,question]],sufficient_for_diagnosis:boolean,summary:string}. One tuple per framework code, exactly once. status: answered, partial, missing, not_applicable. confidence: number 0 to 1. Cite at most two source aliases from source_index, including for answered requirements. reason: at most 100 characters. question: at most 140 characters, only the unresolved part for a material partial/missing requirement; otherwise empty string. Never ask again for facts already supplied. Preserve conflicting evidence as partial. Do not repeat framework descriptions, domain, document metadata or evidence excerpts. Summary at most 400 characters. Keep the entire response below 9000 characters. No implementation recommendations or fabricated evidence.`;
export function coverageInput(framework:any[],bundle:any){
 const index:Record<string,string>={};
 for(const [i,doc] of bundle.docs.entries())index['E'+(i+1)]=doc.id;
 if(bundle.adminContext?.id)index.A1='ADMIN_CONTEXT:'+bundle.adminContext.id;
 for(const [i,ref] of (bundle.clientResponses||[]).entries())index['C'+(i+1)]=ref.ref;
 let evidence=bundle.text;
 for(const [alias,ref] of Object.entries(index).sort((a,b)=>b[1].length-a[1].length))evidence=evidence.replaceAll(ref,alias);
 return {payload:{framework,source_index:Object.keys(index),authorized_evidence:evidence},index};
}
export function expandCoverage(value:any,framework:any[],index:Record<string,string>){
 const invalid=()=>{throw new PipelineError('MODEL_SCHEMA_INVALID','coverage_validation',false,422)};
 if(!Array.isArray(value?.assessments)||value.assessments.length!==framework.length||typeof value.sufficient_for_diagnosis!=='boolean'||typeof value.summary!=='string'||value.summary.length>800)invalid();
 const seen=new Set<string>(),requirements:any[]=[],gaps:any[]=[];
 for(const row of value.assessments){
  if(!Array.isArray(row)||row.length!==6)invalid();
  const [code,status,confidence,refs,reason,question]=row,requirement=framework.find(r=>r.code===code);
  if(!requirement||seen.has(code)||!['answered','partial','missing','not_applicable'].includes(status)||typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1||!Array.isArray(refs)||refs.length>2||refs.some(ref=>typeof ref!=='string'||!Object.hasOwn(index,ref))||typeof reason!=='string'||!reason.trim()||reason.length>200||typeof question!=='string'||question.length>280||(status==='answered'&&!refs.length))invalid();
  seen.add(code);requirements.push({code,status,confidence,evidence_refs:refs.map((ref:string)=>index[ref]),reason});
  if(requirement.material&&['partial','missing'].includes(status)){
   if(!question.trim())invalid();
   gaps.push({code,domain:requirement.domain,question,reason,request_kind:requirement.desired_evidence?'both':'question',desired_evidence:requirement.desired_evidence||'',material:true,priority:'high',document_title:requirement.requirement,redaction_guidance:'Share only authorized, relevant evidence and redact unnecessary sensitive information.'});
  }
 }
 const applicable=requirements.filter(r=>r.status!=='not_applicable');
 const score=applicable.length?Math.round(100*applicable.reduce((n,r)=>n+(r.status==='answered'?1:r.status==='partial'?0.5:0),0)/applicable.length):100;
 return {requirements,gaps,sufficient_for_diagnosis:value.sufficient_for_diagnosis,coverage_score:score,summary:value.summary,pipeline_version:2};
}
