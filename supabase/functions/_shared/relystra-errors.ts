// Safe error contract shared by model, worker and API. Never serialize upstream bodies.
export class PipelineError extends Error {
 code:string; boundary:string; retryable:boolean; status:number;
 constructor(code:string,boundary='application',retryable=false,status=503){super(code);this.name='PipelineError';this.code=code;this.boundary=boundary;this.retryable=retryable;this.status=status;}
}
export function classifyError(error:any,boundary='application',status=0):PipelineError {
 if(error instanceof PipelineError)return error;
 const msg=String(error?.message||error||'');
 if(boundary==='parsing')return new PipelineError('DOCUMENT_PARSE_ERROR','parsing',false,422);
 if(/positive credit balance|insufficient.*credit|AI_PROVIDER_BILLING_REQUIRED|AI_GATEWAY_BALANCE_REQUIRED/i.test(msg)||status===402)return new PipelineError('AI_GATEWAY_BALANCE_REQUIRED','gateway',false);
 if(/DIAGNOSIS_PAYMENT_REQUIRED/.test(msg))return new PipelineError('DIAGNOSIS_PAYMENT_REQUIRED','entitlement',false,403);
 if(/AUTH_REQUIRED|ADMIN_REQUIRED|Company access|Engagement.company mismatch|Document.*mismatch|WORKER_AUTH_FAILED/i.test(msg))return new PipelineError('AUTHORIZATION_ERROR','authorization',false,403);
 if(/MODEL_PROXY_ACCESS|MODEL_PROXY_AUTH_NOT_CONFIGURED|not configured/i.test(msg)||status===401||status===403)return new PipelineError('AI_GATEWAY_AUTH_ERROR','configuration',false);
 if(/Timeout|timed out|AbortError|aborted|MODEL_TIMEOUT/.test(msg+' '+error?.name))return new PipelineError(boundary==='provider'?'MODEL_TIMEOUT':'APPLICATION_TIMEOUT',boundary,true,504);
 if(/EMPTY_RESULT|RESPONSE_EMPTY/.test(msg))return new PipelineError('MODEL_RESPONSE_EMPTY','model',true,502);
 if(error instanceof SyntaxError)return new PipelineError('MODEL_OUTPUT_MALFORMED','model',true,502);
 if(/INVALID_|UNSUPPORTED_.*QUOTE|OUTPUT_LIMIT|DIAGNOSIS_QA_FAILED/.test(msg))return new PipelineError('MODEL_SCHEMA_INVALID','validation',false,422);
 if(error?.code&&/^[0-9A-Z]{5}$/.test(error.code))return new PipelineError('DATABASE_ERROR','database',true,503);
 if(/fetch|network|connection/i.test(msg))return new PipelineError('NETWORK_ERROR',boundary,true);
 if(boundary==='gateway'||status>=500)return new PipelineError('AI_PROVIDER_UNAVAILABLE','gateway',true);
 return new PipelineError(boundary==='database'?'DATABASE_ERROR':'EDGE_FUNCTION_ERROR',boundary,true);
}
export const clientErrorMessage=(error:PipelineError)=>error.code==='DOCUMENT_PARSE_ERROR'?'This document could not be parsed. Upload a valid supported file; scanned PDFs need searchable text.':error.code==='AUTHORIZATION_ERROR'?'You do not have access to this engagement.':error.code==='MODEL_SCHEMA_INVALID'?'The analysis could not pass its quality checks. Your evidence is safe. Please retry or review the supplied information.':'AI analysis is temporarily unavailable. Your uploaded evidence is safe. Please try again shortly.';
