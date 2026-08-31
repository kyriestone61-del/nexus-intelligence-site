export const TASK_STATUS = Object.freeze({
  NOT_STARTED:'not_started',
  WAITING_ON_CLIENT:'waiting_on_client',
  WAITING_ON_NEXUS:'waiting_on_nexus',
  IN_PROGRESS:'in_progress',
  READY_FOR_REVIEW:'ready_for_review',
  BLOCKED:'blocked',
  COMPLETED:'completed',
  NOT_APPLICABLE:'not_applicable'
});

export const DIAGNOSIS_STATUS = Object.freeze({
  READY_FOR_ANALYSIS:'ready_for_analysis',
  QUEUED:'queued',
  ANALYZING:'analyzing',
  READY_FOR_REVIEW:'ready_for_review',
  REVISION_REQUESTED:'revision_requested',
  BLOCKED:'blocked',
  FAILED:'failed',
  APPROVED:'approved',
  ARCHIVED:'archived'
});

export const GATE_STATE = Object.freeze({
  NOT_STARTED:'not_started',
  IN_PROGRESS:'in_progress',
  WAITING_ON_CLIENT:'waiting_on_client',
  WAITING_ON_NEXUS:'waiting_on_nexus',
  WAITING_ON_DECISION:'waiting_on_decision',
  BLOCKED:'blocked',
  COMPLETE:'complete'
});

export const JOURNEY_STAGES = Object.freeze([
  {key:'inquiry',title:'Inquiry'},
  {key:'preliminary_research',title:'Preliminary Research'},
  {key:'fit_call',title:'Fit Call'},
  {key:'fit_decision',title:'Fit Decision & Recap'},
  {key:'diagnostic_offer',title:'Diagnostic Offer'},
  {key:'intake',title:'Intake & Data Collection'},
  {key:'discovery',title:'Discovery & Process Mapping'},
  {key:'baseline',title:'Baseline & Economic Analysis'},
  {key:'findings',title:'Findings Readout'},
  {key:'conversion',title:'Conversion & Kickoff'},
  {key:'delivery',title:'Tier Delivery'},
  {key:'measurement',title:'Measurement & Proof'},
  {key:'closeout',title:'Closeout / Renewal'}
]);

const TASK_ALIASES = new Map([
  ['open',TASK_STATUS.NOT_STARTED],
  ['not_started',TASK_STATUS.NOT_STARTED],
  ['waiting_on_client',TASK_STATUS.WAITING_ON_CLIENT],
  ['client',TASK_STATUS.WAITING_ON_CLIENT],
  ['waiting_on_nexus',TASK_STATUS.WAITING_ON_NEXUS],
  ['nexus',TASK_STATUS.WAITING_ON_NEXUS],
  ['in_progress',TASK_STATUS.IN_PROGRESS],
  ['ready_for_review',TASK_STATUS.READY_FOR_REVIEW],
  ['blocked',TASK_STATUS.BLOCKED],
  ['done',TASK_STATUS.COMPLETED],
  ['complete',TASK_STATUS.COMPLETED],
  ['completed',TASK_STATUS.COMPLETED],
  ['approved',TASK_STATUS.COMPLETED],
  ['not_applicable',TASK_STATUS.NOT_APPLICABLE]
]);

export function normalizeTaskStatus(value){
  const key=String(value??'').trim().toLowerCase();
  return TASK_ALIASES.get(key)??null;
}

export function normalizeDiagnosisStatus(value){
  const key=String(value??'').trim().toLowerCase();
  if(key==='in_review')return DIAGNOSIS_STATUS.READY_FOR_REVIEW;
  return Object.values(DIAGNOSIS_STATUS).includes(key)?key:null;
}

export function selectActiveEngagement(projects=[],explicitId=null){
  const rows=Array.isArray(projects)?projects.filter(Boolean):[];
  if(explicitId){
    const match=rows.find(p=>p.id===explicitId);
    return match?{project:match,reason:'explicit'}:{project:null,reason:'explicit_not_found'};
  }
  const active=rows.filter(p=>!['complete','completed','archived','cancelled','canceled'].includes(String(p.status||'').toLowerCase()));
  if(active.length===1)return {project:active[0],reason:'single_active'};
  if(active.length===0&&rows.length===1)return {project:rows[0],reason:'single_total'};
  return {project:null,reason:active.length>1?'ambiguous_multiple_active':'no_active_engagement'};
}

export function evaluateGate(requirements=[]){
  const rows=Array.isArray(requirements)?requirements:[];
  if(!rows.length)return {state:GATE_STATE.NOT_STARTED,complete:0,total:0,blocking:[]};

  const blocking=[];
  let complete=0;
  let waitingClient=false;
  let waitingNexus=false;
  let waitingDecision=false;
  let inProgress=false;

  for(const requirement of rows){
    const status=String(requirement?.status||'not_started').toLowerCase();
    if(['complete','completed','approved','not_applicable'].includes(status)){complete++;continue}
    if(status==='blocked')blocking.push(requirement);
    if(status==='waiting_on_client')waitingClient=true;
    else if(status==='waiting_on_nexus')waitingNexus=true;
    else if(['waiting_on_decision','pending_approval','ready_for_review'].includes(status))waitingDecision=true;
    else if(status!=='not_started')inProgress=true;
  }

  let state=GATE_STATE.NOT_STARTED;
  if(blocking.length)state=GATE_STATE.BLOCKED;
  else if(complete===rows.length)state=GATE_STATE.COMPLETE;
  else if(waitingDecision)state=GATE_STATE.WAITING_ON_DECISION;
  else if(waitingClient)state=GATE_STATE.WAITING_ON_CLIENT;
  else if(waitingNexus)state=GATE_STATE.WAITING_ON_NEXUS;
  else if(inProgress||complete>0)state=GATE_STATE.IN_PROGRESS;

  return {state,complete,total:rows.length,blocking};
}

export function canAdvanceStage({currentStageKey,gate}){
  if(!JOURNEY_STAGES.some(s=>s.key===currentStageKey))return false;
  return gate?.state===GATE_STATE.COMPLETE;
}

export function diagnosisGateState(run){
  if(!run)return GATE_STATE.NOT_STARTED;
  const status=normalizeDiagnosisStatus(run.status);
  const hasResult=!!run.analysis_result&&(
    typeof run.analysis_result==='string'?run.analysis_result.trim().length>0:Object.keys(run.analysis_result||{}).length>0
  );
  if(status===DIAGNOSIS_STATUS.APPROVED&&hasResult)return GATE_STATE.COMPLETE;
  if([DIAGNOSIS_STATUS.FAILED,DIAGNOSIS_STATUS.BLOCKED,DIAGNOSIS_STATUS.REVISION_REQUESTED].includes(status))return GATE_STATE.BLOCKED;
  if(status===DIAGNOSIS_STATUS.READY_FOR_REVIEW||hasResult)return GATE_STATE.WAITING_ON_DECISION;
  if([DIAGNOSIS_STATUS.QUEUED,DIAGNOSIS_STATUS.ANALYZING,DIAGNOSIS_STATUS.READY_FOR_ANALYSIS].includes(status))return GATE_STATE.IN_PROGRESS;
  return GATE_STATE.NOT_STARTED;
}
