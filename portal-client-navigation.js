export const CLIENT_PRIMARY_NAV=Object.freeze([
  Object.freeze({key:'home',label:'Home',sections:Object.freeze(['today'])}),
  Object.freeze({key:'diagnosis',label:'Diagnosis',sections:Object.freeze(['transcript','free-diagnosis','review-findings','reports'])}),
  Object.freeze({key:'work',label:'Work',sections:Object.freeze(['actions','builds','scope','progress','review'])}),
  Object.freeze({key:'handoff',label:'Handoff',sections:Object.freeze(['final-package','support'])}),
]);

const SECTION_ALIASES=Object.freeze({overview:'today',discovery:'transcript',diagnosis:'reports'});
const SECTION_GROUP_OVERRIDES=Object.freeze({files:'work',improvement:'work'});
const PACKAGE_REVIEW_STAGES=new Set(['client_review','revisions']);
const PACKAGE_HANDOFF_STAGES=new Set(['final_qa','support','completed']);

export function normalizeClientSection(section){return SECTION_ALIASES[section]||section||'today'}

export function clientNavGroupForSection(section){
  const normalized=normalizeClientSection(section);
  return SECTION_GROUP_OVERRIDES[normalized]||CLIENT_PRIMARY_NAV.find(group=>group.sections.includes(normalized))?.key||'home';
}

export function resolveClientPrimarySection(group,{snapshot={},activeSection='today',nextSection=null}={}){
  const definition=CLIENT_PRIMARY_NAV.find(item=>item.key===group)||CLIENT_PRIMARY_NAV[0];
  const active=normalizeClientSection(activeSection),next=normalizeClientSection(nextSection);
  if(definition.sections.includes(active))return active;
  if(definition.sections.includes(next))return next;
  if(group==='diagnosis'){
    const step=Number(snapshot?.workflow?.current_step||1);
    if(step<=1)return'transcript';
    if(step===2)return'free-diagnosis';
    if(step===3)return'review-findings';
    return snapshot?.diagnosis?.access===true||snapshot?.diagnosis?.status?'reports':'transcript';
  }
  if(group==='work'){
    if(PACKAGE_REVIEW_STAGES.has(snapshot?.package?.stage))return'review';
    if(snapshot?.package)return'progress';
    return snapshot?.diagnosis?.status==='approved'?'actions':'builds';
  }
  if(group==='handoff')return'final-package';
  return'today';
}

export function clientJourneyStages(snapshot={}){
  const diagnosis=snapshot?.diagnosis||{},packageStage=snapshot?.package?.stage||null,workflowStep=Number(snapshot?.workflow?.current_step||1);
  const basicComplete=workflowStep>=4||diagnosis.access===true||!!diagnosis.status||!!snapshot?.package;
  const diagnosisComplete=basicComplete&&diagnosis.status==='approved';
  const scopeComplete=diagnosisComplete&&!!snapshot?.package;
  const implementationComplete=scopeComplete&&(PACKAGE_REVIEW_STAGES.has(packageStage)||PACKAGE_HANDOFF_STAGES.has(packageStage));
  const revisionsComplete=implementationComplete&&PACKAGE_HANDOFF_STAGES.has(packageStage);
  const handoffComplete=revisionsComplete&&packageStage==='completed';
  const definitions=[
    ['intake','Intake & Basic Diagnosis','transcript',basicComplete],
    ['diagnosis','Full Diagnosis + scoped service','reports',diagnosisComplete],
    ['scope','Scope approval','scope',scopeComplete],
    ['implementation','Implementation + files','progress',implementationComplete],
    ['revisions','Revisions','review',revisionsComplete],
    ['handoff','Acceptance + handoff','final-package',handoffComplete],
  ];
  const current=definitions.findIndex(([, , ,complete])=>!complete);
  return definitions.map(([key,label,target,complete],index)=>({key,label,target,status:complete?'complete':index===current?'current':'upcoming'}));
}
