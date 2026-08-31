const freezeMap=map=>Object.freeze(Object.fromEntries(Object.entries(map).map(([k,v])=>[k,Object.freeze([...v])])));

export const TASK_TRANSITIONS=freezeMap({
  not_started:['in_progress','waiting_on_client','waiting_on_nexus','blocked','not_applicable'],
  waiting_on_client:['ready_for_review','blocked','not_applicable'],
  waiting_on_nexus:['in_progress','blocked','completed','not_applicable'],
  in_progress:['waiting_on_client','waiting_on_nexus','ready_for_review','blocked','completed','not_applicable'],
  ready_for_review:['completed','waiting_on_client','waiting_on_nexus','blocked'],
  blocked:['in_progress','waiting_on_client','waiting_on_nexus','not_applicable'],
  completed:[],
  not_applicable:[]
});

export const DIAGNOSIS_TRANSITIONS=freezeMap({
  ready_for_analysis:['queued','archived'],
  queued:['analyzing','failed','blocked','archived'],
  analyzing:['ready_for_review','failed','blocked'],
  ready_for_review:['approved','revision_requested','blocked','archived'],
  revision_requested:['ready_for_analysis','queued','blocked','archived'],
  blocked:['ready_for_analysis','queued','archived'],
  failed:['ready_for_analysis','queued','archived'],
  approved:['archived'],
  archived:[]
});

export const PROJECT_TRANSITIONS=freezeMap({
  planning:['active','cancelled'],
  active:['paused','complete','cancelled'],
  paused:['active','cancelled'],
  complete:[],
  cancelled:[]
});

export const GATE_TRANSITIONS=freezeMap({
  not_started:['in_progress','waiting_on_client','waiting_on_nexus','waiting_on_decision','blocked'],
  in_progress:['waiting_on_client','waiting_on_nexus','waiting_on_decision','blocked','complete'],
  waiting_on_client:['in_progress','waiting_on_decision','blocked','complete'],
  waiting_on_nexus:['in_progress','waiting_on_decision','blocked','complete'],
  waiting_on_decision:['in_progress','waiting_on_client','waiting_on_nexus','blocked','complete'],
  blocked:['in_progress','waiting_on_client','waiting_on_nexus','waiting_on_decision'],
  complete:[]
});

export function canTransition(map,from,to){
  if(from===to)return true;
  return Array.isArray(map?.[from])&&map[from].includes(to);
}

export function assertTransition(map,from,to,{entity='record'}={}){
  if(canTransition(map,from,to))return true;
  const error=new Error(`Illegal ${entity} transition: ${from} → ${to}`);
  error.code='ILLEGAL_STATE_TRANSITION';
  error.entity=entity;
  error.from=from;
  error.to=to;
  throw error;
}

export function taskTransition(from,to){return assertTransition(TASK_TRANSITIONS,from,to,{entity:'task'})}
export function diagnosisTransition(from,to){return assertTransition(DIAGNOSIS_TRANSITIONS,from,to,{entity:'diagnosis'})}
export function projectTransition(from,to){return assertTransition(PROJECT_TRANSITIONS,from,to,{entity:'project'})}
export function gateTransition(from,to){return assertTransition(GATE_TRANSITIONS,from,to,{entity:'journey gate'})}

export function requireTransitionEvidence({entity,from,to,reason,evidenceRefs=[]}){
  const consequential=(entity==='task'&&['completed','not_applicable'].includes(to))||
    (entity==='diagnosis'&&['approved','archived'].includes(to))||
    (entity==='project'&&['complete','cancelled'].includes(to))||
    (entity==='journey gate'&&to==='complete');
  if(!consequential)return {ok:true};
  const hasReason=typeof reason==='string'&&reason.trim().length>=3;
  const hasEvidence=Array.isArray(evidenceRefs)&&evidenceRefs.filter(Boolean).length>0;
  return {ok:hasReason||hasEvidence,requiresEvidence:true,hasReason,hasEvidence};
}
