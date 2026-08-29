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

  // Improve portal account-creation UX around email confirmation.
  if(location.pathname==='/portal'){
    const form=document.getElementById('createForm');
    const pane=document.getElementById('createPane');
    const message=document.getElementById('authMessage');
    const signInTab=document.getElementById('tabSignIn');
    let signupTimer=null;

    // Explain the verification step before a prospect submits anything.
    if(form && !document.getElementById('portalEmailConfirmNote')){
      const note=document.createElement('div');
      note.id='portalEmailConfirmNote';
      note.className='note';
      note.style.marginBottom='16px';
      note.innerHTML='<b>Email verification required:</b> After creating the account, we will send a confirmation email. Delivery can take a minute. Keep this page open until you see the confirmation instructions.';
      form.parentElement.insertBefore(note,form);
    }

    // Give immediate, durable feedback while Supabase sends the confirmation email.
    form?.addEventListener('submit',()=>{
      const button=form.querySelector('button[type="submit"]');
      if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Sending confirmation email…';}
      clearTimeout(signupTimer);
      signupTimer=setTimeout(()=>{
        if(message && /Creating account/i.test(message.textContent||'')){
          message.innerHTML='<b>Still working.</b> Confirmation email delivery can occasionally take a little longer. Do not submit the form again; keep this page open and check your inbox.';
          message.style.color='var(--muted)';
        }
      },8000);
    },true);

    if(message){
      const observer=new MutationObserver(()=>{
        const text=(message.textContent||'').trim();
        const button=form?.querySelector('button[type="submit"]');

        if(/Account created\. Check your email/i.test(text)){
          clearTimeout(signupTimer);
          if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Create account';}
          if(pane && !document.getElementById('portalConfirmationState')){
            const email=document.getElementById('createEmail')?.value?.trim()||'your email address';
            const card=document.createElement('div');
            card.id='portalConfirmationState';
            card.className='result-box';
            card.style.marginTop='18px';
            card.innerHTML='<div class="kicker">Account created</div><h3 style="font-size:25px;margin:8px 0">Check your email to finish verification.</h3><p style="color:var(--muted)">A confirmation message was sent to <b style="color:var(--text)">'+email.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))+'</b>. Delivery may take a minute. Click the confirmation link once, then return to the Nexus Client Portal and sign in.</p><div class="actions"><button id="portalReturnSignIn" class="btn primary" type="button">Return to sign in</button><a class="btn secondary" href="/portal">Reload portal</a></div>';
            pane.appendChild(card);
            form.style.display='none';
            document.getElementById('portalEmailConfirmNote')?.remove();
            document.getElementById('portalReturnSignIn')?.addEventListener('click',()=>signInTab?.click());
          }
        }else if(text && !/Creating account/i.test(text) && !/Still working/i.test(text)){
          clearTimeout(signupTimer);
          if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Create account';}
        }
      });
      observer.observe(message,{childList:true,subtree:true,characterData:true});
    }

    // Surface authentication-link failures if Supabase sends them back to the portal.
    const authParams=new URLSearchParams((location.hash||'').replace(/^#/,''));
    const authError=authParams.get('error_description')||authParams.get('error');
    if(authError && message){
      message.textContent='Email verification could not complete: '+decodeURIComponent(authError.replace(/\+/g,' '))+'. Please return to sign in or request a fresh confirmation email.';
      message.style.color='#ffb5b5';
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
