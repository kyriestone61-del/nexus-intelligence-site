const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const PUBLIC_ORIGIN='https://nexusintelligence.live';
const APP='relystra';
const RECOVERY_EMAIL_HOURLY_LIMIT=3;
const RECOVERY_IP_HOURLY_LIMIT=12;
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const safe=(value,max=500)=>String(value??'').slice(0,max);

function allowedOrigin(origin){
  if(!origin)return true;
  try{
    const url=new URL(origin);
    return url.origin===PUBLIC_ORIGIN||url.origin==='https://www.nexusintelligence.live'||url.hostname==='nexus-intelligence-site.pages.dev'||url.hostname.endsWith('.nexus-intelligence-site.pages.dev');
  }catch{return false}
}
function cors(origin){
  const headers={...jsonHeaders,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'};
  if(origin&&allowedOrigin(origin))headers['access-control-allow-origin']=origin;
  return headers;
}
function response(body,status=200,origin=null){return new Response(JSON.stringify(body),{status,headers:cors(origin)})}
function generic(origin){return response({ok:true,message:'If that email matches a Relystra account, a secure recovery link will be sent shortly.'},200,origin)}
function validEmail(email){return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function sourceIp(request){return (request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim()}
function authProvider(env){
  const dedicated=env?.RELYSTRA_AUTH_RESEND_API_KEY||'';
  const shared=env?.RESEND_API_KEY||'';
  return {key:dedicated||shared,keySource:dedicated?'dedicated_auth_key':'shared_transactional_fallback'};
}
function sender(env){
  const configured=env?.RELYSTRA_AUTH_EMAIL_FROM||env?.NEXUS_EMAIL_FROM||'contact@nexusintelligence.live';
  const address=configured.match(/<([^>]+)>/)?.[1]||configured;
  return `Relystra <${address}>`;
}
async function digest(secret,value){
  const data=new TextEncoder().encode(`${secret}:${value}`);
  const hash=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function supabaseHeaders(env,prefer=''){
  const headers={'content-type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'authorization':`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
  if(prefer)headers.Prefer=prefer;
  return headers;
}
async function recentCount(env,column,value){
  const cutoff=new Date(Date.now()-60*60*1000).toISOString();
  const query=new URLSearchParams({
    app:'eq.relystra',event_type:'eq.recovery',[column]:`eq.${value}`,requested_at:`gte.${cutoff}`,select:'id',limit:column==='email_hash'?'4':'13'
  });
  const result=await fetch(`${SUPABASE_URL}/rest/v1/platform_auth_email_events?${query.toString()}`,{headers:supabaseHeaders(env)});
  if(!result.ok)throw new Error(`auth_rate_lookup_${result.status}`);
  const rows=await result.json();
  return Array.isArray(rows)?rows.length:0;
}
async function createEvent(env,emailHash,ipHash,keySource){
  const result=await fetch(`${SUPABASE_URL}/rest/v1/platform_auth_email_events`,{
    method:'POST',headers:supabaseHeaders(env,'return=representation'),
    body:JSON.stringify({app:APP,event_type:'recovery',email_hash:emailHash,ip_hash:ipHash,status:'requested',metadata:{delivery_path:'cloudflare_resend',key_source:keySource}})
  });
  if(!result.ok)throw new Error(`auth_event_create_${result.status}`);
  const rows=await result.json();
  if(!rows?.[0]?.id)throw new Error('auth_event_create_empty');
  return rows[0].id;
}
async function patchEvent(env,id,patch){
  if(!id)return;
  const result=await fetch(`${SUPABASE_URL}/rest/v1/platform_auth_email_events?id=eq.${encodeURIComponent(id)}`,{
    method:'PATCH',headers:supabaseHeaders(env,'return=minimal'),body:JSON.stringify(patch)
  });
  if(!result.ok)console.error('Relystra auth-email audit update failed',result.status);
}
async function generateRecoveryLink(env,email){
  const result=await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`,{
    method:'POST',headers:supabaseHeaders(env),
    body:JSON.stringify({type:'recovery',email,redirect_to:`${PUBLIC_ORIGIN}/portal?mode=recovery`})
  });
  const payload=await result.json().catch(()=>({}));
  if(!result.ok)return {ok:false,status:result.status,kind:'not_found_or_unavailable'};
  const actionLink=payload?.action_link||payload?.properties?.action_link||null;
  return actionLink?{ok:true,actionLink}:{ok:false,status:500,kind:'missing_action_link'};
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
async function deliverRecovery(env,email,actionLink,eventId,key,keySource){
  const safeLink=escapeHtml(actionLink);
  const subject='Reset your Relystra password';
  const text=`Reset your Relystra password\n\nA password reset was requested for your Relystra account.\n\nCreate a new password: ${actionLink}\n\nIf you did not request this, you can ignore this message. Do not forward this email.`;
  const html=`<!doctype html><html><body style="margin:0;background:#f4f2ed;color:#17161c;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:30px 18px"><div style="background:#0b0a10;color:#f7f2e9;padding:22px 26px;border-radius:14px 14px 0 0"><strong style="letter-spacing:2px">RELYSTRA</strong></div><div style="background:#fff;padding:30px 26px;border:1px solid #ddd8cf;border-top:0;border-radius:0 0 14px 14px"><h1 style="font-size:28px;margin:0 0 16px">Reset your password</h1><p style="line-height:1.6">A password reset was requested for your Relystra account.</p><p style="margin:26px 0"><a href="${safeLink}" style="display:inline-block;background:#17131f;color:#fff;text-decoration:none;padding:13px 18px;border-radius:8px;font-weight:700">Create a new password</a></p><p style="font-size:13px;line-height:1.6;color:#666">If you did not request this, you can ignore this message. For your security, do not forward this email.</p></div></div></body></html>`;
  const result=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{authorization:`Bearer ${key}`,'content-type':'application/json','Idempotency-Key':`relystra-auth-${eventId}`},
    body:JSON.stringify({from:sender(env),to:[email],reply_to:'contact@nexusintelligence.live',subject,html,text,tags:[{name:'message_type',value:'auth_recovery'},{name:'app',value:'relystra'}],headers:{'X-Entity-Ref-ID':eventId,'X-Auth-Mail-Key-Source':keySource}})
  });
  const payload=await result.json().catch(()=>({}));
  return {ok:result.ok,status:result.status,id:payload?.id||null,error:safe(payload?.message||`provider_${result.status}`,120)};
}

export async function onRequestOptions({request}){
  const origin=request.headers.get('origin');
  if(origin&&!allowedOrigin(origin))return response({ok:false,error:'origin_not_allowed'},403,origin);
  return new Response(null,{status:204,headers:cors(origin)});
}

export async function onRequestPost({request,env}){
  const origin=request.headers.get('origin');
  if(origin&&!allowedOrigin(origin))return response({ok:false,error:'origin_not_allowed'},403,origin);
  const {key,keySource}=authProvider(env);
  if(!env?.SUPABASE_SERVICE_ROLE_KEY||!env?.EMAIL_DISPATCH_SECRET||!key){
    return response({ok:false,error:'auth_email_service_unavailable'},503,origin);
  }

  let body={};
  try{body=await request.json()}catch{return response({ok:false,error:'invalid_request'},400,origin)}
  if(String(body?.operation||'recovery')!=='recovery')return response({ok:false,error:'operation_not_allowed'},400,origin);
  const email=safe(body?.email,254).trim().toLowerCase();
  if(!validEmail(email))return response({ok:false,error:'valid_email_required'},400,origin);

  let eventId='';
  try{
    const [emailHash,ipHash]=await Promise.all([
      digest(env.EMAIL_DISPATCH_SECRET,email),
      digest(env.EMAIL_DISPATCH_SECRET,sourceIp(request))
    ]);
    const [emailRecent,ipRecent]=await Promise.all([recentCount(env,'email_hash',emailHash),recentCount(env,'ip_hash',ipHash)]);
    eventId=await createEvent(env,emailHash,ipHash,keySource);
    if(emailRecent>=RECOVERY_EMAIL_HOURLY_LIMIT||ipRecent>=RECOVERY_IP_HOURLY_LIMIT){
      await patchEvent(env,eventId,{status:'suppressed',error_code:'rate_limited'});
      return generic(origin);
    }

    const generated=await generateRecoveryLink(env,email);
    if(!generated.ok){
      await patchEvent(env,eventId,{status:generated.kind==='not_found_or_unavailable'?'not_found':'internal_failed',error_code:generated.kind});
      return generated.kind==='not_found_or_unavailable'?generic(origin):response({ok:false,error:'auth_email_service_unavailable'},503,origin);
    }
    await patchEvent(env,eventId,{status:'generated'});

    const delivery=await deliverRecovery(env,email,generated.actionLink,eventId,key,keySource);
    if(!delivery.ok){
      await patchEvent(env,eventId,{status:'provider_failed',provider:'resend',error_code:`provider_${delivery.status}`,metadata:{delivery_path:'cloudflare_resend',key_source:keySource,provider_error_class:delivery.error}});
      console.error('Relystra auth recovery provider failed',delivery.status);
      return response({ok:false,error:'auth_email_temporarily_unavailable'},503,origin);
    }
    await patchEvent(env,eventId,{status:'provider_accepted',provider:'resend',provider_message_id:delivery.id,provider_accepted_at:new Date().toISOString()});
    return generic(origin);
  }catch(error){
    console.error('Relystra auth recovery failed',safe(error?.message||error,120));
    if(eventId)await patchEvent(env,eventId,{status:'internal_failed',error_code:'internal_failure'});
    return response({ok:false,error:'auth_email_service_unavailable'},503,origin);
  }
}
