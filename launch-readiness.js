(function(){
  const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
  const SUPABASE_KEY='sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B';
  const FIRST='nexus_first_touch_v1',LAST='nexus_last_touch_v1',ANON='nexus_anon_id_v1',SESSION='nexus_session_id_v1',CONSENT='nexus_analytics_consent_v1';
  const parse=(v,f={})=>{try{return JSON.parse(v)||f}catch{return f}};
  const uuid=()=>crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});
  const getId=k=>{let v=localStorage.getItem(k);if(!v){v=uuid();localStorage.setItem(k,v)}return v};
  const params=new URLSearchParams(location.search);
  const touch={utm_source:params.get('utm_source')||null,utm_medium:params.get('utm_medium')||null,utm_campaign:params.get('utm_campaign')||null,utm_term:params.get('utm_term')||null,utm_content:params.get('utm_content')||null,gclid:params.get('gclid')||null,referrer:document.referrer||null,landing_page:location.pathname,recorded_at:new Date().toISOString()};
  if(!localStorage.getItem(FIRST))localStorage.setItem(FIRST,JSON.stringify(touch));
  const previousLast=parse(localStorage.getItem(LAST),{});localStorage.setItem(LAST,JSON.stringify({...previousLast,...Object.fromEntries(Object.entries(touch).filter(([,v])=>v)),landing_page:location.pathname,recorded_at:new Date().toISOString()}));
  const firstTouch=()=>parse(localStorage.getItem(FIRST),{}),lastTouch=()=>parse(localStorage.getItem(LAST),{});
  window.NexusAttribution={first:firstTouch,last:lastTouch,marketingOptIn:()=>false};

  function consented(){return localStorage.getItem(CONSENT)==='accepted'&&!navigator.globalPrivacyControl}
  async function send(name,properties={}){
    const event={anonymous_id:getId(ANON),session_id:getId(SESSION),event_name:String(name||'event').slice(0,80),page_path:location.pathname,referrer:document.referrer||null,first_touch:firstTouch(),last_touch:lastTouch(),properties,consented:consented()};
    if(!event.consented){const q=parse(localStorage.getItem('nexus_event_queue')||'[]',[]);q.push({...event,created_at:new Date().toISOString()});localStorage.setItem('nexus_event_queue',JSON.stringify(q.slice(-200)));return false}
    try{const r=await fetch(`${SUPABASE_URL}/rest/v1/nexus_analytics_events`,{method:'POST',keepalive:true,headers:{'content-type':'application/json','apikey':SUPABASE_KEY,'authorization':`Bearer ${SUPABASE_KEY}`,'Prefer':'return=minimal'},body:JSON.stringify(event)});return r.ok}catch{return false}
  }
  window.nexusTrack=(name,props={})=>{send(name,props)};
  async function flush(){if(!consented())return;const q=parse(localStorage.getItem('nexus_event_queue')||'[]',[]);if(!q.length)return;localStorage.removeItem('nexus_event_queue');for(const x of q.slice(-50))await send(x.event_name||x.name,x.properties||x.props||{})}

  function setConsent(value){localStorage.setItem(CONSENT,value);if(value==='accepted'){flush();send('analytics_consent',{value:'accepted'})}}
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#acceptCookies'))setConsent('accepted');
    if(e.target.closest?.('#declineCookies'))setConsent('declined');
    const cta=e.target.closest?.('a.btn,button.btn,[data-cta]');if(cta){send('cta_click',{label:(cta.textContent||'').trim().slice(0,160),href:cta.getAttribute('href')||null})}
  },true);

  const pageMeta={
    '/':{title:'Nexus Intelligence | Practical AI Implementation for SMB Operations',description:'Find high-value AI and automation opportunities, validate the workflow, and implement controlled improvements with measurable baselines.'},
    '/services':{title:'AI Implementation Solutions | Nexus Intelligence',description:'Explore Nexus Intelligence solutions for workflow automation, knowledge systems, reporting, customer operations, and practical AI implementation.'},
    '/quick-scan':{title:'Free AI Opportunity Snapshot | Nexus Intelligence',description:'A five-minute screening that identifies your highest-potential AI opportunities and the first workflow worth investigating.'},
    '/assessment':{title:'Deeper AI Diagnostic | Nexus Intelligence',description:'A deeper operational diagnostic for qualified prospects who need a more defensible AI implementation recommendation.'},
    '/book':{title:'Book a Nexus Fit Call | Nexus Intelligence',description:'Choose a real available time to discuss your AI opportunity and carry your Snapshot or diagnostic context into the call.'},
    '/case-studies':{title:'Evidence & Results | Nexus Intelligence',description:'Nexus Intelligence evidence standards, measured improvement records, and verified case studies when client authorization is complete.'},
    '/about':{title:'About Nexus Intelligence',description:'How Nexus Intelligence approaches practical AI implementation, evidence, human control, and measurable business improvement.'},
    '/how-it-works':{title:'How Nexus Intelligence Works',description:'See the Nexus path from opportunity screening and diagnosis to a controlled pilot, implementation, and measurement.'}
  };
  function meta(name,content,property=false){let el=document.head.querySelector(`meta[${property?'property':'name'}="${name}"]`);if(!el){el=document.createElement('meta');el.setAttribute(property?'property':'name',name);document.head.appendChild(el)}el.content=content}
  function metadata(){
    const path=location.pathname.replace(/\/$/,'')||'/',m=pageMeta[path]||{title:document.title,description:document.querySelector('meta[name="description"]')?.content||'Nexus Intelligence'};
    document.title=m.title;meta('description',m.description);const canonical=location.origin+path;
    let link=document.head.querySelector('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.appendChild(link)}link.href=canonical;
    meta('og:title',m.title,true);meta('og:description',m.description,true);meta('og:url',canonical,true);meta('og:type',path==='/case-studies'?'website':'website',true);meta('twitter:card','summary_large_image');meta('twitter:title',m.title);meta('twitter:description',m.description);
    if(!document.getElementById('nexusSchema')){const s=document.createElement('script');s.id='nexusSchema';s.type='application/ld+json';s.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Organization','name':'Nexus Intelligence','url':location.origin,'description':'Practical AI implementation and workflow improvement for small and mid-sized businesses.'});document.head.appendChild(s)}
  }
  function vocabulary(){
    document.querySelectorAll('.navlinks a,footer a').forEach(a=>{const t=(a.textContent||'').trim().toLowerCase();if(t==='services')a.textContent='Solutions';else if(t==='results'||t==='case studies')a.textContent='Evidence & Results';else if(t==='opportunity scan'||t==='quick scan'||t==='assessment')a.textContent=a.href.includes('/assessment')?'Deeper Diagnostic':'Free AI Snapshot'});
    if(location.pathname==='/quick-scan'){document.querySelectorAll('h1,h2,.eyebrow,.kicker').forEach(el=>{if(/quick scan|opportunity scan/i.test(el.textContent||''))el.textContent=(el.textContent||'').replace(/quick scan|opportunity scan/ig,'Free AI Opportunity Snapshot')})}
    if(location.pathname==='/assessment'){document.querySelectorAll('h1,h2,.eyebrow,.kicker').forEach(el=>{if(/assessment|diagnostic/i.test(el.textContent||''))el.textContent=(el.textContent||'').replace(/AI Opportunity Assessment|Opportunity Assessment/ig,'Deeper AI Diagnostic')})}
  }
  function annotateForms(){
    document.querySelectorAll('form').forEach(form=>{if(form.dataset.nexusTracked)return;form.dataset.nexusTracked='1';form.addEventListener('submit',()=>send('form_submit',{form_id:form.id||null,path:location.pathname}),true)});
  }
  document.addEventListener('DOMContentLoaded',()=>{metadata();vocabulary();annotateForms();send('page_view',{title:document.title});flush()});
  window.addEventListener('load',()=>{vocabulary();annotateForms()});
})();
