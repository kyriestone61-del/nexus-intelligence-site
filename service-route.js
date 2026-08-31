(async()=>{
  const root=document.getElementById('serviceDetailRoot');
  const slug=document.body?.dataset?.serviceSlug||'';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!root)return;
  try{
    if(!slug)throw new Error('No service was selected.');
    const response=await fetch('/services.html',{cache:'no-store'});
    if(!response.ok)throw new Error('Service catalog could not be loaded.');
    const source=await response.text();
    const doc=new DOMParser().parseFromString(source,'text/html');
    const template=doc.getElementById('tpl-'+slug);
    if(!template)throw new Error('That Nexus service could not be found.');
    root.innerHTML=template.innerHTML;
    const heading=root.querySelector('h1');
    if(heading)document.title=heading.textContent+' | Nexus Intelligence';
    window.scrollTo({top:0,left:0,behavior:'auto'});
    window.dispatchEvent(new CustomEvent('nexus-service-detail-ready',{detail:{slug}}));
  }catch(error){
    root.innerHTML=`<div class="wrap hero"><div class="eyebrow">Service unavailable</div><h1>We could not open that service.</h1><p>${escape(error?.message||'Please return to Solutions and choose the service again.')}</p><div class="actions"><a class="btn primary" href="/services">Back to Solutions →</a></div></div>`;
  }
})();
