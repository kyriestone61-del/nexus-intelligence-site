import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, DELETE, POST, OPTIONS","Cache-Control":"no-store"};
const json=(body:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(body,null,2),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff",...extra}});
function client(key:string,auth?:string){return createClient(Deno.env.get("SUPABASE_URL")!,key,{global:auth?{headers:{Authorization:auth}}:undefined,auth:{persistSession:false}});}
async function hashSubject(userId:string){const salt=Deno.env.get("HLO_PRIVACY_RECEIPT_SALT")||"hlo-privacy-v1";const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${salt}:${userId}`));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function rows(sb:any,table:string,userId:string,order?:string,limit=10000){let q=sb.from(table).select("*").eq("user_id",userId);if(order)q=q.order(order,{ascending:true});const {data,error}=await q.limit(limit);if(error)throw new Error(`${table}_export_failed`);return data||[];}

async function exportData(admin:any,user:any,subjectHash:string){
  const [profile,settings,enrollment,progress,lessonProgress,threads,messages,consents,analyticsConsents,events,entitlement]=await Promise.all([
    rows(admin,"hlo_profiles",user.id),rows(admin,"hlo_user_settings",user.id),rows(admin,"hlo_attention_enrollments",user.id),
    rows(admin,"hlo_attention_day_progress",user.id,"day_number"),rows(admin,"hlo_lesson_progress",user.id),rows(admin,"hlo_tutor_threads",user.id,"created_at"),
    rows(admin,"hlo_tutor_messages",user.id,"created_at"),rows(admin,"hlo_legal_consents",user.id,"accepted_at"),rows(admin,"hlo_analytics_consents",user.id,"created_at"),
    rows(admin,"hlo_analytics_events",user.id,"occurred_at"),rows(admin,"hlo_billing_entitlements",user.id)
  ]);
  await admin.from("hlo_privacy_request_receipts").insert({request_type:"export",subject_hash:subjectHash,status:"completed",policy_version:"privacy-v1"});
  return {
    export_version:"human-os-user-export-v1",generated_at:new Date().toISOString(),
    account:{id:user.id,email:user.email,created_at:user.created_at,updated_at:user.updated_at,user_metadata:user.user_metadata},
    profile,settings,attention_focus:{enrollment,day_progress:progress},learning:{lesson_progress:lessonProgress},
    ai_tutor:{threads,messages},consents:{legal:consents,analytics:analyticsConsents},account_history:{analytics_events:events},
    billing:{entitlement:entitlement.map((x:any)=>({...x,stripe_customer_id:x.stripe_customer_id?"[redacted]":null,stripe_subscription_id:x.stripe_subscription_id?"[redacted]":null}))}
  };
}

async function removeStripeCustomer(customerId:string|null){
  if(!customerId)return;
  const key=Deno.env.get("STRIPE_RESTRICTED_KEY")||Deno.env.get("STRIPE_SECRET_KEY");
  if(!key)throw new Error("billing_profile_deletion_not_configured");
  const stripe=new Stripe(key,{maxNetworkRetries:2});
  await stripe.customers.del(customerId);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(!["GET","DELETE","POST"].includes(req.method))return json({error:"method_not_allowed"},405);
  const auth=req.headers.get("Authorization")||"",token=auth.replace(/^Bearer\s+/i,"");
  const userClient=client(Deno.env.get("SUPABASE_ANON_KEY")!,auth),admin=client(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return json({error:"unauthorized"},401);
  const subjectHash=await hashSubject(user.id);
  try{
    if(req.method==="GET"){
      const data=await exportData(admin,user,subjectHash);
      return json(data,200,{"Content-Disposition":`attachment; filename="human-os-data-${new Date().toISOString().slice(0,10)}.json"`});
    }
    const body=await req.json().catch(()=>({}));
    if(body?.confirm!==true||body?.confirmation_phrase!=="DELETE MY ACCOUNT")return json({error:"explicit_confirmation_required"},400);
    const {data:entitlement}=await admin.from("hlo_billing_entitlements").select("stripe_customer_id").eq("user_id",user.id).maybeSingle();
    await removeStripeCustomer(entitlement?.stripe_customer_id||null);

    // Sever analytics identity while retaining only aggregate, non-linkable evidence.
    await admin.from("hlo_analytics_identity_links").delete().eq("user_id",user.id);
    await admin.from("hlo_analytics_subjects").update({user_id:null,anonymous_id_hash:`erased:${crypto.randomUUID()}`,do_not_track:true,deletion_requested_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",user.id);
    await admin.from("hlo_privacy_request_receipts").insert({request_type:"deletion",subject_hash:subjectHash,status:"completed",policy_version:"privacy-v1"});

    // Revoke refresh tokens before deleting the Auth record. Existing short-lived JWTs expire naturally,
    // and Auth getUser rejects the account after deletion.
    if(token)await admin.auth.admin.signOut(token,"global").catch(()=>undefined);
    const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
    if(deleteError)throw deleteError;
    return json({deleted:true,receipt:subjectHash.slice(0,16)});
  }catch(error){
    console.error("hlo-privacy",error instanceof Error?error.message:"privacy_request_failed");
    await admin.from("hlo_privacy_request_receipts").insert({request_type:req.method==="GET"?"export":"deletion",subject_hash:subjectHash,status:"failed",policy_version:"privacy-v1"}).catch(()=>undefined);
    return json({error:error instanceof Error?error.message:"privacy_request_failed"},500);
  }
});

