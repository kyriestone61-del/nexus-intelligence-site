(function(){
  if(location.pathname!=='/quick-scan'||window.__nexusSnapshotLifecyclePatch)return;window.__nexusSnapshotLifecyclePatch=true;
  function installConsent(){
    if(document.getElementById('marketingOptIn'))return;
    const sms=document.getElementById('smsOptIn');if(!sms)return;
    const row=sms.closest('.consent-row');if(!row)return;
    const label=document.createElement('label');label.className='consent-row';label.innerHTML='<input id="marketingOptIn" type="checkbox"><span>Yes, email me useful Nexus follow-up related to this Snapshot. This is optional, and I can unsubscribe at any time.</span>';
    row.insertAdjacentElement('afterend',label);
  }
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    if(url.includes('/api/opportunity-snapshot')&&init?.body){
      try{
        const payload=JSON.parse(init.body);
        payload.marketing_opt_in=document.getElementById('marketingOptIn')?.checked===true;
        payload.first_touch=window.NexusAttribution?.first?.()||{};
        payload.last_touch=window.NexusAttribution?.last?.()||{};
        init={...init,body:JSON.stringify(payload)};
      }catch{}
    }
    const response=await nativeFetch(input,init);
    if(url.includes('/api/opportunity-snapshot')&&response.ok){
      try{window.nexusTrack?.('snapshot_lead_created',{marketing_opt_in:document.getElementById('marketingOptIn')?.checked===true})}catch{}
    }
    return response;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installConsent);else installConsent();
  const observer=new MutationObserver(installConsent);observer.observe(document.documentElement,{childList:true,subtree:true});
})();
