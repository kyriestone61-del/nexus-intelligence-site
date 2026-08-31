const jsonHeaders={'content-type':'application/json','cache-control':'no-store'};
const safe=(v,n=5000)=>String(v??'').slice(0,n);

export async function onRequestPost({request,env}){
  const required=['RESEND_API_KEY','NEXUS_EMAIL_FROM','SUPABASE_SERVICE_ROLE_KEY','EMAIL_DISPATCH_SECRET'];
  if(required.some(k=>!env?.[k])) return new Response(JSON.stringify({ok:false,error:'Transactional email delivery is not configured.'}),{status:503,headers:jsonHeaders});

  const auth=request.headers.get('authorization')||'';
  if(auth!==`Bearer ${env.EMAIL_DISPATCH_SECRET}`) return new Response(JSON.stringify({ok:false,error:'Unauthorized'}),{status:401,headers:jsonHeaders});

  const base='https://dmdgkjksouhhsuojthav.supabase.co/rest/v1';
  const supaHeaders={'content-type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'authorization':`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
  const now=()=>new Date().toISOString();

  async function patchOutbox(id,patch){
    const res=await fetch(`${base}/nexus_email_outbox?id=eq.${encodeURIComponent(id)}`,{
      method:'PATCH',
      headers:{...supaHeaders,'Prefer':'return=minimal'},
      body:JSON.stringify({...patch,updated_at:now()})
    });
    if(!res.ok) throw new Error(`Email outbox update failed (${res.status}).`);
  }

  try{
    // Digest generation is supplemental. A digest failure must not strand email
    // that is already queued for delivery.
    const digest=await fetch(`${base}/rpc/nexus_queue_action_digests`,{method:'POST',headers:supaHeaders,body:'{}'});
    if(!digest.ok) console.warn('Nexus action digest queueing failed',digest.status);

    const claim=await fetch(`${base}/rpc/nexus_claim_email_batch`,{method:'POST',headers:supaHeaders,body:JSON.stringify({p_limit:20})});
    if(!claim.ok) throw new Error(`Email queue claim failed (${claim.status}).`);
    const rows=await claim.json();

    let sent=0,failed=0;
    for(const row of rows){
      const attemptedAt=now();
      try{
        const action=row.action_url?`${new URL(request.url).origin}${row.action_url}`:null;
        const body=safe(row.body_text,8000)+(action?`\n\nOpen Nexus: ${action}`:'');
        const res=await fetch('https://api.resend.com/emails',{
          method:'POST',
          headers:{'authorization':`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},
          body:JSON.stringify({from:env.NEXUS_EMAIL_FROM,to:[row.recipient_email],subject:safe(row.subject,250),text:body})
        });
        const payload=await res.json().catch(()=>({}));
        if(!res.ok) throw new Error(payload?.message||`Provider returned ${res.status}`);

        await patchOutbox(row.id,{
          status:'sent',
          sent_at:attemptedAt,
          last_attempt_at:attemptedAt,
          provider_message_id:payload?.id||null,
          provider_status:'accepted',
          provider_event_at:attemptedAt,
          failure_class:null,
          last_error:null
        });
        sent++;
      }catch(error){
        failed++;
        const terminal=Number(row.attempts||0)>=3;
        try{
          await patchOutbox(row.id,{
            status:terminal?'failed':'queued',
            available_at:new Date(Date.now()+15*60*1000).toISOString(),
            last_attempt_at:attemptedAt,
            provider_status:'failed',
            provider_event_at:attemptedAt,
            failure_class:'delivery',
            last_error:safe(error?.message||error,1000)
          });
        }catch(updateError){
          console.error('Nexus email failure state could not be persisted',row.id,updateError);
        }
      }
    }

    return new Response(JSON.stringify({ok:true,claimed:rows.length,sent,failed}),{status:200,headers:jsonHeaders});
  }catch(error){
    console.error('Nexus email dispatch error',error);
    return new Response(JSON.stringify({ok:false,error:'Email dispatch failed.'}),{status:500,headers:jsonHeaders});
  }
}
