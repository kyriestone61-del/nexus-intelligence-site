// Intermediate stages are private, unapproved evidence analysis. Their union
// preserves the full report schema; no stage substitutes for final validation.
export const diagnosisStages=[
 {name:'Evidence Analyst',keys:['current_state','claims','facts','client_statements','admin_context','inferences','estimates','unknowns','evidence'],instruction:'Build the provenance ledger. Separate facts from reported statements and inferences. Use UNKNOWN for missing information. Preserve conflicts and exact evidence references.'},
 {name:'Process & Opportunity Analyst',keys:['process_map','bottlenecks','root_causes','baseline_gaps','baseline_measurements','opportunity_backlog','risks'],instruction:'Reconstruct supported workflows and identify all material bottlenecks and qualified opportunities. Prior stages are unapproved analysis, not new evidence. Verify each finding against the original evidence. Never invent baselines or ROI.'},
 {name:'Independent QA / Governance Verifier and Final Diagnosis Composer',keys:['follow_up_questions','smallest_safe_pilot','recommended_first_intervention','nexus_actions','client_action_items','document_requests','decision_items','quality_assurance','executive_summary'],instruction:'Review all prior stages against original evidence. Record unsupported claims, inconsistent references or material omissions in quality_assurance.issues and set pass:false if any remain. Summarize only supported findings. Recommend only needed pre-build inputs, reviews and preparation, never implementation tasks. Human approval is required.'}
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
 // A later stage cannot overwrite a validated earlier stage or add execution metadata.
 return output;
}
export function diagnosisStageSchema(schema:string,stage:number) {
 const keys=diagnosisStages[stage]?.keys;if(!keys)throw new Error('INVALID_DIAGNOSIS_STAGE');
 return `The complete report schema follows for field definitions only. ${schema}\nFor THIS stage, return ONLY these top-level keys: ${keys.join(', ')}. Do not output fields belonging to other stages.`;
}
