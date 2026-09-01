// Nexus vNext runtime router.
// PDF export runs on the existing Cloudflare Pages runtime. SMS delivery is queued in
// Supabase and processed by the existing scheduled Nexus notification worker, avoiding
// an additional Edge Function slot or browser-held worker credential.
if(!window.__nexusVnextRuntimeRouter){
  window.__nexusVnextRuntimeRouter=true;
  const nativeFetch=window.fetch.bind(window);
  const SUPABASE_FUNCTIONS='https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/';
  window.fetch=(input,init)=>{
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
    if(raw===`${SUPABASE_FUNCTIONS}nexus-diagnosis-report-pdf`){
      return nativeFetch('/api/diagnosis-report-pdf',init);
    }
    if(raw===`${SUPABASE_FUNCTIONS}nexus-sms-worker`){
      return Promise.resolve(new Response(JSON.stringify({ok:true,status:'scheduled'}),{
        status:202,
        headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
      }));
    }
    return nativeFetch(input,init);
  };
}
