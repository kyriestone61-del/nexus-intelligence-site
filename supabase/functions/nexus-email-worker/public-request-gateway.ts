const PUBLIC_ORIGIN='https://nexusintelligence.live';
const ALLOWED_ORIGINS=new Set([PUBLIC_ORIGIN,'https://www.nexusintelligence.live','https://nexus-intelligence-site.pages.dev']);
const clean=(value:unknown,max=500)=>String(value??'').trim().slice(0,max);
const uuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
const validEmail=(email:string)=>email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function originAllowed(origin:string|null){
  if(!origin)return false;
  if(ALLOWED_ORIGINS.has(origin))return true;
  try{return new URL(origin).hostname.endsWith('.nexus-intelligence-site.pages.dev')}catch{return false}
}
function response(body:unknown,status=200,origin:string|null=null){
  const headers:Record<string,string>={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
  if(origin&&originAllowed(origin))headers['access-control-allow-origin']=origin;
  return new Response(JSON.stringify(body),{status,headers});
}
async function digest(secret:string,value:string){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${secret}:${value}`));
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function sourceIp(req:Request){
  const direct=clean(req.headers.get('cf-connecting-ip')||req.headers.get('sb-client-ip'),80);
  if(direct)return direct;
  const forwarded=clean(req.headers.get('x-forwarded-for'),400).split(',').map(value=>value.trim()).filter(Boolean);
  return forwarded.at(-1)||'unknown';
}
async function jsonFetch(url:string,options:RequestInit){
  const upstream=await fetch(url,options),payload=await upstream.json().catch(()=>({}));
  if(!upstream.ok)throw new Error(`UPSTREAM_${upstream.status}:${clean(payload?.message||payload?.error||'request_failed',120)}`);
  return payload;
}

async function recover(req:Request,body:any,baseUrl:string,headers:Record<string,string>,secret:string,origin:string){
  const email=clean(body?.email,254).toLowerCase();
  if(!validEmail(email))return response({ok:false,error:'valid_email_required'},400,origin);
  const [emailHash,ipHash]=await Promise.all([digest(secret,`email:${email}`),digest(secret,`ip:${sourceIp(req)}`)]);
  const queued=await jsonFetch(`${baseUrl}/rest/v1/rpc/nexus_queue_auth_recovery`,{method:'POST',headers,body:JSON.stringify({p_email:email,p_email_hash:emailHash,p_ip_hash:ipHash})});
  if(queued?.ok===false)throw new Error(String(queued?.error||'RECOVERY_REJECTED'));
  return response({ok:true,message:'If that email matches a Relystra account, a secure recovery link will be sent shortly.'},200,origin);
}

async function snapshot(req:Request,body:any,baseUrl:string,headers:Record<string,string>,secret:string,origin:string){
  const payload=body?.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return response({ok:false,error:'invalid_request'},400,origin);
  const email=clean(payload.email,254).toLowerCase();
  if(!validEmail(email))return response({ok:false,error:'valid_email_required'},400,origin);
  const canonical=JSON.stringify(payload);
  if(canonical.length>32000)return response({ok:false,error:'invalid_request'},400,origin);
  const [ipHash,emailHash,dedupeKey]=await Promise.all([
    digest(secret,`snapshot-ip:${sourceIp(req)}`),digest(secret,`snapshot-email:${email}`),digest(secret,`snapshot:${email}:${canonical}`)
  ]);
  try{
    const id=await jsonFetch(`${baseUrl}/rest/v1/rpc/submit_relystra_opportunity_snapshot`,{method:'POST',headers,body:JSON.stringify({payload,p_ip_hash:ipHash,p_email_hash:emailHash,p_dedupe_key:dedupeKey})});
    return response({ok:true,id:typeof id==='string'?id:null},200,origin);
  }catch(error){
    const message=String((error as Error)?.message||error);
    if(/rate limit/i.test(message))return response({ok:false,error:'rate_limited'},429,origin);
    if(/Invalid|Please|Choose|too long/i.test(message))return response({ok:false,error:'invalid_request'},400,origin);
    throw error;
  }
}

async function invite(req:Request,body:any,baseUrl:string,headers:Record<string,string>,secret:string,origin:string){
  const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!bearer)return response({ok:false,error:'Sign in as a Relystra administrator.'},401,origin);
  const actorResponse=await fetch(`${baseUrl}/auth/v1/user`,{headers:{apikey:secret,authorization:`Bearer ${bearer}`}}),actor=await actorResponse.json().catch(()=>({}));
  if(!actorResponse.ok||!uuid(actor?.id))return response({ok:false,error:'Sign in again as a Relystra administrator.'},401,origin);
  const admins=await jsonFetch(`${baseUrl}/rest/v1/nexus_platform_admins?user_id=eq.${encodeURIComponent(actor.id)}&select=user_id`,{headers});
  if(!Array.isArray(admins)||!admins.length)return response({ok:false,error:'Relystra administrator access required.'},403,origin);
  const companyId=clean(body?.company_id,80),email=clean(body?.email,254).toLowerCase(),fullName=clean(body?.full_name,120)||null;
  if(!uuid(companyId)||!validEmail(email))return response({ok:false,error:'Choose a client and enter a valid email.'},400,origin);
  let userId=await jsonFetch(`${baseUrl}/rest/v1/rpc/relystra_find_auth_user`,{method:'POST',headers,body:JSON.stringify({p_email:email})});
  if(!userId){
    const created=await jsonFetch(`${baseUrl}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email,email_confirm:true,user_metadata:{full_name:fullName||'',relystra_invited:true}})});
    userId=created?.id;
  }
  if(!uuid(userId))throw new Error('INVITATION_USER_UNAVAILABLE');
  const queued=await jsonFetch(`${baseUrl}/rest/v1/rpc/relystra_queue_client_invite`,{method:'POST',headers,body:JSON.stringify({p_user_id:userId,p_company_id:companyId,p_actor_id:actor.id,p_email:email,p_full_name:fullName})});
  return response({ok:true,queued:queued?.queued===true,message:'Client access email queued.'},200,origin);
}

export async function maybeHandlePublicRequest(req:Request,baseUrl:string,headers:Record<string,string>,serviceSecret:string){
  if(req.method!=='POST')return null;
  const body=await req.clone().json().catch(()=>null),mode=String(body?.mode||'');
  if(!['auth_recovery','opportunity_snapshot','invite_client'].includes(mode))return null;
  const origin=req.headers.get('origin');
  if(!originAllowed(origin))return response({ok:false,error:'origin_not_allowed'},403,origin);
  if(!serviceSecret)return response({ok:false,error:'service_unavailable'},503,origin);
  try{
    if(mode==='auth_recovery')return await recover(req,body,baseUrl,headers,serviceSecret,origin!);
    if(mode==='opportunity_snapshot')return await snapshot(req,body,baseUrl,headers,serviceSecret,origin!);
    return await invite(req,body,baseUrl,headers,serviceSecret,origin!);
  }catch(error){
    console.error('relystra_public_request_failed',mode,clean((error as Error)?.message||error,160));
    return response({ok:false,error:'service_unavailable'},503,origin);
  }
}
