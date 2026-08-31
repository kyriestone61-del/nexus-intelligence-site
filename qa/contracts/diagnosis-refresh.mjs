export function createDiagnosisRefreshController({fetchLatest,applyLatest,onError=()=>{}}={}){
  if(typeof fetchLatest!=='function')throw new Error('fetchLatest required');
  if(typeof applyLatest!=='function')throw new Error('applyLatest required');
  let companyId=null;
  let generation=0;
  let inFlight=null;
  let latestApplied=null;

  function setCompany(nextCompanyId){
    if(nextCompanyId===companyId)return;
    companyId=nextCompanyId||null;
    generation+=1;
    inFlight=null;
    latestApplied=null;
  }

  async function refresh({runId=null,reason='manual'}={}){
    if(!companyId)return {applied:false,reason:'no_company'};
    const token={companyId,generation,runId};
    const key=`${companyId}:${generation}:${runId||'latest'}`;
    if(inFlight?.key===key)return inFlight.promise;

    const promise=(async()=>{
      try{
        const row=await fetchLatest({companyId:token.companyId,runId:token.runId,reason});
        if(token.companyId!==companyId||token.generation!==generation)return {applied:false,stale:true,row:null};
        await applyLatest(row,{companyId,reason});
        latestApplied=row||null;
        return {applied:true,stale:false,row:row||null};
      }catch(error){
        if(token.companyId!==companyId||token.generation!==generation)return {applied:false,stale:true,row:null};
        onError(error,{companyId,runId,reason});
        return {applied:false,stale:false,error,row:latestApplied};
      }finally{
        if(inFlight?.key===key)inFlight=null;
      }
    })();
    inFlight={key,promise};
    return promise;
  }

  function handleEvent(event={}){
    const detail=event.detail||event;
    if(detail.companyId&&detail.companyId!==companyId)return Promise.resolve({applied:false,reason:'other_company'});
    return refresh({runId:detail.runId||null,reason:detail.reason||'diagnosis_event'});
  }

  return {
    setCompany,
    refresh,
    handleEvent,
    currentCompany:()=>companyId,
    latest:()=>latestApplied
  };
}
