// Each invoke performs at most one bounded analysis stage. The existing worker
// can resume persisted work if the administrator closes this browser.
export async function executeDiagnosis(sb,runId,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now()}={}){
  const deadline=now()+11*60*1000;
  while(now()<deadline){
    const result=await sb.functions.invoke('nexus-diagnosis-execute',{body:{run_id:runId}});
    if(result.error||result.data?.ok===false)return result;
    if(result.data?.status!=='analyzing'&&result.data?.status!=='queued')return result;
    await wait(4000);
  }
  return {data:{ok:false,error:'Diagnosis is still processing. Open its status to check progress; your evidence is saved.'},error:null};
}
