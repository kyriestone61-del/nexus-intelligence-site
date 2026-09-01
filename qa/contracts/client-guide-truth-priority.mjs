export function normalizeSourceResult(data,{error=null}={}){
  if(error)return {verified:false,data:null,error:String(error?.message||error)};
  return {verified:true,data:Array.isArray(data)?data:[] ,error:null};
}

export function sourcesVerified(snapshot,names){
  return names.every(name=>snapshot?.sourceState?.[name]?.verified===true);
}

function dueTime(value){
  if(!value)return Number.POSITIVE_INFINITY;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:Number.POSITIVE_INFINITY;
}

function urgencyBand(item,nowMs){
  const status=String(item?.status||'').toLowerCase();
  const due=dueTime(item?.due);
  const overdue=Number.isFinite(due)&&due<nowMs;
  const dueSoon=Number.isFinite(due)&&due>=nowMs&&due<=nowMs+(3*24*60*60*1000);
  const priority=String(item?.priority||'normal').toLowerCase();

  if(['blocked','failed','action_required'].includes(status))return 0;
  if(overdue)return 1;
  if(item?.kind==='approval'||['ready_for_review','pending_review'].includes(status))return 2;
  if(priority==='critical'||priority==='high')return 3;
  if(dueSoon)return 4;
  return 5;
}

export function rankClientActions(items,{now=Date.now(),limit=3}={}){
  return [...(Array.isArray(items)?items:[])]
    .map((item,index)=>({...item,__sourceIndex:index,__urgency:urgencyBand(item,now),__due:dueTime(item?.due)}))
    .sort((a,b)=>a.__urgency-b.__urgency||a.__due-b.__due||a.__sourceIndex-b.__sourceIndex)
    .slice(0,limit)
    .map(({__sourceIndex,__urgency,__due,...item})=>item);
}

export function actionStateMessage({verified,items},{empty='You are clear right now',unverified='Live action state could not be verified. Refresh before assuming nothing needs you.'}={}){
  if(!verified)return unverified;
  return Array.isArray(items)&&items.length?null:empty;
}

export function reportAvailabilityMessage({verified,releases}){
  if(!verified)return 'Report availability could not be verified. Refresh or open Reports to check again.';
  const count=(Array.isArray(releases)?releases:[]).filter(r=>r?.status==='released').length;
  return count?`You have ${count} released ${count===1?'report':'reports'} available.`:'No released report is visible yet.';
}
