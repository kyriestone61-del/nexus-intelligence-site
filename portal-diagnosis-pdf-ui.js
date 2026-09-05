const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');

const {sb,state,toast}=portal;
let activeAdminRunId=null;
let adminMountQueued=false;
let clientMountQueued=false;
let clientQueryPromise=null;
let clientReleaseCache={companyId:null,rows:[]};

function safeFilename(value,fallback='Relystra-Diagnosis-Report.pdf'){
  const name=String(value||'').trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-');
  return name||fallback;
}

function responseFilename(response,fallback){
  const disposition=response.headers.get('content-disposition')||'';
  const utf8=disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if(utf8?.[1]){
    try{return safeFilename(decodeURIComponent(utf8[1]),fallback)}catch{}
  }
  const quoted=disposition.match(/filename="([^"]+)"/i);
  if(quoted?.[1])return safeFilename(quoted[1],fallback);
  const plain=disposition.match(/filename=([^;]+)/i);
  return safeFilename(plain?.[1]?.trim(),fallback);
}

async function errorMessage(response){
  const body=await response.clone().json().catch(()=>null);
  if(body?.error)return String(body.error);
  const text=await response.text().catch(()=>null);
  return text||`PDF request failed (${response.status}).`;
}

async function downloadDiagnosisPdf(payload,{button=null,fallback='Relystra-Diagnosis-Report.pdf'}={}){
  const sessionResult=await sb.auth.getSession();
  const token=sessionResult?.data?.session?.access_token;
  if(!token)throw new Error('Sign in again before downloading this report.');

  const original=button?.textContent||'';
  if(button){button.disabled=true;button.textContent='Preparing PDF…'}
  try{
    const response=await fetch('/api/diagnosis-report-pdf',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body:JSON.stringify(payload),
      cache:'no-store'
    });
    if(!response.ok)throw new Error(await errorMessage(response));
    const type=response.headers.get('content-type')||'';
    if(!type.toLowerCase().includes('application/pdf'))throw new Error('The report service returned an unexpected file type.');
    const blob=await response.blob();
    const filename=responseFilename(response,fallback);
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=filename;
    link.rel='noopener';
    link.style.display='none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast?.('PDF ready.');
  }finally{
    if(button?.isConnected){button.disabled=false;button.textContent=original}
  }
}

function reportExists(body){return !!body?.querySelector('.diagnosis-executive,.diagnosis-review-item,.diagnosis-pilot')}
function adminRunId(body){
  const tagged=body?.querySelector('[data-diagnosis-action][data-id],.diagnosis-retry-btn[data-id],[data-manual-result]');
  return tagged?.dataset?.id||tagged?.dataset?.diagnosisAction||tagged?.dataset?.manualResult||activeAdminRunId||null;
}

function mountAdminDownload(){
  if(!state.admin)return;
  const modal=document.getElementById('diagnosisReviewModal');
  const body=document.getElementById('diagnosisReviewBody');
  if(!modal?.classList.contains('open')||!body||!reportExists(body))return;
  const runId=adminRunId(body);
  if(!runId)return;
  activeAdminRunId=runId;
  const existing=body.querySelector('[data-diagnosis-pdf-run]');
  if(existing){existing.dataset.diagnosisPdfRun=runId;return}
  const actions=document.createElement('div');
  actions.className='actions nexus-diagnosis-pdf-actions';
  actions.innerHTML='<button class="btn secondary" type="button" data-diagnosis-pdf-run>Download full PDF</button>';
  const meta=body.querySelector('.diagnosis-review-meta');
  if(meta)meta.after(actions);else body.prepend(actions);
  const button=actions.querySelector('[data-diagnosis-pdf-run]');
  button.dataset.diagnosisPdfRun=runId;
  button.addEventListener('click',async()=>{
    const id=button.dataset.diagnosisPdfRun;
    if(!id)return;
    try{await downloadDiagnosisPdf({run_id:id},{button,fallback:'Relystra-Diagnosis-Report.pdf'})}
    catch(error){console.error('Diagnosis PDF download failed',error);toast?.(error.message||'Diagnosis PDF could not be downloaded.')}
  });
}

function scheduleAdminMount(){
  if(adminMountQueued)return;
  adminMountQueued=true;
  requestAnimationFrame(()=>{adminMountQueued=false;mountAdminDownload()});
}

document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('.diagnosis-review-btn[data-id],.diagnosis-retry-btn[data-id],[data-diagnosis-action][data-id]');
  if(trigger?.dataset?.id)activeAdminRunId=trigger.dataset.id;
},true);

async function releasedRows(){
  const companyId=state.companyId;
  if(!companyId)return [];
  if(clientReleaseCache.companyId===companyId&&clientReleaseCache.rows.length)return clientReleaseCache.rows;
  if(clientQueryPromise)return clientQueryPromise;
  clientQueryPromise=(async()=>{
    const {data,error}=await sb.from('nexus_diagnosis_report_releases')
      .select('id,released_at')
      .eq('company_id',companyId)
      .eq('status','released')
      .is('revoked_at',null)
      .order('released_at',{ascending:false});
    if(error)throw error;
    const rows=data||[];
    clientReleaseCache={companyId,rows};
    return rows;
  })();
  try{return await clientQueryPromise}finally{clientQueryPromise=null}
}

async function mountClientDownloads(){
  const root=document.getElementById('nexus-client-reports');
  const cards=[...root?.querySelectorAll('.nexus-client-report')||[]];
  if(!cards.length||cards.every(card=>card.querySelector('[data-diagnosis-pdf-release]')))return;
  let rows;
  try{rows=await releasedRows()}catch(error){console.error('Released diagnosis reports could not be loaded for PDF controls.',error);return}
  if(rows.length!==cards.length){
    console.warn('Relystra skipped diagnosis PDF controls because released report ordering could not be reconciled safely.',{cards:cards.length,releases:rows.length});
    return;
  }
  cards.forEach((card,index)=>{
    const releaseId=rows[index]?.id;
    if(!releaseId||card.querySelector('[data-diagnosis-pdf-release]'))return;
    const button=document.createElement('button');
    button.className='btn secondary';
    button.type='button';
    button.textContent='Download PDF';
    button.dataset.diagnosisPdfRelease=releaseId;
    button.addEventListener('click',async()=>{
      try{await downloadDiagnosisPdf({release_id:releaseId},{button,fallback:'Relystra-Client-Report.pdf'})}
      catch(error){console.error('Client diagnosis PDF download failed',error);toast?.(error.message||'Client report PDF could not be downloaded.')}
    });
    const head=card.querySelector('.nexus-client-report-head')||card;
    head.appendChild(button);
  });
}

function scheduleClientMount(){
  if(clientMountQueued)return;
  clientMountQueued=true;
  requestAnimationFrame(async()=>{clientMountQueued=false;await mountClientDownloads()});
}

const observer=new MutationObserver(()=>{scheduleAdminMount();scheduleClientMount()});
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('nexus:client-context-ready',event=>{
  const companyId=event.detail?.companyId||state.companyId;
  if(companyId!==clientReleaseCache.companyId)clientReleaseCache={companyId:null,rows:[]};
  scheduleClientMount();
});
window.addEventListener('nexus:diagnosis-changed',()=>{clientReleaseCache={companyId:null,rows:[]};scheduleAdminMount();scheduleClientMount()});

scheduleAdminMount();
scheduleClientMount();

window.NexusDiagnosisPdf=Object.freeze({download:downloadDiagnosisPdf,refresh:()=>{scheduleAdminMount();scheduleClientMount()}});
