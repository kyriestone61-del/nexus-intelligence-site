// Same-origin transport only. The Edge Function still validates the caller and
// administrator role, then saves through its existing evidence/version guards.
const endpoint='https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/nexus-diagnosis-execute';
const publishable='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});

export async function onRequest({request}){
  if(request.method!=='POST')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization))return reply({ok:false,error:'AUTH_REQUIRED'},401);
  let body;try{body=await request.json()}catch{return reply({ok:false,error:'INVALID_REQUEST'},400)}
  if(!uuid(body?.company_id)||!uuid(body?.run_id))return reply({ok:false,error:'APPROVED_DIAGNOSIS_REQUIRED'},400);
  const requestId=crypto.randomUUID();
  try{
    // Do not retry an ambiguous POST: generation may already have committed.
    const upstream=await fetch(endpoint,{method:'POST',redirect:'error',
      headers:{authorization,apikey:publishable,'content-type':'application/json'},
      body:JSON.stringify({operation:'recommend_builds',company_id:body.company_id,run_id:body.run_id}),
      signal:AbortSignal.timeout(120000)});
    let data;try{data=await upstream.json()}catch{
      console.error('build_recommendations_invalid_response',{requestId,status:upstream.status});
      return reply({ok:false,error:'BUILD_SERVICE_INVALID_RESPONSE',request_id:requestId},502);
    }
    if(!upstream.ok||data?.ok!==true){
      console.error('build_recommendations_upstream_error',{requestId,status:upstream.status});
      return reply({ok:false,error:typeof data?.error==='string'?data.error.slice(0,500):'BUILD_SERVICE_FAILED',request_id:requestId},upstream.ok?502:upstream.status);
    }
    return reply({ok:true,build_ids:Array.isArray(data.build_ids)?data.build_ids:[],status:data.status,human_review_required:true,request_id:requestId});
  }catch(error){
    const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
    console.error('build_recommendations_transport_error',{requestId,kind:timeout?'timeout':'connection'});
    return reply({ok:false,error:timeout?'BUILD_SERVICE_TIMEOUT':'BUILD_SERVICE_UNAVAILABLE',request_id:requestId},timeout?504:502);
  }
}
