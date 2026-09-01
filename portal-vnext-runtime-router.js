// Nexus vNext runtime router.
// Keeps PDF/SMS delivery on the existing Cloudflare Pages runtime so the Supabase
// free-plan Edge Function slot limit does not block the product release.
if(!window.__nexusVnextRuntimeRouter){
  window.__nexusVnextRuntimeRouter=true;
  const nativeFetch=window.fetch.bind(window);
  const SUPABASE_FUNCTIONS='https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/';
  window.fetch=(input,init)=>{
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
    let target=null;
    if(raw===`${SUPABASE_FUNCTIONS}nexus-diagnosis-report-pdf`)target='/api/diagnosis-report-pdf';
    else if(raw===`${SUPABASE_FUNCTIONS}nexus-sms-worker`)target='/api/sms-dispatch';
    if(!target)return nativeFetch(input,init);
    return nativeFetch(target,init);
  };
}
