const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';

export async function onRequestGet(){
  let status={configured:false,provider:null,in_app:true,queue:true,delivery_enabled:false,worker_status:'unknown'};
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/relystra_email_delivery_status`,{
      method:'POST',headers:{'content-type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY,'cache-control':'no-store'},body:'{}'
    });
    if(response.ok)status={...status,...await response.json()};
  }catch(error){console.error('Relystra email status check failed',String(error?.message||error).slice(0,160))}
  return new Response(JSON.stringify(status),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
