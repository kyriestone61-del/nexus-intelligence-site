const PUBLIC_ORIGIN='https://nexusintelligence.live';
const ALLOWED_ORIGINS=new Set([
  PUBLIC_ORIGIN,
  'https://www.nexusintelligence.live',
  'https://nexus-intelligence-site.pages.dev'
]);
const clean=(value:unknown,max=500)=>String(value??'').slice(0,max);

function originAllowed(origin:string|null){
  if(!origin)return false;
  if(ALLOWED_ORIGINS.has(origin))return true;
  try{return new URL(origin).hostname.endsWith('.nexus-intelligence-site.pages.dev')}catch{return false}
}
function validEmail(email:string){return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
async function digest(secret:string,value:string){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${secret}:${value}`));
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':PUBLIC_ORIGIN}})}
function generic(){return reply({ok:true,message:'If that email matches a Relystra account, a secure recovery request has been queued. Delivery can be delayed if the transactional provider is temporarily at capacity.'})}
function observedSource(req:Request){
  return clean(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'edge-unknown',80).split(',')[0].trim();
}

export async function maybeHandleAuthRecoveryRequest(req:Request,baseUrl:string,serviceHeaders:Record<string,string>,serviceSecret:string){
  if(req.method!=='POST')return null;
  const body=await req.clone().json().catch(()=>null);
  if(!body||String(body?.mode||'')!=='auth_recovery')return null;

  const origin=req.headers.get('origin');
  if(!originAllowed(origin))return reply({ok:false,error:'origin_not_allowed'},403);
  if(!serviceSecret)return reply({ok:false,error:'auth_email_service_unavailable'},503);

  const email=clean(body?.email,254).trim().toLowerCase();
  if(!validEmail(email))return reply({ok:false,error:'valid_email_required'},400);

  try{
    const source=observedSource(req);
    const [emailHash,ipHash]=await Promise.all([
      digest(serviceSecret,`email:${email}`),
      digest(serviceSecret,`source:${source}`)
    ]);
    const response=await fetch(`${baseUrl}/rest/v1/rpc/nexus_queue_auth_recovery`,{
      method:'POST',
      headers:serviceHeaders,
      body:JSON.stringify({p_email:email,p_email_hash:emailHash,p_ip_hash:ipHash})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload?.ok===false){
      console.error('relystra_auth_recovery_queue_failed',response.status,clean(payload?.error,80));
      return reply({ok:false,error:'auth_email_service_unavailable'},503);
    }
    return generic();
  }catch(error){
    console.error('relystra_auth_recovery_request_failed',clean((error as Error)?.message||error,120));
    return reply({ok:false,error:'auth_email_service_unavailable'},503);
  }
}
