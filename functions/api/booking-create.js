import {bookingConfigured,freeBusy,createCalendarEvent} from '../_lib/google-calendar.js';
const headers={'content-type':'application/json','cache-control':'no-store'};
const S='https://dmdgkjksouhhsuojthav.supabase.co';
const clean=(v,n)=>String(v??'').trim().slice(0,n);
const svc=env=>({'content-type':'application/json','apikey':env.SUPABASE_SERVICE_ROLE_KEY,'authorization':`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`});
const safeObj=(v,max=8000)=>{if(!v||typeof v!=='object'||Array.isArray(v))return {};try{return JSON.stringify(v).length<=max?v:{}}catch{return {}}};
export async function onRequestPost(context){
  const env=context.env;if(!bookingConfigured(env))return new Response(JSON.stringify({ok:false,configured:false,error:'Live calendar booking is not configured yet.'}),{status:503,headers});
  try{
    const body=await context.request.json();if(body.website_field)return new Response(JSON.stringify({ok:true}),{headers});
    const full_name=clean(body.full_name,120),email=clean(body.email,254).toLowerCase(),company_name=clean(body.company_name,160)||null,website=clean(body.website,300)||null,problem_summary=clean(body.problem_summary,2000),start=new Date(body.start),end=new Date(body.end),timezone=clean(body.timezone,80)||'America/New_York';
    if(!full_name||!email.includes('@')||problem_summary.length<5||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return new Response(JSON.stringify({ok:false,error:'Booking details are invalid.'}),{status:400,headers});
    if(start.getTime()<Date.now()+60*60*1000)return new Response(JSON.stringify({ok:false,error:'That time is too close to the present. Choose another slot.'}),{status:409,headers});
    const busy=await freeBusy(env,start.toISOString(),end.toISOString());if(busy.some(x=>start.getTime()<Date.parse(x.end)&&end.getTime()>Date.parse(x.start)))return new Response(JSON.stringify({ok:false,error:'That time was just taken. Choose another available slot.'}),{status:409,headers});
    const row={full_name,email,company_name,website,problem_summary,status:'new',requested_start:start.toISOString(),timezone,recommended_service:clean(body.recommended_service,160)||null,opportunity_title:clean(body.opportunity_title,240)||null,journey_snapshot:safeObj(body.journey_snapshot,12000),booking_status:'reserving',calendar_provider:'google',confirmed_start:start.toISOString(),confirmed_end:end.toISOString(),first_touch:safeObj(body.first_touch,6000),last_touch:safeObj(body.last_touch,6000)};
    const reserve=await fetch(`${S}/rest/v1/nexus_discovery_requests?select=id,cancellation_token,reschedule_token`,{method:'POST',headers:{...svc(env),'Prefer':'return=representation'},body:JSON.stringify(row)});
    if(!reserve.ok){const t=await reserve.text();if(reserve.status===409||/duplicate key/i.test(t))return new Response(JSON.stringify({ok:false,error:'That time was just taken. Choose another available slot.'}),{status:409,headers});throw new Error(`BOOKING_RESERVE_${reserve.status}`)}
    const saved=(await reserve.json())[0];
    try{
      const event=await createCalendarEvent(env,{start:start.toISOString(),end:end.toISOString(),timezone,name:full_name,email,company:company_name,problem:problem_summary,bookingId:saved.id});
      const meetingUrl=event.hangoutLink||event.conferenceData?.entryPoints?.find(x=>x.entryPointType==='video')?.uri||null;
      await fetch(`${S}/rest/v1/nexus_discovery_requests?id=eq.${encodeURIComponent(saved.id)}`,{method:'PATCH',headers:{...svc(env),'Prefer':'return=minimal'},body:JSON.stringify({booking_status:'confirmed',calendar_event_id:event.id,meeting_url:meetingUrl,confirmed_start:event.start?.dateTime||start.toISOString(),confirmed_end:event.end?.dateTime||end.toISOString()})});
      const publicOrigin=env.NEXUS_PUBLIC_ORIGIN||new URL(context.request.url).origin;
      return new Response(JSON.stringify({ok:true,configured:true,id:saved.id,status:'confirmed',start:event.start?.dateTime||start.toISOString(),end:event.end?.dateTime||end.toISOString(),meeting_url:meetingUrl,calendar_event_id:event.id,cancel_url:`${publicOrigin}/booking-manage?mode=cancel&token=${saved.cancellation_token}`,reschedule_url:`${publicOrigin}/booking-manage?mode=reschedule&token=${saved.reschedule_token}`}),{headers});
    }catch(error){
      await fetch(`${S}/rest/v1/nexus_discovery_requests?id=eq.${encodeURIComponent(saved.id)}`,{method:'PATCH',headers:{...svc(env),'Prefer':'return=minimal'},body:JSON.stringify({booking_status:'failed',confirmed_start:null,confirmed_end:null})}).catch(()=>{});throw error;
    }
  }catch(error){console.error('booking create',error);return new Response(JSON.stringify({ok:false,error:'The booking could not be confirmed. No confirmed calendar slot was created.'}),{status:502,headers})}
}
