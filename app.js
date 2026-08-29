(function(){
  const menu=document.querySelector('.menu-btn'), nav=document.querySelector('.navlinks');
  if(menu&&nav) menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});

  // Simple first-party event queue for later backend connection.
  window.nexusTrack=function(name,props={}){
    const e={name,props,path:location.pathname,ts:new Date().toISOString()};
    const q=JSON.parse(localStorage.getItem('nexus_event_queue')||'[]');q.push(e);
    localStorage.setItem('nexus_event_queue',JSON.stringify(q.slice(-200)));
  };

  // Cookie consent: HubSpot page tracking only loads after opt-in.
  const consent=localStorage.getItem('nexus_cookie_consent');
  const banner=document.getElementById('cookieBanner');
  function loadHubSpot(){
    if(document.getElementById('hs-script-loader')) return;
    window._hsq=window._hsq||[];
    const s=document.createElement('script');s.id='hs-script-loader';s.async=true;s.defer=true;
    s.src='https://js.hs-scripts.com/247215482.js';document.body.appendChild(s);
  }
  const gpc = navigator.globalPrivacyControl === true;
  if(gpc && !consent){ localStorage.setItem('nexus_cookie_consent','declined'); }
  if(consent==='accepted' && !gpc) loadHubSpot();
  if(!consent && !gpc && banner) banner.classList.add('show');
  document.getElementById('acceptCookies')?.addEventListener('click',()=>{
    localStorage.setItem('nexus_cookie_consent','accepted');banner.classList.remove('show');loadHubSpot();
  });
  document.getElementById('declineCookies')?.addEventListener('click',()=>{
    localStorage.setItem('nexus_cookie_consent','declined');banner.classList.remove('show');
  });
  document.querySelectorAll('[data-track]').forEach(el=>el.addEventListener('click',()=>nexusTrack(el.dataset.track)));
})();
