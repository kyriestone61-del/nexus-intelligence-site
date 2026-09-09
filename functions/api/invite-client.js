const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const PUBLIC_GATEWAY=`${SUPABASE_URL}/functions/v1/nexus-email-worker`;
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const serviceHeaders=key=>({'content-type':'application/json','apikey':key,'authorization':`Bearer ${key}`});

async function rest(url,options={}){
  const response=await fetch(url,options),payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`upstream_${response.status}:${clean(payload?.message||payload?.error||'request_failed',120)}`);
  return payload;
}

export async function onRequestPost({request,env}){
  const serviceKey=env?.SUPABASE_SERVICE_ROLE_KEY||'';
  const bearer=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!bearer)return reply({ok:false,error:'Sign in as a Relystra administrator.'},401);
  try{
    if(!serviceKey){
      const body=await request.json().catch(()=>({}));
      const upstream=await fetch(PUBLIC_GATEWAY,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${bearer}`,'origin':new URL(request.url).origin},body:JSON.stringify({mode:'invite_client',...body})});
      const payload=await upstream.json().catch(()=>({}));
      return reply(payload,upstream.status);
    }
    const actor=await rest(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${bearer}`}});
    const admins=await rest(`${SUPABASE_URL}/rest/v1/nexus_platform_admins?user_id=eq.${encodeURIComponent(actor.id)}&select=user_id`,{headers:serviceHeaders(serviceKey)});
    if(!Array.isArray(admins)||!admins.length)return reply({ok:false,error:'Relystra administrator access required.'},403);
    const body=await request.json().catch(()=>({})),companyId=clean(body.company_id,80),email=clean(body.email,254).toLowerCase(),fullName=clean(body.full_name,120)||null;
    if(!uuid(companyId)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({ok:false,error:'Choose a client and enter a valid email.'},400);
    let userId=await rest(`${SUPABASE_URL}/rest/v1/rpc/relystra_find_auth_user`,{method:'POST',headers:serviceHeaders(serviceKey),body:JSON.stringify({p_email:email})});
    if(!userId){
      const created=await rest(`${SUPABASE_URL}/auth/v1/admin/users`,{method:'POST',headers:serviceHeaders(serviceKey),body:JSON.stringify({email,email_confirm:true,user_metadata:{full_name:fullName||'',relystra_invited:true}})});
      userId=created?.id;
    }
    if(!uuid(String(userId||'')))throw new Error('invitation_user_unavailable');
    const queued=await rest(`${SUPABASE_URL}/rest/v1/rpc/relystra_queue_client_invite`,{method:'POST',headers:serviceHeaders(serviceKey),body:JSON.stringify({p_user_id:userId,p_company_id:companyId,p_actor_id:actor.id,p_email:email,p_full_name:fullName})});
    return reply({ok:true,queued:queued?.queued===true,message:'Client access email queued.'});
  }catch(error){
    console.error('Relystra client invitation failed',clean(error?.message||error,200));
    return reply({ok:false,error:'The invitation could not be queued. No access email was sent.'},500);
  }
}
