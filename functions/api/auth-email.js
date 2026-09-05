const PUBLIC_ORIGIN='https://nexusintelligence.live';
const RECOVERY_WORKER='https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/nexus-email-worker';
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
function sourceIp(request){return (request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,80)}

export async function onRequestOptions({request}){
  const origin=request.headers.get('origin');
  if(origin&&!allowedOrigin(origin))return response({ok:false,error:'origin_not_allowed'},403,origin);
  return new Response(null,{status:204,headers:cors(origin)});
}

export async function onRequestPost({request}){
  const origin=request.headers.get('origin');
  if(origin&&!allowedOrigin(origin))return response({ok:false,error:'origin_not_allowed'},403,origin);

  let body={};
  try{body=await request.json()}catch{return response({ok:false,error:'invalid_request'},400,origin)}
  if(String(body?.operation||'recovery')!=='recovery')return response({ok:false,error:'operation_not_allowed'},400,origin);
  const email=safe(body?.email,254).trim().toLowerCase();
  if(!validEmail(email))return response({ok:false,error:'valid_email_required'},400,origin);

  try{
    const worker=await fetch(RECOVERY_WORKER,{
      method:'POST',
      headers:{'content-type':'application/json','origin':PUBLIC_ORIGIN},
      body:JSON.stringify({mode:'auth_recovery',email,client_ip:sourceIp(request)})
    });
    const payload=await worker.json().catch(()=>({}));
    if(!worker.ok||payload?.ok===false)throw new Error(`recovery_worker_${worker.status}`);
    return generic(origin);
  }catch(error){
    console.error('Relystra password recovery relay failed',safe(error?.message||error,120));
    return response({ok:false,error:'auth_email_service_unavailable'},503,origin);
  }
}
