const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const SUPABASE_KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';
const jsonHeaders={'content-type':'application/json','cache-control':'no-store'};
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const allowed={
  business_type:new Set(['product','field','appointment','professional','other']),
  team_size:new Set(['1-5','6-10','11-25','26-50','51-100','101+']),
  priority_goal:new Set(['time','revenue','response','visibility','knowledge','systems']),
  opportunity:new Set(['admin','leads','reporting','customer','scheduling','knowledge','systems']),
  frequency:new Set(['monthly','weekly','daily','high']),
  burden:new Set(['unknown','under5','5-15','15-40','40plus']),
  systems:new Set(['email','crm','sheets','docs','multiple','paper']),
  authority:new Set(['unclear','manager','owner']),
  timeline:new Set(['exploring','quarter','month'])
};

export async function onRequestPost(context){
  try{
    const body=await context.request.json();
    if(body.website_field) return new Response(JSON.stringify({ok:true}),{status:200,headers:jsonHeaders});

    const first_name=clean(body.first_name,80);
    const email=clean(body.email,254).toLowerCase();
    const company_name=clean(body.company_name,160)||null;
    const phone=clean(body.phone,40)||null;
    const sms_opt_in=body.sms_opt_in===true;
    const business_type=clean(body.business_type,30);
    const team_size=clean(body.team_size,20);
    const priority_goal=clean(body.priority_goal,30);
    const frequency=clean(body.frequency,20);
    const burden=clean(body.burden,20);
    const systems=clean(body.systems,20);
    const authority=clean(body.authority,20);
    const timeline=clean(body.timeline,20);
    const primary_opportunity=clean(body.primary_opportunity,30);
    const opportunity_score=Number(body.opportunity_score);
    const opportunity_areas=Array.isArray(body.opportunity_areas)?body.opportunity_areas.map(x=>clean(x,30)).filter(Boolean):[];
    const top_opportunities=Array.isArray(body.top_opportunities)?body.top_opportunities.slice(0,3).map((x,i)=>({
      key:clean(x?.key,30),label:clean(x?.label,120),rank:i+1
    })):[];

    if(!first_name||!email.includes('@')) return new Response(JSON.stringify({ok:false,error:'Please enter your first name and a valid email.'}),{status:400,headers:jsonHeaders});
    if(sms_opt_in&&!phone) return new Response(JSON.stringify({ok:false,error:'A mobile number is required for text consent.'}),{status:400,headers:jsonHeaders});
    if(!allowed.business_type.has(business_type)||!allowed.team_size.has(team_size)||!allowed.priority_goal.has(priority_goal)||!allowed.frequency.has(frequency)||!allowed.burden.has(burden)||!allowed.systems.has(systems)||!allowed.authority.has(authority)||!allowed.timeline.has(timeline)||!allowed.opportunity.has(primary_opportunity)){
      return new Response(JSON.stringify({ok:false,error:'One or more Snapshot answers are invalid. Please refresh and try again.'}),{status:400,headers:jsonHeaders});
    }
    if(opportunity_areas.length<1||opportunity_areas.length>3||opportunity_areas.some(x=>!allowed.opportunity.has(x))||top_opportunities.length<1||top_opportunities.some(x=>!allowed.opportunity.has(x.key))||!Number.isInteger(opportunity_score)||opportunity_score<0||opportunity_score>100){
      return new Response(JSON.stringify({ok:false,error:'The Snapshot result could not be validated. Please refresh and try again.'}),{status:400,headers:jsonHeaders});
    }

    let snapshot_data={};
    if(body.snapshot_data&&typeof body.snapshot_data==='object'&&!Array.isArray(body.snapshot_data)){
      const raw=JSON.stringify(body.snapshot_data);
      if(raw.length<=4000) snapshot_data=body.snapshot_data;
    }

    const payload={first_name,email,phone,sms_opt_in,company_name,business_type,team_size,priority_goal,opportunity_areas,frequency,burden,systems,authority,timeline,opportunity_score,primary_opportunity,top_opportunities,snapshot_data};
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_nexus_opportunity_snapshot`,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':SUPABASE_KEY,'cache-control':'no-store'},
      body:JSON.stringify({payload})
    });
    if(!response.ok){
      const detail=await response.text();
      console.error('Opportunity Snapshot submission failed',response.status,detail.slice(0,1000));
      return new Response(JSON.stringify({ok:false,error:'Your Snapshot could not be saved. Please try again.'}),{status:500,headers:jsonHeaders});
    }
    const id=await response.json();
    return new Response(JSON.stringify({ok:true,id:typeof id==='string'?id:null}),{status:200,headers:jsonHeaders});
  }catch(error){
    console.error('Opportunity Snapshot error',error);
    return new Response(JSON.stringify({ok:false,error:'Your Snapshot could not be saved. Please try again.'}),{status:500,headers:jsonHeaders});
  }
}
