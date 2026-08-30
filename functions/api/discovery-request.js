const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const SUPABASE_KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';

export async function onRequestPost(context){
  try{
    const data=await context.request.json();
    if(data.website_field) return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
    const full_name=String(data.full_name||'').trim().slice(0,120);
    const email=String(data.email||'').trim().slice(0,254);
    const company_name=String(data.company_name||'').trim().slice(0,160)||null;
    const website=String(data.website||'').trim().slice(0,300)||null;
    const problem_summary=String(data.problem_summary||'').trim().slice(0,2000);
    if(!full_name||!email.includes('@')||problem_summary.length<5){
      return new Response(JSON.stringify({ok:false,error:'Please complete your name, email, and business problem.'}),{status:400,headers:{'content-type':'application/json'}});
    }
    const r=await fetch(`${SUPABASE_URL}/rest/v1/nexus_discovery_requests`,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Prefer':'return=minimal'},
      body:JSON.stringify({full_name,email,company_name,website,problem_summary})
    });
    if(!r.ok){
      const detail=await r.text();
      console.error('Discovery request insert failed',detail);
      return new Response(JSON.stringify({ok:false,error:'Your request could not be submitted. Please try again.'}),{status:500,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
  }catch(err){
    console.error(err);
    return new Response(JSON.stringify({ok:false,error:'Your request could not be submitted. Please try again.'}),{status:500,headers:{'content-type':'application/json'}});
  }
}
