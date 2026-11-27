import {createClient} from 'jsr:@supabase/supabase-js@2';
import {handleCheckout} from './relystra-checkout-handler.ts';
const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
export async function handleBasicReport(req:Request){
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 try{
  const raw=await req.text();if(raw.length>2000)return reply({error:'INVALID_REQUEST'},400);
  const body=JSON.parse(raw);
  if(typeof body.token!=='string'||!/^[0-9a-f]{64}$/.test(body.token)||!['view','accept','decline','discuss','checkout','cancel'].includes(body.operation))return reply({error:'REPORT_UNAVAILABLE'},404);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const checkout=['checkout','cancel'].includes(body.operation);
  const {data,error}=await db.rpc('relystra_basic_report_access',{p_token:body.token,p_operation:checkout?'checkout':body.operation});
  if(error||!data)return reply({error:'REPORT_UNAVAILABLE',message:'This report link is no longer available. Contact the Nepsis person who shared it to request a new link. Please don’t forward the old link.'},404);
  if(checkout)return handleCheckout(new Request(req.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan_id:data.plan_id,report_token:body.token,operation:body.operation})}));
  let checkout_available:boolean|null=null;
  try{
    const availability=await db.from('nexus_delivery_settings').select('checkout_enabled,stripe_account_id').eq('singleton',true).maybeSingle();
    if(!availability.error&&availability.data)checkout_available=availability.data.checkout_enabled===true&&typeof availability.data.stripe_account_id==='string'&&availability.data.stripe_account_id.length>0;
  }catch{/* Availability lookup failure is an explicit fail-closed unknown state. */}
  const {actor_id,company_id,...report}=data;
  return reply({ok:true,report:{...report,checkout_available}});
 }catch{return reply({error:'REPORT_UNAVAILABLE'},404)}
}
