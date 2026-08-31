const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const clean=(v,n)=>String(v||'').trim().slice(0,n);
const jsonHeaders={'content-type':'application/json','cache-control':'no-store'};

export async function onRequestPost(context){
  const serviceKey=context.env?.SUPABASE_SERVICE_ROLE_KEY;
  if(!serviceKey) return new Response(JSON.stringify({ok:false,error:'Fit-call requests are temporarily unavailable.'}),{status:503,headers:jsonHeaders});
  try{
    const data=await context.request.json();
    if(data.website_field) return new Response(JSON.stringify({ok:true}),{status:200,headers:jsonHeaders});
    const full_name=clean(data.full_name,120);
    const email=clean(data.email,254).toLowerCase();
    const company_name=clean(data.company_name,160)||null;
    const website=clean(data.website,300)||null;
    const problem_summary=clean(data.problem_summary,2000);
    const timezone=clean(data.timezone,100)||null;
    const recommended_service=clean(data.recommended_service,160)||null;
    const opportunity_title=clean(data.opportunity_title,300)||null;
    let requested_start=null;
    if(data.requested_start){
      const parsed=new Date(data.requested_start);
      if(Number.isNaN(parsed.getTime())) return new Response(JSON.stringify({ok:false,error:'Please choose a valid fit-call time.'}),{status:400,headers:jsonHeaders});
      const now=Date.now(),max=now+1000*60*60*24*90;
      if(parsed.getTime()<now-1000*60*5||parsed.getTime()>max) return new Response(JSON.stringify({ok:false,error:'Please choose a fit-call time within the next 90 days.'}),{status:400,headers:jsonHeaders});
      requested_start=parsed.toISOString();
    }
    let journey_snapshot=null;
    if(data.journey_snapshot&&typeof data.journey_snapshot==='object'&&!Array.isArray(data.journey_snapshot)){
      const raw=JSON.stringify(data.journey_snapshot);
      if(raw.length<=12000) journey_snapshot=data.journey_snapshot;
    }
    if(!full_name||!email.includes('@')||problem_summary.length<5) return new Response(JSON.stringify({ok:false,error:'Please complete your name, email, and business problem.'}),{status:400,headers:jsonHeaders});

    const row={full_name,email,company_name,website,problem_summary,requested_start,timezone,recommended_service,opportunity_title,journey_snapshot,booking_status:'requested'};
    const r=await fetch(`${SUPABASE_URL}/rest/v1/nexus_discovery_requests`,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':serviceKey,'authorization':`Bearer ${serviceKey}`,'Prefer':'return=representation','cache-control':'no-store'},
      body:JSON.stringify(row)
    });
    if(!r.ok){
      const detail=await r.text();console.error('Discovery request insert failed',r.status,detail.slice(0,1000));
      return new Response(JSON.stringify({ok:false,error:'Your fit-call request could not be submitted. Please try again.'}),{status:500,headers:jsonHeaders});
    }
    const created=(await r.json())?.[0]||null;
    return new Response(JSON.stringify({ok:true,id:created?.id||null,status:'requested',requested_start}),{status:200,headers:jsonHeaders});
  }catch(err){
    console.error(err);
    return new Response(JSON.stringify({ok:false,error:'Your fit-call request could not be submitted. Please try again.'}),{status:500,headers:jsonHeaders});
  }
}
