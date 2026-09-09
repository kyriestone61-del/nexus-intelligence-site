// Intermediate stages are private, unapproved evidence analysis. Their union
// preserves the full report schema; no stage substitutes for final validation.
export const diagnosisStages=[
 {name:'Evidence Analyst',keys:['current_state','claims','facts','client_statements','admin_context','inferences','estimates','unknowns','evidence'],instruction:'Build the provenance ledger. Separate facts from reported statements and inferences. Use UNKNOWN for missing information. Preserve conflicts and exact evidence references.'},
 {name:'Process & Opportunity Analyst',keys:['process_map','bottlenecks','root_causes','baseline_gaps','baseline_measurements','opportunity_backlog','risks'],instruction:'Reconstruct supported workflows and identify all material bottlenecks and qualified opportunities. Prior stages are unapproved analysis, not new evidence. Verify each finding against the original evidence. Never invent baselines or ROI. Explicitly label inferred workflow elements as INFERENCE and unknown owners, handoffs or rules as UNKNOWN. Scores are qualitative analyst judgments on a 1–5 scale (low to high), not measurements or financial forecasts; state their evidence basis in the recommendation.'},
 {name:'Independent QA / Governance Verifier and Final Diagnosis Composer',keys:['follow_up_questions','smallest_safe_pilot','recommended_first_intervention','nexus_actions','client_action_items','document_requests','decision_items','quality_assurance','executive_summary'],instruction:'Review all prior stages against original evidence. Correct unsupported claims, inconsistent references and material omissions using optional corrections:[{path,value}] replacements of existing prior-analysis fields. Paths use slash-separated existing keys and array indexes, such as process_map/0/steps or current_state/key_actors. Prefer concise targeted corrections; do not repeat the complete report. Label uncertainty or remove unsupported details by replacing their array with only supported items. quality_assurance.issues lists ONLY unresolved report-quality defects after corrections; set pass:false if any remain. Missing inputs, unknown baselines, unresolved implementation details and lack of measured ROI are readiness gaps, not report-quality defects when accurately disclosed. Do not invent answers to close those gaps. Qualitative prioritization scores are analyst judgments, not factual measurements. Summarize only supported findings. Recommend only needed pre-build inputs, reviews and preparation, never implementation tasks. Keep corrected claims consistent with their typed copies in facts, client_statements, admin_context, inferences and estimates. Human approval is required.'}
] as const;
const objectFields=new Set(['current_state','smallest_safe_pilot','recommended_first_intervention','quality_assurance']);
export function validateDiagnosisStage(stage:number,result:unknown):Record<string,unknown> {
 const spec=diagnosisStages[stage];
 if(!spec||!result||typeof result!=='object'||Array.isArray(result))throw new Error('INVALID_DIAGNOSIS_STAGE');
 const input=result as Record<string,unknown>,output:Record<string,unknown>={};
 for(const key of spec.keys){
   const value=input[key];
   const valid=key==='executive_summary'?typeof value==='string':objectFields.has(key)?!!value&&typeof value==='object'&&!Array.isArray(value):Array.isArray(value);
   if(!valid)throw new Error(`INVALID_RESULT_${key}`);
   output[key]=value;
 }
 // Stage output cannot overwrite earlier fields; only validated QA corrections may do so.
 return output;
}
export function diagnosisStageSchema(schema:string,stage:number) {
 const keys=diagnosisStages[stage]?.keys;if(!keys)throw new Error('INVALID_DIAGNOSIS_STAGE');
 return `The complete report schema follows for field definitions only. ${schema}\nFor THIS stage, return ONLY these top-level keys: ${keys.join(', ')}${stage===2?', corrections (optional array of targeted replacements)':''}. Do not output fields belonging to other stages.`;
}

// QA may correct existing analysis fields, never identifiers, execution metadata,
// prototype properties, new target paths, or the top-level report structure.
export function applyDiagnosisCorrections(prior:Record<string,unknown>,corrections:unknown):Record<string,unknown> {
 const output=JSON.parse(JSON.stringify(prior));
 if(corrections===undefined)return output;
 if(!Array.isArray(corrections)||corrections.length>100)throw new Error('INVALID_DIAGNOSIS_CORRECTIONS');
 const allowed=new Set<string>([...diagnosisStages[0].keys,...diagnosisStages[1].keys]);
 const kind=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v;
 for(const correction of corrections){
   if(!correction||typeof correction.path!=='string'||!Object.hasOwn(correction,'value'))throw new Error('INVALID_DIAGNOSIS_CORRECTION');
   if(correction.path.length>300)throw new Error('INVALID_DIAGNOSIS_CORRECTION_PATH');
   const parts=correction.path.replace(/^\//,'').split('/');
   if(!allowed.has(parts[0])||parts.some((part:string)=>!part||['__proto__','prototype','constructor'].includes(part))||JSON.stringify(correction.value).length>60000)throw new Error('INVALID_DIAGNOSIS_CORRECTION_PATH');
   let parent=output;
   for(const part of parts.slice(0,-1)){
     if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,part)||(Array.isArray(parent)&&! /^(0|[1-9][0-9]*)$/.test(part)))throw new Error('INVALID_DIAGNOSIS_CORRECTION_PATH');
     parent=parent[part];
   }
   const key=parts.at(-1)!;
   if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key)||(Array.isArray(parent)&&! /^(0|[1-9][0-9]*)$/.test(key))||kind(parent[key])!==kind(correction.value))throw new Error('INVALID_DIAGNOSIS_CORRECTION_TYPE');
   parent[key]=correction.value;
 }
 validateDiagnosisStage(0,output);validateDiagnosisStage(1,output);
 return output;
}
