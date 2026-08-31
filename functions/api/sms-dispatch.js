const jsonHeaders={'content-type':'application/json','cache-control':'no-store'};
const SUPABASE='https://dmdgkjksouhhsuojthav.supabase.co';
const safe=(v,n=5000)=>String(v??'').slice(0,n);
const now=()=>new Date().toISOString();

function serviceHeaders(env,extra={}){return {'content-type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'authorization':`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,...extra};}
async function currentUser(token,env){const r=await fetch(`${SUPABASE}/auth/v1/user`,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${token}`}});if(!r.ok)return null;return r.json();}
async function isAdmin(userId,env){const r=await fetch(`${SUPABASE}/rest/v1/nexus_platform_admins?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`,{headers:serviceHeaders(env)});if(!r.ok)return false;const rows=await r.json();return rows.length>0;}
async function authorize(request,env){const bearer=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!bearer)throw new Error('AUTH_REQUIRED');if(env.EMAIL_DISPATCH_SECRET&&bearer===env.EMAIL_DISPATCH_SECRET)return {mode:'scheduler'};const user=await currentUser(bearer,env);if(!user)throw new Error('AUTH_REQUIRED');if(!await isAdmin(user.id,env))throw new Error('ADMIN_REQUIRED');return {mode:'admin',user};}
async function selectRows(env,statuses){const t=encodeURIComponent(now());const status=`in.(${statuses.join(',')})`;const r=await fetch(`${SUPABASE}/rest/v1/nexus_sms_outbox?status=${status}&available_at=lte.${t}&order=created_at.asc&limit=25&select=*`,{headers:serviceHeaders(env)});if(!r.ok)throw new Error(`SMS_QUEUE_${r.status}`);return r.json();}
async function patch(env,id,body,filter=''){const suffix=filter?`&${filter}`:'';const r=await fetch(`${SUPABASE}/rest/v1/nexus_sms_outbox?id=eq.${encodeURIComponent(id)}${suffix}`,{method:'PATCH',headers:serviceHeaders(env,{'Prefer':'return=representation'}),body:JSON.stringify({...body,updated_at:now()})});if(!r.ok)throw new Error(`SMS_PATCH_${r.status}`);return r.json();}
function validE164(v){return /^\+[1-9]\d{7,14}$/.test(String(v||'').replace(/[\s().-]/g,''));}
function normalizedPhone(v){return String(v||'').replace(/[\s().-]/g,'');}

export async function onRequestPost({request,env}){
  if(!env?.SUPABASE_SERVICE_ROLE_KEY)return new Response(JSON.stringify({ok:false,error:'SMS delivery is not configured.'}),{status:503,headers:jsonHeaders});
  try{
    const auth=await authorize(request,env);
    const sid=env.TWILIO_ACCOUNT_SID||'',token=env.TWILIO_AUTH_TOKEN||'',from=env.TWILIO_FROM_NUMBER||'';
    const configured=!!(sid&&token&&from);
    if(!configured){
      const queued=await selectRows(env,['queued']);let marked=0;
      for(const row of queued){await patch(env,row.id,{status:'unavailable',provider_status:'unavailable',last_error:'SMS provider not configured',last_attempt_at:now()});marked++;}
      return new Response(JSON.stringify({ok:true,status:'unavailable',processed:marked,sent:0,mode:auth.mode,message:'SMS provider not configured; in-app and email delivery remain active.'}),{status:200,headers:jsonHeaders});
    }

    const rows=await selectRows(env,['queued','unavailable']);let sent=0,retried=0,failed=0,invalid=0;
    for(const row of rows){
      const phone=normalizedPhone(row.recipient_phone);
      if(!validE164(phone)){await patch(env,row.id,{status:'unavailable',provider_status:'invalid_phone',last_error:'Phone number must use E.164 format, for example +13025550123.',last_attempt_at:now()});invalid++;continue;}
      const claimed=await patch(env,row.id,{status:'sending',attempts:Number(row.attempts||0)+1,last_attempt_at:now(),last_error:null},'status=in.(queued,unavailable)');
      if(!claimed.length)continue;
      try{
        const action=row.action_url?`${new URL(request.url).origin}${row.action_url}`:'';
        const message=`${safe(row.body_text,1200)}${action?` ${action}`:''}`.slice(0,1500);
        const params=new URLSearchParams({To:phone,From:from,Body:message});
        const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:params});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok){const attempts=Number(row.attempts||0)+1,permanent=[400,401,403,404,422].includes(response.status)||attempts>=5;await patch(env,row.id,{status:permanent?'failed':'queued',available_at:new Date(Date.now()+15*60*1000).toISOString(),provider_status:String(response.status),last_error:safe(payload?.message||`Twilio ${response.status}`,1000)});permanent?failed++:retried++;continue;}
        await patch(env,row.id,{status:'sent',sent_at:now(),provider_message_id:payload?.sid||null,provider_status:payload?.status||'accepted',last_error:null});sent++;
      }catch(error){const attempts=Number(row.attempts||0)+1,terminal=attempts>=5;await patch(env,row.id,{status:terminal?'failed':'queued',available_at:new Date(Date.now()+15*60*1000).toISOString(),provider_status:'failed',last_error:safe(error?.message||error,1000)});terminal?failed++:retried++;}
    }
    return new Response(JSON.stringify({ok:true,status:'processed',processed:rows.length,sent,retried,failed,invalid,mode:auth.mode}),{status:200,headers:jsonHeaders});
  }catch(error){const msg=safe(error?.message||error,500);const status=msg==='AUTH_REQUIRED'?401:msg==='ADMIN_REQUIRED'?403:500;return new Response(JSON.stringify({ok:false,error:msg}),{status,headers:jsonHeaders});}
}
