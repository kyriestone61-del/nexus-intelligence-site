const portal=window.NexusPortal;
if(!portal)throw new Error('Relystra portal context is unavailable.');
const {sb,state}=portal;

let scheduled=false;
let companyToken='';
let cachedRun=null;
let cacheAt=0;

const hasResult=run=>{
  const result=run?.analysis_result;
  return !!result&&(typeof result==='string'?!!result.trim():Object.keys(result||{}).length>0);
};

async function latestRun(){
  const companyId=state.companyId;
  if(!state.admin||!companyId)return null;
  const now=Date.now();
  if(companyToken===companyId&&now-cacheAt<1500)return cachedRun;
  const {data,error}=await sb.from('nexus_diagnosis_runs')
    .select('id,status,analysis_result,created_at')
    .eq('company_id',companyId)
    .order('created_at',{ascending:false})
    .limit(1);
  if(error)throw error;
  companyToken=companyId;
  cachedRun=data?.[0]||null;
  cacheAt=now;
  return cachedRun;
}

function labelFor(run){
  if(!run)return 'Start Diagnosis →';
  if(run.status==='approved'&&hasResult(run))return 'View Diagnosis →';
  if(['queued','analyzing'].includes(run.status))return 'View Diagnosis Status →';
  if(run.status==='ready_for_analysis')return 'Run Diagnosis →';
  if(['failed','blocked','revision_requested'].includes(run.status))return 'Resolve Diagnosis Issue →';
  if(['ready_for_review','in_review'].includes(run.status)||hasResult(run))return 'Review Diagnosis →';
  return 'Open Diagnosis →';
}

function setLabel(button,label){
  if(button&&button.textContent!==label)button.textContent=label;
}

function applyLabels(run){
  const root=document.getElementById('adminJourneyRoot');
  if(!root)return;
  const label=labelFor(run);
  const diagnosisStep=[...root.querySelectorAll('.journey-step')].find(step=>step.querySelector('h3')?.textContent?.trim()==='Diagnose');
  if(diagnosisStep){
    diagnosisStep.querySelectorAll('button').forEach(button=>{
      const current=button.textContent?.trim().toLowerCase()||'';
      if(current.includes('diagnosis')&&!current.includes('step records'))setLabel(button,label);
    });
  }
  const focus=root.querySelector('.journey-focus');
  const kicker=focus?.querySelector('.kicker')?.textContent||'';
  if(/Step\s*3\s*of\s*7/i.test(kicker)){
    const primary=focus.querySelector('button[data-primary-action]');
    setLabel(primary,label);
  }
}

async function refresh({force=false}={}){
  if(force){cacheAt=0;cachedRun=null}
  try{applyLabels(await latestRun())}catch(error){console.error('Diagnosis state label refresh failed',error)}
}

function schedule(force=false){
  if(force){cacheAt=0;cachedRun=null}
  if(scheduled)return;
  scheduled=true;
  setTimeout(()=>{scheduled=false;refresh()},100);
}

const observer=new MutationObserver(()=>schedule(false));
observer.observe(document.body,{childList:true,subtree:true});
document.getElementById('companySelect')?.addEventListener('change',()=>schedule(true));
window.addEventListener('nexus:diagnosis-changed',()=>schedule(true));
setTimeout(()=>schedule(true),300);

window.NexusDiagnosisStateLabels={refresh};
