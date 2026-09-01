import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-nexus-worker-token","Access-Control-Allow-Methods":"POST,OPTIONS"};
const base=()=>Deno.env.get('SUPABASE_URL')||'https://dmdgkjksouhhsuojthav.supabase.co';
const service=()=>Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const h=()=>({'content-type':'application/json','apikey':service(),'authorization':`Bearer ${service()}`});
const clean=(v:any,n=2000)=>String(v??'').slice(0,n);
const now=()=>new Date().toISOString();

async function config(){const r=await fetch(`${base()}/rest/v1/nexus_worker_config?key=eq.email_worker&select=secret_hash,enabled`,{headers:h()});if(!r.ok)throw new Error('CONFIG_LOAD_FAILED');return (await r.json())?.[0]||null}
async function digest(v:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function patchEmail(id:string,p:any){await fetch(`${base()}/rest/v1/nexus_email_outbox?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{...h(),'Prefer':'return=minimal'},body:JSON.stringify({...p,updated_at:now()})})}
async function patchSms(id:string,p:any){await fetch(`${base()}/rest/v1/nexus_sms_outbox?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{...h(),'Prefer':'return=minimal'},body:JSON.stringify({...p,updated_at:now()})})}
async function health(check_name:string,status:'healthy'|'degraded'|'failed',summary:string,details:any={}){await fetch(`${base()}/rest/v1/nexus_system_health`,{method:'POST',headers:{...h(),'Prefer':'return=minimal'},body:JSON.stringify({check_name,status,summary,details,checked_at:now()})}).catch(()=>{})}
function validE164(v:string){return /^\+[1-9]\d{7,14}$/.test(String(v||'').replace(/[\s().-]/g,''))}
function phone(v:string){return String(v||'').replace(/[\s().-]/g,'')}

async function processEmail(){
  const resend=Deno.env.get('RESEND_API_KEY')||'';
  const from=Deno.env.get('NEXUS_EMAIL_FROM')||'Nexus Intelligence <contact@nexusintelligence.live>';
  if(!resend){
    await health('email_delivery','failed','Transactional email provider is not configured.',{missing:['RESEND_API_KEY'],sender:from});
    return {configured:false,claimed:0,sent:0,retried:0,failed:0};
  }
  const claim=await fetch(`${base()}/rest/v1/rpc/nexus_claim_email_batch`,{method:'POST',headers:h(),body:JSON.stringify({p_limit:25})});
  if(!claim.ok)throw new Error(`EMAIL_CLAIM_${claim.status}`);
  const rows=await claim.json();let sent=0,retried=0,failed=0;
  for(const row of rows){
    try{
      const action=row.action_url?`${Deno.env.get('NEXUS_PUBLIC_ORIGIN')||'https://nexusintelligence.live'}${row.action_url}`:null;
      const body=clean(row.body_text,12000)+(action?`\n\nOpen Nexus: ${action}`:'');
      const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${resend}`,'content-type':'application/json'},body:JSON.stringify({from,to:[row.recipient_email],subject:clean(row.subject,250),text:body,headers:{'X-Entity-Ref-ID':row.id}})});
      const p=await r.json().catch(()=>({}));
      if(!r.ok){const permanent=[400,401,403,404,422].includes(r.status);await patchEmail(row.id,{status:permanent||Number(row.attempts)>=4?'failed':'queued',available_at:new Date(Date.now()+(permanent?0:Math.min(60,15*Math.max(1,Number(row.attempts))))*60000).toISOString(),last_attempt_at:now(),failure_class:permanent?'permanent':'transient',last_error:clean(p?.message||`Provider ${r.status}`,1000),provider_status:String(r.status)});permanent||Number(row.attempts)>=4?failed++:retried++;continue}
      await patchEmail(row.id,{status:'sent',sent_at:now(),provider_message_id:p?.id||null,last_attempt_at:now(),failure_class:null,last_error:null,provider_status:'accepted'});sent++;
    }catch(e){await patchEmail(row.id,{status:Number(row.attempts)>=4?'failed':'queued',available_at:new Date(Date.now()+15*60000).toISOString(),last_attempt_at:now(),failure_class:'transient',last_error:clean((e as Error).message,1000)});retried++}
  }
  const oldest=await fetch(`${base()}/rest/v1/nexus_email_outbox?status=eq.queued&select=created_at&order=created_at.asc&limit=1`,{headers:h()}).then(r=>r.ok?r.json():[]);
  const age=oldest?.[0]?Math.round((Date.now()-Date.parse(oldest[0].created_at))/60000):0;
  await health('email_delivery',failed?'degraded':age>30?'degraded':'healthy',`Email worker claimed ${rows.length}; sent ${sent}; retrying ${retried}; failed ${failed}.`,{claimed:rows.length,sent,retried,failed,oldest_queue_minutes:age,sender:from});
  return {configured:true,claimed:rows.length,sent,retried,failed,oldest_queue_minutes:age};
}

async function smsRows(status='in.(queued,unavailable)'){
  const r=await fetch(`${base()}/rest/v1/nexus_sms_outbox?status=${status}&available_at=lte.${encodeURIComponent(now())}&select=*&order=created_at.asc&limit=25`,{headers:h()});
  if(!r.ok)throw new Error(`SMS_QUEUE_${r.status}`);return r.json();
}
async function processSms(){
  const sid=Deno.env.get('TWILIO_ACCOUNT_SID')||'',token=Deno.env.get('TWILIO_AUTH_TOKEN')||'',from=Deno.env.get('TWILIO_FROM_NUMBER')||'';
  if(!sid||!token||!from){
    const queued=await smsRows('eq.queued');let marked=0;
    for(const row of queued){await patchSms(row.id,{status:'unavailable',provider_status:'unavailable',last_error:'SMS provider not configured',last_attempt_at:now()});marked++}
    await health('sms_delivery','degraded','SMS provider is not configured; in-app delivery remains active.',{missing:[!sid&&'TWILIO_ACCOUNT_SID',!token&&'TWILIO_AUTH_TOKEN',!from&&'TWILIO_FROM_NUMBER'].filter(Boolean),marked_unavailable:marked});
    return {configured:false,processed:marked,sent:0,retried:0,failed:0,invalid:0};
  }
  const rows=await smsRows();let sent=0,retried=0,failed=0,invalid=0;
  for(const row of rows){
    const to=phone(row.recipient_phone);
    if(!validE164(to)){await patchSms(row.id,{status:'unavailable',provider_status:'invalid_phone',last_error:'Phone number must use E.164 format.',last_attempt_at:now()});invalid++;continue}
    await patchSms(row.id,{status:'sending',attempts:Number(row.attempts||0)+1,last_attempt_at:now(),last_error:null});
    try{
      const action=row.action_url?`${Deno.env.get('NEXUS_PUBLIC_ORIGIN')||'https://nexusintelligence.live'}${row.action_url}`:'';
      const body=`${clean(row.body_text,1200)}${action?` ${action}`:''}`.slice(0,1500);
      const params=new URLSearchParams({To:to,From:from,Body:body});
      const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:params});
      const p=await r.json().catch(()=>({}));
      if(!r.ok){const attempts=Number(row.attempts||0)+1,permanent=[400,401,403,404,422].includes(r.status)||attempts>=5;await patchSms(row.id,{status:permanent?'failed':'queued',available_at:new Date(Date.now()+15*60000).toISOString(),provider_status:String(r.status),last_error:clean(p?.message||`Twilio ${r.status}`,1000)});permanent?failed++:retried++;continue}
      await patchSms(row.id,{status:'sent',sent_at:now(),provider_message_id:p?.sid||null,provider_status:p?.status||'accepted',last_error:null});sent++;
    }catch(e){const attempts=Number(row.attempts||0)+1,terminal=attempts>=5;await patchSms(row.id,{status:terminal?'failed':'queued',available_at:new Date(Date.now()+15*60000).toISOString(),provider_status:'failed',last_error:clean((e as Error).message,1000)});terminal?failed++:retried++}
  }
  await health('sms_delivery',failed?'degraded':'healthy',`SMS worker processed ${rows.length}; sent ${sent}; retrying ${retried}; failed ${failed}; invalid ${invalid}.`,{processed:rows.length,sent,retried,failed,invalid});
  return {configured:true,processed:rows.length,sent,retried,failed,invalid};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return new Response('method not allowed',{status:405,headers:cors});
  try{
    const cfg=await config();const workerToken=req.headers.get('x-nexus-worker-token')||'';
    if(!cfg?.enabled||!workerToken||await digest(workerToken)!==cfg.secret_hash)return new Response(JSON.stringify({ok:false,error:'Unauthorized'}),{status:401,headers:{...cors,'content-type':'application/json'}});
    const email=await processEmail().catch(async e=>{await health('email_delivery','failed','Email worker execution failed.',{error:clean((e as Error).message,500)});return {configured:!!Deno.env.get('RESEND_API_KEY'),error:clean((e as Error).message,500)}});
    const sms=await processSms().catch(async e=>{await health('sms_delivery','failed','SMS worker execution failed.',{error:clean((e as Error).message,500)});return {configured:!!Deno.env.get('TWILIO_ACCOUNT_SID'),error:clean((e as Error).message,500)}});
    return new Response(JSON.stringify({ok:true,email,sms}),{headers:{...cors,'content-type':'application/json'}});
  }catch(e){console.error(e);await health('notification_delivery','failed','Notification worker execution failed.',{error:clean((e as Error).message,500)});return new Response(JSON.stringify({ok:false,error:'Notification worker failed'}),{status:500,headers:{...cors,'content-type':'application/json'}})}
});
