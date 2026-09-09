const endpoint='https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/nexus-diagnosis-execute?handler=basic_report';
const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
export async function onRequest({request}){
 if(request.method!=='POST')return new Response('{}',{status:405,headers});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return new Response('{}',{status:403,headers});
 const raw=await request.text();if(raw.length>2000)return new Response('{}',{status:413,headers});
 try{
  const upstream=await fetch(endpoint,{method:'POST',redirect:'manual',headers:{'content-type':'application/json',apikey:'sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B'},body:raw,signal:AbortSignal.timeout(45000)});
  if(upstream.status>=300&&upstream.status<400)return new Response('{}',{status:502,headers});
  return new Response(await upstream.text(),{status:upstream.status,headers});
 }catch{return new Response(JSON.stringify({error:'RETRY',message:'Your decision may have been saved. Refresh the same report before retrying.'}),{status:503,headers})}
}
