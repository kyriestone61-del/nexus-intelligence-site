(function(){
  const menu=document.querySelector('.menu-btn'), nav=document.querySelector('.navlinks');
  if(menu&&nav) menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});

  // Add low-friction public screening and authenticated client workspace links sitewide.
  if(nav){
    const cta=nav.querySelector('.nav-cta');
    if(!nav.querySelector('a[href="/quick-scan"]')){
      const a=document.createElement('a');a.href='/quick-scan';a.textContent='60-Second Quick Scan';
      cta?nav.insertBefore(a,cta):nav.appendChild(a);
    }
    if(!nav.querySelector('a[href="/portal"]')){
      const a=document.createElement('a');a.href='/portal';a.textContent='Client Portal';
      cta?nav.insertBefore(a,cta):nav.appendChild(a);
    }
  }

  // Keep the homepage offer ladder aligned with the six paid services.
  if(location.pathname==='/' || location.pathname===''){
    const serviceGrid=[...document.querySelectorAll('section .grid')].find(g=>g.querySelector('a[href="/services/ai-opportunity-assessment"]'));
    if(serviceGrid){
      const cards=[...serviceGrid.querySelectorAll(':scope > a.card')];
      const managed=cards.find(c=>c.getAttribute('href')==='/services/managed-ai-operations');
      const transformation=cards.find(c=>c.getAttribute('href')==='/services/business-transformation');
      const fractional=cards.find(c=>c.getAttribute('href')==='/services/fractional-ai-director');
      const compare=cards.find(c=>c.getAttribute('href')==='/services');
      if(managed) managed.querySelector('.tag').textContent='04 · Optimize';
      if(transformation) transformation.querySelector('.tag').textContent='05 · Expand';
      if(fractional) fractional.querySelector('.tag').textContent='06 · Advise';
      if(compare){
        compare.href='/services/ai-enablement-training';
        compare.querySelector('.tag').textContent='03 · Enable';
        compare.querySelector('h3').textContent='AI Enablement & Training';
        compare.querySelector('p').textContent='Help teams use approved AI tools consistently through role-based training, playbooks, SOPs, and human-review boundaries.';
      }
      if(!serviceGrid.parentElement.querySelector('.service-compare-link')){
        const actions=document.createElement('div');actions.className='actions service-compare-link';
        actions.innerHTML='<a class="btn secondary" href="/services">Compare all six services →</a>';
        serviceGrid.after(actions);
      }
    }

    // Give curious businesses a simple anonymous step before the full diagnostic.
    const hero=document.querySelector('main > .wrap.hero');
    if(hero && !document.getElementById('quickScanPromo')){
      const section=document.createElement('section');section.id='quickScanPromo';
      section.innerHTML='<div class="wrap"><div class="band split"><div><div class="kicker">Not ready for a full diagnostic?</div><h2 style="font-size:35px">Start with a 60-second AI Opportunity Quick Scan.</h2><p style="color:var(--muted)">Answer four anonymous screening questions and see which workflow category may be worth investigating first. No name, email, account, or document upload required.</p></div><div><div class="actions"><a class="btn primary" href="/quick-scan">Run the Quick Scan →</a><a class="btn secondary" href="/capabilities">Explore capabilities</a></div><p class="small">Preliminary screening only. It does not determine feasibility, expected ROI, security suitability, or a binding recommendation.</p></div></div></div>';
      hero.after(section);
    }
  }

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
    localStorage.setItem('nexus_cookie_consent','accepted');banner?.classList.remove('show');loadHubSpot();
  });
  document.getElementById('declineCookies')?.addEventListener('click',()=>{
    localStorage.setItem('nexus_cookie_consent','declined');banner?.classList.remove('show');
  });
  document.querySelectorAll('[data-track]').forEach(el=>el.addEventListener('click',()=>nexusTrack(el.dataset.track)));
})();
