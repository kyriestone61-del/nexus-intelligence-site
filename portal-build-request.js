// Keep the caller's session and the request on the portal origin. No worker or
// service credentials belong in this client, and ambiguous writes are not retried.
async function requestBatch(sb,companyId,runId,catalogAfter){
  const {data,error}=await sb.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Please sign in again before generating recommendations.');
  let response;
  try{response=await fetch('/api/build-recommendations',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${data.session.access_token}`},
    body:JSON.stringify({company_id:companyId,run_id:runId,catalog_after:catalogAfter}),signal:AbortSignal.timeout(130000)})}
  catch{throw new Error('The connection was interrupted. Refresh Builds before trying again; the request may have completed.')}
  let result;try{result=await response.json()}catch{throw new Error(`The Build service returned an unreadable response (HTTP ${response.status}; ${response.headers.get('content-type')||'no content type'}). Refresh Builds before trying again.`)}
  if(!response.ok||result?.ok!==true){
    const messages={BUILD_SERVICE_TIMEOUT:'Recommendation generation timed out. Refresh Builds before trying again.',BUILD_SERVICE_UNAVAILABLE:'The Build service could not be reached. Refresh Builds before trying again.',BUILD_SERVICE_INVALID_RESPONSE:'The Build service returned an unreadable response. Refresh Builds before trying again.',AUTH_REQUIRED:'Please sign in again before generating recommendations.'};
    const message=messages[result?.error]||result?.error||'Recommendations could not be generated.';
    throw new Error(`${message}${result?.request_id?` Reference: ${result.request_id}`:''}`);
  }
  return result;
}

export async function requestBuildRecommendations(sb,companyId,runId,onProgress=()=>{}){
  let cursor='',ids=[]; const seen=new Set();
  do{
    if(seen.has(cursor))throw new Error('Recommendation cursor did not advance. Refresh before retrying.');
    seen.add(cursor);const batch=await requestBatch(sb,companyId,runId,cursor);
    ids.push(...batch.build_ids);cursor=batch.next_cursor;onProgress({reviewed_batches:seen.size,count:ids.length});
  }while(cursor);
  return {ok:true,build_ids:[...new Set(ids)],human_review_required:true};
}
