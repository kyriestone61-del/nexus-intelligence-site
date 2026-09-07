// Keep the caller's session and the request on the portal origin. No worker or
// service credentials belong in this client, and ambiguous writes are not retried.
export async function requestBuildRecommendations(sb,companyId,runId){
  const {data,error}=await sb.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Please sign in again before generating recommendations.');
  let response;
  try{response=await fetch('/api/build-recommendations',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${data.session.access_token}`},
    body:JSON.stringify({company_id:companyId,run_id:runId}),signal:AbortSignal.timeout(130000)})}
  catch{throw new Error('The connection was interrupted. Refresh Builds before trying again; the request may have completed.')}
  let result;try{result=await response.json()}catch{throw new Error('The Build service returned an unreadable response. Refresh Builds before trying again.')}
  if(!response.ok||result?.ok!==true){
    const messages={BUILD_SERVICE_TIMEOUT:'Recommendation generation timed out. Refresh Builds before trying again.',BUILD_SERVICE_UNAVAILABLE:'The Build service could not be reached. Refresh Builds before trying again.',BUILD_SERVICE_INVALID_RESPONSE:'The Build service returned an unreadable response. Refresh Builds before trying again.',AUTH_REQUIRED:'Please sign in again before generating recommendations.'};
    const message=messages[result?.error]||result?.error||'Recommendations could not be generated.';
    throw new Error(`${message}${result?.request_id?` Reference: ${result.request_id}`:''}`);
  }
  return result;
}
