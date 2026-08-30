const jsonHeaders={'content-type':'application/json','cache-control':'no-store'};
const safe=(v,n=5000)=>String(v??'').slice(0,n);

export async function onRequestPost({request,env}){
  const required=['RESEND_API_KEY','NEXUS_EMAIL_FROM','SUPABASE_SERVICE_ROLE_KEY','EMAIL_DISPATCH_SECRET'];
  if(required.some(k=>!env?.[k])) return new Response(JSON.stringify({ok:false,error:'Transactional email delivery is not configured.'}),{status:503,headers:jsonHeaders});
  const auth=request.headers.get('authorization')||'';
  if(auth!==`Bearer ${env.EMAIL_DISPATCH_SECRET}`) return new Response(JSON.stringify({ok:false,error:'Unauthorized'}),{status:401,headers:jsonHeaders});
  const base='https://dmdgkjksouhhsuojthav.supabase.co/rest/v1';
  const supaHeaders={'content-type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'authorization':`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
  try{
    // Each dispatch cycle also creates one deduplicated action digest per eligible member when actions exist.
    await fetch(`${base}/rpc/nexus_queue_action_digests`,{method:'POST',headers:supaHeaders,body:'{}'});
    const claim=await fetch(`${base}/rpc/nexus_claim_email_batch`,{method:'POST',headers:supaHeaders,body:JSON.stringify({p_limit:20})});
    if(!claim.ok) throw new Error(`Email queue claim failed (${claim.status}).`);
    const rows=await claim.json();
    let sent=0,failed=0;
    for(const row of rows){
      try{
        const action=row.action_url?`${new URL(request.url).origin}${row.action_url}`:null;
        const body=safe(row.body_text,8000)+(action?`\n\nOpen Nexus: ${action}`:'');
        const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'authorization':`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.NEXUS_EMAIL_FROM,to:[row.recipient_email],subject:safe(row.subject,250),text:body})});
        const payload=await res.json().catch(()=>({}));
        if(!res.ok) throw new Error(payload?.message||`Provider returned ${res.status}`);
        await fetch(`${base}/nexus_email_outbox?id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',headers:{...supaHeaders,'Prefer':'return=minimal'},body:JSON.stringify({status:'sent',sent_at:new Date().toISOString(),provider_message_id:payload?.id||null,last_error:null,updated_at:new Date().toISOString()})});
        sent++;
      }catch(error){
        failed++;
        await fetch(`${base}/nexus_email_outbox?id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',headers:{...supaHeaders,'Prefer':'return=minimal'},body:JSON.stringify({status:row.attempts>=3?'failed':'queued',available_at:new Date(Date.now()+15*60*1000).toISOString(),last_error:safe(error.message,1000),updated_at:new Date().toISOString()})});
      }
    }
    return new Response(JSON.stringify({ok:true,claimed:rows.length,sent,failed}),{status:200,headers:jsonHeaders});
  }catch(error){
    console.error('Nexus email dispatch error',error);
    return new Response(JSON.stringify({ok:false,error:'Email dispatch failed.'}),{status:500,headers:jsonHeaders});
  }
}
