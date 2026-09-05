import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const safe=(v:any,n=12000)=>String(v??"").slice(0,n);
const arr=(v:any)=>Array.isArray(v)?v:[];

async function userFrom(req:Request){
  const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!bearer)throw new Error("AUTH_REQUIRED");
  const c=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await c.auth.getUser(bearer);
  if(error||!user)throw new Error("AUTH_REQUIRED");
  const {data:admin}=await db.from("nexus_platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
  return {user,isAdmin:!!admin};
}
async function isMember(userId:string,companyId:string){
  const {data}=await db.from("nexus_company_members").select("company_id").eq("company_id",companyId).eq("user_id",userId).eq("active",true).maybeSingle();
  return !!data;
}
function clean(v:any){return safe(v,5000).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim()}
function bulletText(v:any,primary="title",secondary="description"){
  return arr(v).map((x:any)=>{
    if(typeof x==="string")return `• ${x}`;
    const a=clean(x?.[primary]??x?.statement??x?.question??x?.risk??x?.metric??x?.name);
    const b=clean(x?.[secondary]??x?.impact??x?.reason??x?.gap??x?.current_state??x?.recommendation);
    return `• ${a}${b?` — ${b}`:""}`;
  }).join("\n");
}
function reportSections(r:any,client=false){
  const pilot=r?.smallest_safe_pilot||{};
  const sections:any[]=[
    ["Executive Summary",clean(r?.executive_summary)],
    ["Facts",bulletText(r?.facts,"statement","description")],
    ["Client Statements",bulletText(r?.client_statements,"statement","description")],
  ];
  if(!client)sections.push(["Inferences",arr(r?.inferences).map((x:any)=>`• ${clean(x.statement)}${x.basis?` — Basis: ${clean(x.basis)}`:""}${x.confidence?` (${clean(x.confidence)} confidence)`:""}`).join("\n")]);
  if(!client)sections.push(["Unknowns",bulletText(r?.unknowns,"question","why_it_matters")]);
  sections.push(["Current-State Process Map",arr(r?.process_map).map((x:any)=>`• Step ${clean(x.step||"—")}: ${clean(x.name||"Process step")} — ${clean(x.current_state)}${x.owner?` | Owner: ${clean(x.owner)}`:""}`).join("\n")]);
  sections.push(["Bottlenecks",bulletText(r?.bottlenecks,"title","description")]);
  if(!client)sections.push(["Baseline Gaps",bulletText(r?.baseline_gaps,"metric","gap")]);
  if(!client)sections.push(["Baseline Measurements",arr(r?.baseline_measurements).map((x:any)=>`• ${clean(x.name)}: ${x.baseline_value??"unknown"} ${clean(x.unit||"")} — ${clean(x.measurement_method||x.notes||"")}`).join("\n")]);
  sections.push(["Ranked AI / Automation Opportunities",arr(r?.opportunity_backlog).map((x:any)=>`• #${clean(x.rank||"—")} ${clean(x.title)} — ${clean(x.recommendation||x.problem)} | Value ${x.value_score??"—"}, Effort ${x.effort_score??"—"}, Readiness ${x.readiness_score??"—"}`).join("\n")]);
  if(!client)sections.push(["Risks and Controls",arr(r?.risks).map((x:any)=>`• ${clean(x.risk)} — Control: ${clean(x.control)}${x.severity?` (${clean(x.severity)})`:""}`).join("\n")]);
  sections.push(["Follow-Up Questions",bulletText(r?.follow_up_questions,"question","reason")]);
  sections.push(["Smallest Safe Pilot",`${clean(pilot.title)}\n${clean(pilot.summary)}\n\nIn scope:\n${arr(pilot.scope_in).map((x:any)=>`• ${clean(x)}`).join("\n")}\n\nOut of scope:\n${arr(pilot.scope_out).map((x:any)=>`• ${clean(x)}`).join("\n")}\n\nAcceptance criteria:\n${arr(pilot.acceptance_criteria).map((x:any)=>`• ${clean(x)}`).join("\n")}\n\nHuman controls:\n${arr(pilot.human_controls).map((x:any)=>`• ${clean(x)}`).join("\n")}`]);
  if(!client){
    sections.push(["Relystra Actions",bulletText(r?.nexus_actions)]);
    sections.push(["Client Action Items",bulletText(r?.client_action_items)]);
    sections.push(["Document Requests",arr(r?.document_requests).map((x:any)=>`• ${clean(x.title)} — ${clean(x.purpose)}`).join("\n")]);
    sections.push(["Decision Items",bulletText(r?.decision_items)]);
  }else sections.push(["Your Action Items",bulletText(r?.client_action_items)]);
  return sections.filter(([,body])=>clean(body));
}
function wrap(text:string,max=92){
  const lines:string[]=[];
  for(const raw of String(text||"").split("\n")){
    if(!raw){lines.push("");continue}
    const words=raw.split(/\s+/);let line="";
    for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max&&line){lines.push(line);line=word}else line=next}
    if(line)lines.push(line);
  }
  return lines;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response("Method not allowed",{status:405,headers:cors});
  try{
    const {user,isAdmin}=await userFrom(req);
    const body=await req.json().catch(()=>({}));
    let report:any=null,companyName="Client",client=false,filename="Relystra-Diagnosis-Report.pdf";

    if(body?.run_id){
      if(!isAdmin)throw new Error("ADMIN_REQUIRED");
      const {data:run,error}=await db.from("nexus_diagnosis_runs").select("id,company_id,status,analysis_result").eq("id",body.run_id).single();
      if(error||!run?.analysis_result)throw new Error("REPORT_NOT_FOUND");
      const {data:company}=await db.from("nexus_companies").select("name").eq("id",run.company_id).single();
      report=run.analysis_result;companyName=company?.name||"Client";client=false;filename=`${companyName.replace(/[^a-z0-9_-]+/gi,"-")}-Relystra-Diagnosis.pdf`;
    }else if(body?.release_id){
      const {data:release,error}=await db.from("nexus_diagnosis_report_releases").select("id,company_id,status,client_report").eq("id",body.release_id).single();
      if(error||!release||release.status!=="released")throw new Error("REPORT_NOT_FOUND");
      if(!isAdmin&&!await isMember(user.id,release.company_id))throw new Error("COMPANY_ACCESS_REQUIRED");
      const {data:company}=await db.from("nexus_companies").select("name").eq("id",release.company_id).single();
      report=release.client_report;companyName=company?.name||"Client";client=true;filename=`${companyName.replace(/[^a-z0-9_-]+/gi,"-")}-Relystra-Client-Report.pdf`;
    }else throw new Error("REPORT_ID_REQUIRED");

    const pdf=await PDFDocument.create();
    const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const width=612,height=792,margin=54;let page=pdf.addPage([width,height]),y=height-margin;
    const newPage=()=>{page=pdf.addPage([width,height]);y=height-margin};
    const ensure=(need:number)=>{if(y<margin+need)newPage()};
    const draw=(text:string,size=10,isBold=false,indent=0)=>{
      for(const line of wrap(text,Math.max(45,92-Math.round(indent/4)))){
        ensure(size+7);page.drawText(line,{x:margin+indent,y,size,font:isBold?bold:regular,color:rgb(.08,.08,.11)});y-=size+5;
      }
    };
    page.drawText("RELYSTRA",{x:margin,y,size:11,font:bold,color:rgb(.20,.12,.45)});y-=28;
    draw(client?"Client Diagnosis Report":"Client Diagnosis — Internal Full Report",20,true);y-=2;
    draw(companyName,12,true);y-=6;
    draw(client?"Prepared for client review. Use the secure Relystra workspace to submit questions.":"Internal Relystra report. Human review remains required before any client release or implementation decision.",9,false);y-=14;

    for(const [heading,bodyText] of reportSections(report,client)){
      ensure(55);draw(heading,13,true);y-=3;draw(bodyText,9,false);y-=13;
    }
    const bytes=await pdf.save();
    return new Response(bytes,{headers:{...cors,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,`Cache-Control`:"no-store"}});
  }catch(e){
    const msg=safe((e as Error)?.message||e,500);const status=msg.includes("AUTH_REQUIRED")?401:msg.includes("ADMIN_REQUIRED")||msg.includes("COMPANY_ACCESS_REQUIRED")?403:404;
    return new Response(JSON.stringify({ok:false,error:msg}),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
  }
});
