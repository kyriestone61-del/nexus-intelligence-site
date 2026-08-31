import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json={...cors,"Content-Type":"application/json","Cache-Control":"no-store"};
const clean=(v:any,n=1500)=>String(v??"").slice(0,n);

async function authorize(req:Request){
  const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!bearer)throw new Error("AUTH_REQUIRED");
  const c=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await c.auth.getUser(bearer);if(error||!user)throw new Error("AUTH_REQUIRED");
  const {data}=await db.from("nexus_platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!data)throw new Error("ADMIN_REQUIRED");
}
async function health(status:"healthy"|"degraded"|"failed",summary:string,details:any={}){try{await db.from("nexus_system_health").insert({check_name:"sms_delivery",status,summary,details,checked_at:new Date().toISOString()})}catch{}}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:json});
  try{
    await authorize(req);
    const sid=Deno.env.get("TWILIO_ACCOUNT_SID")||"",token=Deno.env.get("TWILIO_AUTH_TOKEN")||"",from=Deno.env.get("TWILIO_FROM_NUMBER")||"";
    if(!sid||!token||!from){
      await health("degraded","SMS notifications are not configured; in-app and email delivery remain available.",{missing:[!sid&&"TWILIO_ACCOUNT_SID",!token&&"TWILIO_AUTH_TOKEN",!from&&"TWILIO_FROM_NUMBER"].filter(Boolean)});
      return new Response(JSON.stringify({ok:true,status:"unavailable",sent:0,message:"SMS provider not configured"}),{headers:json});
    }

    const {data:rows,error}=await db.from("nexus_sms_outbox").select("*").in("status",["queued","unavailable"]).lte("available_at",new Date().toISOString()).order("created_at").limit(25);
    if(error)throw error;
    let sent=0,retried=0,failed=0;
    for(const row of rows||[]){
      try{
        await db.from("nexus_sms_outbox").update({status:"sending",attempts:Number(row.attempts||0)+1,last_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id);
        const action=row.action_url?`${Deno.env.get("NEXUS_PUBLIC_ORIGIN")||"https://nexusintelligence.live"}${row.action_url}`:"";
        const body=`${clean(row.body_text,1200)}${action?` ${action}`:""}`.slice(0,1500);
        const params=new URLSearchParams({To:row.recipient_phone,From:from,Body:body});
        const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{
          method:"POST",headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,"Content-Type":"application/x-www-form-urlencoded"},body:params
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok){
          const permanent=[400,401,403,404,422].includes(response.status)||Number(row.attempts||0)>=4;
          await db.from("nexus_sms_outbox").update({status:permanent?"failed":"queued",available_at:new Date(Date.now()+15*60000).toISOString(),last_error:clean(payload?.message||`Twilio ${response.status}`,1000),provider_status:String(response.status),updated_at:new Date().toISOString()}).eq("id",row.id);
          permanent?failed++:retried++;continue;
        }
        await db.from("nexus_sms_outbox").update({status:"sent",sent_at:new Date().toISOString(),provider_message_id:payload?.sid||null,provider_status:payload?.status||"accepted",last_error:null,updated_at:new Date().toISOString()}).eq("id",row.id);sent++;
      }catch(e){
        await db.from("nexus_sms_outbox").update({status:Number(row.attempts||0)>=4?"failed":"queued",available_at:new Date(Date.now()+15*60000).toISOString(),last_error:clean((e as Error)?.message,1000),updated_at:new Date().toISOString()}).eq("id",row.id);retried++;
      }
    }
    await health(failed?"degraded":"healthy",`SMS worker processed ${(rows||[]).length}; sent ${sent}; retrying ${retried}; failed ${failed}.`,{processed:(rows||[]).length,sent,retried,failed});
    return new Response(JSON.stringify({ok:true,processed:(rows||[]).length,sent,retried,failed}),{headers:json});
  }catch(e){
    const msg=clean((e as Error)?.message||e,500);const status=msg.includes("AUTH_REQUIRED")?401:msg.includes("ADMIN_REQUIRED")?403:500;
    await health("failed","SMS worker execution failed.",{error:msg});
    return new Response(JSON.stringify({ok:false,error:msg}),{status,headers:json});
  }
});
