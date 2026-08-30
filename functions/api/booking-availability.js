import {bookingConfigured,freeBusy} from '../_lib/google-calendar.js';
const headers={'content-type':'application/json','cache-control':'no-store'};
function partsAt(date,tz){const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]))}
function zonedToUtc(y,m,d,h,min,tz){let guess=Date.UTC(y,m-1,d,h,min);for(let i=0;i<2;i++){const p=partsAt(new Date(guess),tz);const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);guess-=represented-Date.UTC(y,m-1,d,h,min)}return new Date(guess)}
function dateKey(date,tz){const p=partsAt(date,tz);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`}
export async function onRequestGet(context){
  const env=context.env;if(!bookingConfigured(env))return new Response(JSON.stringify({ok:false,configured:false,error:'Live calendar booking is not configured yet.'}),{status:503,headers});
  try{
    const tz=env.NEXUS_BOOKING_TIMEZONE||'America/New_York',duration=Math.max(15,Math.min(60,Number(env.NEXUS_BOOKING_DURATION_MINUTES||20))),now=new Date(),leadMs=Math.max(1,Number(env.NEXUS_BOOKING_MIN_LEAD_HOURS||12))*3600000;
    const start=new Date(now.getTime()+leadMs),end=new Date(now.getTime()+16*86400000);const busy=await freeBusy(env,start.toISOString(),end.toISOString());
    const busyRanges=busy.map(x=>[Date.parse(x.start),Date.parse(x.end)]);const slots=[];const wallTimes=(env.NEXUS_BOOKING_WALL_TIMES||'10:00,11:30,14:00,15:30').split(',').map(x=>x.trim()).filter(Boolean);
    for(let add=0;add<16&&slots.length<40;add++){
      const probe=new Date(now.getTime()+add*86400000),p=partsAt(probe,tz),dow=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();if(dow===0||dow===6)continue;
      for(const time of wallTimes){const [hh,mm]=time.split(':').map(Number),s=zonedToUtc(p.year,p.month,p.day,hh,mm,tz),e=new Date(s.getTime()+duration*60000);if(s.getTime()<start.getTime())continue;if(busyRanges.some(([a,b])=>s.getTime()<b&&e.getTime()>a))continue;slots.push({start:s.toISOString(),end:e.toISOString(),business_timezone:tz,date_key:dateKey(s,tz)})}
    }
    return new Response(JSON.stringify({ok:true,configured:true,business_timezone:tz,duration_minutes:duration,slots}),{headers});
  }catch(error){console.error('booking availability',error);return new Response(JSON.stringify({ok:false,configured:true,error:'Calendar availability is temporarily unavailable.'}),{status:502,headers})}
}
