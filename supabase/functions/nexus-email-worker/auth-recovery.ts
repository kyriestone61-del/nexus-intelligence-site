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

export async function markAuthRecoveryProviderFailure(row:any,baseUrl:string,headers:Record<string,string>,status:number,errorMessage:string){
  if(!isAuthRecovery(row))return;
  await patchEvent(baseUrl,headers,row.related_id,{
    status:'provider_failed',
    provider:'resend',
    error_code:`provider_${status}`,
    metadata:{delivery_path:'nexus_email_outbox',token_persisted:false,provider_error_class:clean(errorMessage,160)}
  });
}

export async function markAuthRecoveryAccepted(row:any,baseUrl:string,headers:Record<string,string>,providerMessageId:string|null){
  if(!isAuthRecovery(row))return;
  await patchEvent(baseUrl,headers,row.related_id,{
    status:'provider_accepted',
    provider:'resend',
    provider_message_id:providerMessageId,
    provider_accepted_at:new Date().toISOString(),
    error_code:null,
    metadata:{delivery_path:'nexus_email_outbox',token_persisted:false}
  });
}
