import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const legacyAllowed=new Set(['marketing_viewed','cta_clicked','guest_preview_opened','auth_opened','signup_started','signup_completed','login_started','login_completed','oauth_clicked','plan_interest','seo_route_viewed','view_opened','session_started','module_opened']);
const prohibited=new Set(['email','phone','name','first_name','last_name','prompt','response','message','raw_text','free_text','content']);
const buckets=new Map<string,{n:number,t:number}>();
function rate(req:Request){const ip=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',')[0].trim();const now=Date.now();const b=buckets.get(ip);if(!b||now-b.t>60000){buckets.set(ip,{n:1,t:now});return true}if(b.n>=120)return false;b.n++;return true}
const txt=(v:unknown,n=200)=>v==null?null:String(v).slice(0,n);
const hex=(buf:ArrayBuffer)=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
async function sha(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
function cleanProps(x:unknown){const out:Record<string,unknown>={};if(!x||typeof x!=='object'||Array.isArray(x))return out;for(const [k,v] of Object.entries(x as Record<string,unknown>).slice(0,40)){const key=k.slice(0,80);if(prohibited.has(key.toLowerCase()))continue;if(typeof v==='string')out[key]=v.slice(0,500);else if(typeof v==='number'||typeof v==='boolean'||v===null)out[key]=v;else if(Array.isArray(v))out[key]=v.slice(0,20).filter(z=>['string','number','boolean'].includes(typeof z)||z===null).map(z=>typeof z==='string'?z.slice(0,200):z)}return out}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors})}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 if(!rate(req))return json({error:'rate_limited'},429);
 try{
  const body=await req.json();
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const sb=createClient(url,service,{auth:{persistSession:false}});
  const action=String(body?.action||'legacy');

  // Backward-compatible legacy product/marketing telemetry.
  if(action==='legacy'){
   const event=String(body?.event_name||'').slice(0,80);
   if(!legacyAllowed.has(event))return json({error:'event_not_allowed'},400);
   const anonymous_id=String(body?.anonymous_id||'').slice(0,100);
   if(anonymous_id.length<8)return json({error:'anonymous_id_required'},400);
   const {error}=await sb.from('hlo_events').insert({user_id:null,anonymous_id,event_name:event,view_name:String(body?.view_name||'marketing').slice(0,80),properties:cleanProps(body?.properties)});
   if(error)throw error;
   return json({ok:true,mode:'legacy'});
  }

  // Canonical execution-plan telemetry supports anonymous pre-auth journeys and identified learners.
  const authorization=req.headers.get('Authorization')||'';
  let userId:string|null=null;
  if(authorization.toLowerCase().startsWith('bearer ')){
   const authClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
   const {data:authData}=await authClient.auth.getUser();
   if(authData?.user)userId=authData.user.id;
  }
  const anonymousId=txt(body?.anonymous_id,120);
  const anonymousHash=anonymousId&&anonymousId.length>=8?await sha(anonymousId):null;
  if(!userId&&!anonymousHash)return json({error:'identity_required'},400);

  let subject:any=null;
  if(userId){
   const found=await sb.from('hlo_analytics_subjects').select('id,user_id,anonymous_id_hash,do_not_track').eq('user_id',userId).maybeSingle();if(found.error)throw found.error;subject=found.data;
  }
  if(!subject&&anonymousHash){
   const found=await sb.from('hlo_analytics_subjects').select('id,user_id,anonymous_id_hash,do_not_track').eq('anonymous_id_hash',anonymousHash).maybeSingle();if(found.error)throw found.error;subject=found.data;
  }
  if(!subject){
   const ins=await sb.from('hlo_analytics_subjects').insert({user_id:userId,anonymous_id_hash:anonymousHash,identified_at:userId?new Date().toISOString():null,first_seen_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),do_not_track:false}).select('id,user_id,anonymous_id_hash,do_not_track').single();if(ins.error)throw ins.error;subject=ins.data;
  }else{
   const patch:any={last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()};
   if(userId&&!subject.user_id)patch.user_id=userId;
   if(anonymousHash&&!subject.anonymous_id_hash)patch.anonymous_id_hash=anonymousHash;
   const up=await sb.from('hlo_analytics_subjects').update(patch).eq('id',subject.id).select('id,user_id,anonymous_id_hash,do_not_track').single();if(up.error)throw up.error;subject=up.data;
  }

  if(action==='consent'){
   const {error}=await sb.from('hlo_analytics_consents').insert({subject_id:subject.id,user_id:userId,analytics_allowed:body?.analytics_allowed===true,personalization_allowed:body?.personalization_allowed===true,marketing_allowed:body?.marketing_allowed===true,policy_version:txt(body?.policy_version,80)||'2026-09-v1',jurisdiction:txt(body?.jurisdiction,80),source:txt(body?.source,80)||'human_os_app'});
   if(error)throw error;return json({ok:true,mode:'canonical',action:'consent'});
  }

  let consentQuery=sb.from('hlo_analytics_consents').select('analytics_allowed,personalization_allowed,marketing_allowed').eq('subject_id',subject.id).order('created_at',{ascending:false}).limit(1);
  const {data:consent}=await consentQuery.maybeSingle();
  if(!consent?.analytics_allowed||subject.do_not_track)return json({ok:true,accepted:false,reason:'analytics_consent_required'});

  const sid=txt(body?.session_id,60);
  async function ensureSession(){
   if(!sid)return;
   const existing=await sb.from('hlo_analytics_sessions').select('id').eq('id',sid).maybeSingle();if(existing.error)throw existing.error;
   if(!existing.data){const now=new Date().toISOString();const ins=await sb.from('hlo_analytics_sessions').insert({id:sid,subject_id:subject.id,user_id:userId,started_at:body?.started_at||now,last_activity_at:now,entry_view:txt(body?.entry_view,120),device_type:txt(body?.device_type,40),platform:txt(body?.platform,40)||'web',app_version:txt(body?.app_version,80),is_first_session:body?.is_first_session===true,is_synthetic:false});if(ins.error)throw ins.error}
  }

  if(action==='session_start'){
   if(!sid)return json({error:'session_id_required'},400);await ensureSession();return json({ok:true,accepted:true,subject_id:subject.id,session_id:sid});
  }
  if(action==='session_update'){
   if(!sid)return json({error:'session_id_required'},400);await ensureSession();const patch:Record<string,unknown>={last_activity_at:new Date().toISOString()};if(body?.exit_view)patch.exit_view=txt(body.exit_view,120);if(body?.ended_at)patch.ended_at=body.ended_at;const {error}=await sb.from('hlo_analytics_sessions').update(patch).eq('id',sid).eq('subject_id',subject.id);if(error)throw error;return json({ok:true,accepted:true});
  }
  if(action==='learning_snapshot'){
   if(!userId)return json({ok:true,accepted:false,reason:'authentication_required_for_learning_state'});
   if(!consent?.personalization_allowed)return json({ok:true,accepted:false,reason:'personalization_consent_required'});
   await ensureSession();const {error}=await sb.from('hlo_analytics_learning_state_snapshots').insert({subject_id:subject.id,user_id:userId,session_id:sid,objective_id:txt(body?.objective_id,160),capability:txt(body?.capability,120),current_learning_object_id:txt(body?.current_learning_object_id,160),current_learning_object_version:txt(body?.current_learning_object_version,80),curriculum_version:txt(body?.curriculum_version,80),baseline_version:txt(body?.baseline_version,80),recent_practice_outcomes:Array.isArray(body?.recent_practice_outcomes)?body.recent_practice_outcomes.slice(0,20):[],mastery_state:body?.mastery_state&&typeof body.mastery_state==='object'?body.mastery_state:{},recommended_action:txt(body?.recommended_action,200),recommendation_reason:txt(body?.recommendation_reason,500),recommendation_version:txt(body?.recommendation_version,80),experiment_assignments:body?.experiment_assignments&&typeof body.experiment_assignments==='object'?body.experiment_assignments:{},captured_at:body?.captured_at||new Date().toISOString(),is_synthetic:false});if(error)throw error;return json({ok:true,accepted:true});
  }
  if(action==='attribution'){
   const key=txt(body?.idempotency_key,180);if(!key)return json({error:'idempotency_key_required'},400);await ensureSession();const {error}=await sb.from('hlo_analytics_attribution_touches').upsert({idempotency_key:key,subject_id:subject.id,user_id:userId,session_id:sid,touch_type:txt(body?.touch_type,80)||'first_touch',source:txt(body?.source,120)||'direct',medium:txt(body?.medium,120),campaign:txt(body?.campaign,160),content_id:txt(body?.content_id,160),creative_id:txt(body?.creative_id,160),term:txt(body?.term,160),capability_interest:txt(body?.capability_interest,120),referrer_domain:txt(body?.referrer_domain,180),landing_path:txt(body?.landing_path,300),occurred_at:body?.occurred_at||new Date().toISOString(),is_synthetic:false},{onConflict:'idempotency_key',ignoreDuplicates:true});if(error)throw error;return json({ok:true,accepted:true});
  }
  if(action!=='event')return json({error:'unknown_action'},400);
  const key=txt(body?.idempotency_key,180),eventName=txt(body?.event_name,100);if(!key||!eventName)return json({error:'idempotency_key_and_event_name_required'},400);
  await ensureSession();
  const {error}=await sb.from('hlo_analytics_events').upsert({idempotency_key:key,event_name:eventName,subject_id:subject.id,user_id:userId,session_id:sid,occurred_at:body?.occurred_at||new Date().toISOString(),source:txt(body?.source,120),medium:txt(body?.medium,120),campaign:txt(body?.campaign,160),content_id:txt(body?.content_id,160),capability:txt(body?.capability,120),object_id:txt(body?.object_id,160),object_version:txt(body?.object_version,80),curriculum_version:txt(body?.curriculum_version,80),baseline_version:txt(body?.baseline_version,80),app_version:txt(body?.app_version,80),device_type:txt(body?.device_type,40),properties:cleanProps(body?.properties),consent_basis:'explicit_analytics',is_synthetic:false},{onConflict:'idempotency_key',ignoreDuplicates:true});
  if(error)return json({error:'event_rejected',detail:error.message},400);
  if(sid)await sb.from('hlo_analytics_sessions').update({last_activity_at:new Date().toISOString()}).eq('id',sid).eq('subject_id',subject.id);
  return json({ok:true,accepted:true,event_name:eventName,mode:'canonical'});
 }catch(e){console.error(e);return json({error:'ingest_failed',detail:String(e)},500)}
});