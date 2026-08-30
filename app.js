(function(){
  const isPortal=location.pathname==='/portal';

  // Public-site readability layer.
  if(!isPortal && !document.querySelector('link[href="/simple-site.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/simple-site.css';document.head.appendChild(link);
  }

  const menu=document.querySelector('.menu-btn'), nav=document.querySelector('.navlinks');

  // Keep the public navigation intentionally small and obvious.
  if(nav && !isPortal){
    nav.innerHTML='<a href="/services">Services</a><a href="/methodology">How It Works</a><a href="/industries">Industries</a><a href="/about">About</a><a href="/portal">Client Login</a><a class="nav-cta" data-track="nav_quick_scan" href="/quick-scan">Free 60-Second Scan</a>';
  }

  if(menu&&nav) menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});

  // Improve portal account-creation UX around email confirmation.
  if(isPortal){
    const form=document.getElementById('createForm');
    const pane=document.getElementById('createPane');
    const message=document.getElementById('authMessage');
    const signInTab=document.getElementById('tabSignIn');
    let signupTimer=null;

    if(form && !document.getElementById('portalEmailConfirmNote')){
      const note=document.createElement('div');
      note.id='portalEmailConfirmNote';
      note.className='note';
      note.style.marginBottom='16px';
      note.innerHTML='<b>Email verification required:</b> After creating the account, we will send a confirmation email. Delivery can take a minute. Keep this page open until you see the confirmation instructions.';
      form.parentElement.insertBefore(note,form);
    }

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
            const safe=email.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
            const card=document.createElement('div');
            card.id='portalConfirmationState';
            card.className='result-box';
            card.style.marginTop='18px';
            card.innerHTML='<div class="kicker">Account created</div><h3 style="font-size:25px;margin:8px 0">Check your email to finish verification.</h3><p style="color:var(--muted)">A confirmation message was sent to <b style="color:var(--text)">'+safe+'</b>. Delivery may take a minute. Click the confirmation link once, then return to the Nexus Client Portal and sign in.</p><div class="actions"><button id="portalReturnSignIn" class="btn primary" type="button">Return to sign in</button><a class="btn secondary" href="/portal">Reload portal</a></div>';
            pane.appendChild(card);form.style.display='none';document.getElementById('portalEmailConfirmNote')?.remove();
            document.getElementById('portalReturnSignIn')?.addEventListener('click',()=>signInTab?.click());
          }
        }else if(text && !/Creating account/i.test(text) && !/Still working/i.test(text)){
          clearTimeout(signupTimer);
          if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Create account';}
        }
      });
      observer.observe(message,{childList:true,subtree:true,characterData:true});
    }

    const authParams=new URLSearchParams((location.hash||'').replace(/^#/,''));
    const authError=authParams.get('error_description')||authParams.get('error');
    if(authError && message){
      message.textContent='Email verification could not complete: '+decodeURIComponent(authError.replace(/\+/g,' '))+'. Please return to sign in or request a fresh confirmation email.';
      message.style.color='#ffb5b5';
    }
  }

  window.nexusTrack=function(name,props={}){
    const e={name,props,path:location.pathname,ts:new Date().toISOString()};
    const q=JSON.parse(localStorage.getItem('nexus_event_queue')||'[]');q.push(e);
    localStorage.setItem('nexus_event_queue',JSON.stringify(q.slice(-200)));
  };

  const consent=localStorage.getItem('nexus_cookie_consent');
  const banner=document.getElementById('cookieBanner');
  function loadHubSpot(){
    if(document.getElementById('hs-script-loader')) return;
    window._hsq=window._hsq||[];
    const s=document.createElement('script');s.id='hs-script-loader';s.async=true;s.defer=true;
    s.src='https://js.hs-scripts.com/247215482.js';document.body.appendChild(s);
  }
  const gpc=navigator.globalPrivacyControl===true;
  if(gpc&&!consent)localStorage.setItem('nexus_cookie_consent','declined');
  if(consent==='accepted'&&!gpc)loadHubSpot();
  if(!consent&&!gpc&&banner)banner.classList.add('show');
  document.getElementById('acceptCookies')?.addEventListener('click',()=>{localStorage.setItem('nexus_cookie_consent','accepted');banner?.classList.remove('show');loadHubSpot();});
  document.getElementById('declineCookies')?.addEventListener('click',()=>{localStorage.setItem('nexus_cookie_consent','declined');banner?.classList.remove('show');});
  document.querySelectorAll('[data-track]').forEach(el=>el.addEventListener('click',()=>nexusTrack(el.dataset.track)));
})();
