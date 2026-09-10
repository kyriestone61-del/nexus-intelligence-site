import {PipelineError,classifyError} from './relystra-errors.ts';
export async function requestModel(proxy:string,token:string,model:string,messages:any[],temperature:number,timeoutMs:number,transport:typeof fetch=fetch,correlationId?:string){
 const requestId=correlationId||crypto.randomUUID(),started=Date.now();
 const signal=AbortSignal.timeout(timeoutMs);
 try{
  const response=await transport(proxy,{method:'POST',headers:{'Content-Type':'application/json','x-nexus-model-token':token,'x-request-id':requestId},body:JSON.stringify({model,messages,temperature,request_id:requestId}),signal});
  const raw=await response.text();let payload:any;
  try{payload=JSON.parse(raw)}catch{throw new PipelineError(response.ok?'MODEL_OUTPUT_MALFORMED':'AI_PROVIDER_UNAVAILABLE','proxy',true,502)}
  if(!response.ok){
   const detail=[payload.error?.message,payload.error?.code,payload.error,payload.detail].filter(x=>typeof x==='string').join(' ');
   if(response.status===504&&!/credit|billing/i.test(detail))throw new PipelineError('MODEL_TIMEOUT','provider',true,504);
   throw classifyError(new Error(detail),'gateway',response.status);
  }
  const content=payload?.choices?.[0]?.message?.content;
  if(!content)throw new PipelineError('MODEL_RESPONSE_EMPTY','model',true,502);
  console.info(JSON.stringify({event:'model_completed',request_id:requestId,model,gateway:'vercel-ai-gateway',http_status:response.status,duration_ms:Date.now()-started}));
  return typeof content==='string'?content:JSON.stringify(content);
 }catch(error){
  const failure=signal.aborted?new PipelineError('APPLICATION_TIMEOUT','edge_model_deadline',true,504):classifyError(error,'proxy');
  console.error(JSON.stringify({event:'model_failed',request_id:requestId,model,error_code:failure.code,boundary:failure.boundary,duration_ms:Date.now()-started,timeout_ms:timeoutMs}));
  throw failure;
 }
}
