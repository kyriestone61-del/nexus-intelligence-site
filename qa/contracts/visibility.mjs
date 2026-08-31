const CLIENT_MEMORY_FIELDS=Object.freeze(['goals','systems','terminology']);
const INTERNAL_MEMORY_FIELDS=Object.freeze(['goals','systems','terminology','operating_context','decision_notes','updated_at','updated_by']);

export function projectCompanyMemory(memory,role='client'){
  if(!memory||typeof memory!=='object')return null;
  const fields=role==='admin'?INTERNAL_MEMORY_FIELDS:CLIENT_MEMORY_FIELDS;
  return Object.fromEntries(fields.filter(k=>Object.prototype.hasOwnProperty.call(memory,k)).map(k=>[k,memory[k]]));
}

export function assertClientMemorySafe(memory){
  const projected=projectCompanyMemory(memory,'client')||{};
  const forbidden=['operating_context','decision_notes','updated_by'];
  return {
    safe:forbidden.every(k=>!Object.prototype.hasOwnProperty.call(projected,k)),
    projected,
    forbidden
  };
}

export function projectDecision(decision,role='client'){
  if(!decision||typeof decision!=='object')return null;
  if(role==='admin')return {...decision};
  if(!decision.client_visible)return null;
  const {id,title,decision,confidence,status,decided_at,evidence_refs}=decision;
  return {id,title,decision,confidence,status,decided_at,evidence_refs};
}

export function projectEvidence(evidence,role='client'){
  if(!evidence||typeof evidence!=='object')return null;
  if(role==='admin')return {...evidence};
  if(!evidence.client_visible)return null;
  const {id,title,evidence_type,source_ref,observation_start,observation_end,supports_claim,confidence,limitations}=evidence;
  return {id,title,evidence_type,source_ref,observation_start,observation_end,supports_claim,confidence,limitations};
}
