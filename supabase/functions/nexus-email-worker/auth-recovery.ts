const PUBLIC_ORIGIN='https://nexusintelligence.live';
const AUTH_KIND='auth_recovery';
const clean=(value:unknown,max=1000)=>String(value??'').slice(0,max);

export function isAuthRecovery(row:any){
  return row?.message_kind===AUTH_KIND&&row?.related_type==='auth_email_event'&&typeof row?.related_id==='string';
}

async function patchEvent(baseUrl:string,headers:Record<string,string>,id:string,patch:Record<string,unknown>){
  const response=await fetch(`${baseUrl}/rest/v1/platform_auth_email_events?id=eq.${encodeURIComponent(id)}`,{
    method:'PATCH',
    headers:{...headers,Prefer:'return=minimal'},
    body:JSON.stringify(patch)
  });
  if(!response.ok)console.error('relystra_auth_event_update_failed',response.status);
}

function parseSender(value:string){
  const raw=String(value||'').trim();
  const match=raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if(match)return {name:(match[1]||'Relystra').replace(/^['"]|['"]$/g,'').trim()||'Relystra',email:match[2].trim()};
  return {name:'Relystra',email:raw||'contact@nexusintelligence.live'};
}
function providerChoice(sharedResendKey:string){
  const brevo=Deno.env.get('RELYSTRA_AUTH_BREVO_API_KEY')||'';
  if(brevo)return {kind:'brevo',provider:'brevo',key:brevo,keySource:'dedicated_auth_brevo'};
  const dedicatedResend=Deno.env.get('RELYSTRA_AUTH_RESEND_API_KEY')||'';
  if(dedicatedResend)return {kind:'resend',provider:'resend',key:dedicatedResend,keySource:'dedicated_auth_resend'};
  return {kind:'resend',provider:'resend',key:sharedResendKey,keySource:'shared_resend_fallback'};
}
function quotaFailure(status:number,payload:any){
  if(status!==429)return false;
  const marker=`${payload?.name||''} ${payload?.type||''} ${payload?.message||''}`.toLowerCase();
  return marker.includes('daily_quota')||marker.includes('monthly_quota')||marker.includes('quota');
}

export async function prepareAuthRecovery(row:any,baseUrl:string,headers:Record<string,string>){
  if(!isAuthRecovery(row))return null;
  const response=await fetch(`${baseUrl}/auth/v1/admin/generate_link`,{
    method:'POST',
    headers,
    body:JSON.stringify({
      type:'recovery',
      email:String(row.recipient_email||'').trim().toLowerCase(),
      redirect_to:`${PUBLIC_ORIGIN}/portal?mode=recovery`
    })
  });
  const payload=await response.json().catch(()=>({}));
  const actionLink=payload?.action_link||payload?.properties?.action_link||null;
  if(!response.ok||!actionLink){
    await patchEvent(baseUrl,headers,row.related_id,{
      status:'internal_failed',
      error_code:response.ok?'missing_action_link':`generate_link_${response.status}`,
      metadata:{delivery_path:'nexus_email_outbox',token_persisted:false,generation_failed_at:new Date().toISOString()}
    });
    throw new Error(`AUTH_RECOVERY_LINK_${response.status}`);
  }
  await patchEvent(baseUrl,headers,row.related_id,{
    status:'generated',
    error_code:null,
    metadata:{delivery_path:'nexus_email_outbox',token_persisted:false,generated_at:new Date().toISOString()}
  });
  return `${clean(row.body_text,4000)}\n\nCreate a new password: ${actionLink}\n\nIf you did not request this, you can ignore this message. Do not forward this email.`;
}

export async function sendAuthRecovery(row:any,body:string,defaultFrom:string,sharedResendKey:string){
  if(!isAuthRecovery(row))return null;
  const choice=providerChoice(sharedResendKey);
  if(!choice.key)return {ok:false,status:503,id:null,error:'Dedicated authentication email provider is not configured.',provider:choice.provider,keySource:choice.keySource,quotaExceeded:false};
  const from=parseSender(Deno.env.get('RELYSTRA_AUTH_EMAIL_FROM')||defaultFrom||'Relystra <contact@nexusintelligence.live>');
  let response:Response;
  if(choice.kind==='brevo'){
    response=await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',
      headers:{'api-key':choice.key,'content-type':'application/json'},
      body:JSON.stringify({
        sender:from,
        to:[{email:String(row.recipient_email||'').trim()}],
        subject:clean(row.subject,250),
        textContent:body,
        headers:{'X-Entity-Ref-ID':row.id,'X-Relystra-Message-Type':'auth_recovery'}
      })
    });
  }else{
    response=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{authorization:`Bearer ${choice.key}`,'content-type':'application/json','Idempotency-Key':`relystra-auth-${row.id}`},
      body:JSON.stringify({
        from:`${from.name} <${from.email}>`,
        to:[row.recipient_email],
        subject:clean(row.subject,250),
        text:body,
        headers:{'X-Entity-Ref-ID':row.id,'X-Relystra-Message-Type':'auth_recovery'}
      })
    });
  }
  const payload=await response.json().catch(()=>({}));
  const id=payload?.id||payload?.messageId||null;
  const error=clean(payload?.message||payload?.error||`${choice.provider}_${response.status}`,180);
  return {ok:response.ok,status:response.status,id,error,provider:choice.provider,keySource:choice.keySource,quotaExceeded:quotaFailure(response.status,payload)};
}

export async function markAuthRecoveryProviderFailure(row:any,baseUrl:string,headers:Record<string,string>,status:number,errorMessage:string,provider='unknown',keySource='unknown',capacity=false){
  if(!isAuthRecovery(row))return;
  await patchEvent(baseUrl,headers,row.related_id,{
    status:'provider_failed',
    provider,
    error_code:capacity?'provider_capacity':`provider_${status}`,
    metadata:{delivery_path:'nexus_email_outbox',token_persisted:false,provider_error_class:clean(errorMessage,160),provider_key_source:keySource,capacity_deferred:Boolean(capacity)}
  });
}

export async function markAuthRecoveryAccepted(row:any,baseUrl:string,headers:Record<string,string>,providerMessageId:string|null,provider='unknown',keySource='unknown'){
  if(!isAuthRecovery(row))return;
  await patchEvent(baseUrl,headers,row.related_id,{
    status:'provider_accepted',
    provider,
    provider_message_id:providerMessageId,
    provider_accepted_at:new Date().toISOString(),
    error_code:null,
    metadata:{delivery_path:'nexus_email_outbox',token_persisted:false,provider_key_source:keySource}
  });
}
