export async function onRequestGet({env}){
  const configured=Boolean(env?.RESEND_API_KEY&&env?.NEXUS_EMAIL_FROM&&env?.SUPABASE_SERVICE_ROLE_KEY&&env?.EMAIL_DISPATCH_SECRET);
  return new Response(JSON.stringify({configured,provider:configured?'resend':null,in_app:true,queue:true}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
}
