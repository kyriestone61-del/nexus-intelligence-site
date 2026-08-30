(function(){
  const isPortal=location.pathname==='/portal';
  const JOURNEY_KEY='nexus_prospect_journey_v2';

  const safeParse=(value,fallback={})=>{try{return JSON.parse(value)||fallback}catch{return fallback}};
  const safeStore=(key,value)=>{try{localStorage.setItem(key,value);return true}catch{return false}};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  window.NexusEscapeHtml=escapeHtml;

  window.nexusTrack=function(name,props={}){
    try{
      const e={name,props,path:location.pathname,ts:new Date().toISOString()};
      const q=safeParse(localStorage.getItem('nexus_event_queue')||'[]',[]);q.push(e);
      safeStore('nexus_event_queue',JSON.stringify(q.slice(-200)));
    }catch{}
  };

  function sanitizeSharedJourney(journey){
    return {
      version:2,
      quickScan:journey.quickScan||null,
      assessment:journey.assessment||null,
      recommendation:journey.recommendation||null,
      stage:journey.stage||null,
      updatedAt:journey.updatedAt||null
    };
  }
  function encodeJourney(journey){
    try{
      return btoa(unescape(encodeURIComponent(JSON.stringify(sanitizeSharedJourney(journey)))))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }catch{return ''}
  }
  function decodeJourney(encoded){
    try{
      let value=String(encoded||'').replace(/-/g,'+').replace(/_/g,'/');
      value+='='.repeat((4-value.length%4)%4);
      return JSON.parse(decodeURIComponent(escape(atob(value))));
    }catch{return null}
  }
  function mergeDeep(base,patch){
    const out={...(base||{})};
    Object.entries(patch||{}).forEach(([k,v])=>{
      if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object'&&!Array.isArray(out[k])) out[k]=mergeDeep(out[k],v);
      else if(v!==undefined) out[k]=v;
    });
    return out;
  }
  function deriveStage(j){
    if(j?.booking?.status) return 'booking';
    if(j?.assessment?.completedAt) return 'assessment';
    if(j?.quickScan?.completedAt) return 'scan';
    return 'new';
  }
  let journey=safeParse(localStorage.getItem(JOURNEY_KEY)||'{}',{});
  const hashParams=new URLSearchParams((location.hash||'').replace(/^#/,''));
  const imported=hashParams.get('journey');
  if(imported){
    const decoded=decodeJourney(imported);
    if(decoded){journey=mergeDeep(journey,decoded);journey.importedAt=new Date().toISOString();safeStore(JOURNEY_KEY,JSON.stringify(journey));}
  }
  journey.stage=deriveStage(journey);

  window.NexusJourney={
    load:()=>safeParse(localStorage.getItem(JOURNEY_KEY)||'{}',{}),
    get:()=>journey,
    save(patch={}){
      journey=mergeDeep(journey,patch);journey.stage=deriveStage(journey);journey.updatedAt=new Date().toISOString();safeStore(JOURNEY_KEY,JSON.stringify(journey));
      window.dispatchEvent(new CustomEvent('nexusjourneychange',{detail:{stage:journey.stage}}));
      return journey;
    },
    clear(){journey={};try{localStorage.removeItem(JOURNEY_KEY)}catch{}window.dispatchEvent(new CustomEvent('nexusjourneychange',{detail:{stage:'new'}}));},
    shareUrl(path='/assessment'){
      const code=encodeJourney(journey);return `${location.origin}${path}${code?`#journey=${code}`:''}`;
    },
    next(){
      const j=this.get();
      if(!j.quickScan?.completedAt)return {href:'/quick-scan',label:'Find My AI Opportunities'};
      if(!j.assessment?.completedAt)return {href:'/assessment',label:'Continue My Diagnostic'};
      if(!j.booking?.status)return {href:'/book',label:'Book My Fit Call'};
      return {href:'/prospect-workspace',label:'Continue My Nexus Journey'};
    }
  };

  // Global experience layers.
  if(!isPortal && !document.querySelector('link[href="/simple-site.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/simple-site.css';document.head.appendChild(link);
  }
  if(!document.querySelector('link[href="/mobile-ux.css"]')){
    const mobile=document.createElement('link');mobile.rel='stylesheet';mobile.href='/mobile-ux.css';document.head.appendChild(mobile);
  }

  const menu=document.querySelector('.menu-btn'), nav=document.querySelector('.navlinks');
  if(nav && !isPortal){
    nav.innerHTML='<a href="/services">Solutions</a><a href="/methodology">How It Works</a><a href="/case-studies">Results</a><a href="/about">About</a><a href="/portal">Client Login</a><a class="nav-cta" data-track="nav_quick_scan" href="/quick-scan">Find My AI Opportunities</a>';
  }
  if(menu&&nav){
    menu.addEventListener('click',()=>{
      const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menu-open',open);
    });
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}));
  }

  function renderJourneyUI(){
    if(isPortal)return;
    const j=window.NexusJourney.get();
    const existing=document.getElementById('nexusJourneyBar');
    if(j.stage==='new'){existing?.remove();return;}
    const next=window.NexusJourney.next();
    const labels={scan:'Opportunity Scan complete',assessment:'Diagnostic complete',booking:j.booking?.status==='confirmed'?'Fit Call confirmed':'Fit Call requested'};
    existing?.remove();
    const bar=document.createElement('div');bar.id='nexusJourneyBar';bar.className='journey-bar';
    const rec=j.recommendation?.service?` · ${escapeHtml(j.recommendation.service)}`:'';
    bar.innerHTML=`<div class="journey-inner"><div class="journey-copy"><span class="journey-check">✓</span><div><b>${labels[j.stage]||'Nexus journey in progress'}</b><small>Your previous answers will follow you${rec}.</small></div></div><a class="btn primary journey-action" href="${next.href}">${next.label} →</a></div>`;
    document.body.appendChild(bar);
  }
  window.addEventListener('nexusjourneychange',renderJourneyUI);

  // Homepage problem-first explorer.
  const problemButtons=[...document.querySelectorAll('.problem-btn')];
  const problemTitle=document.getElementById('problemTitle');
  const problemText=document.getElementById('problemText');
  const problemList=document.getElementById('problemList');
  const measureList=document.getElementById('measureList');
  if(problemButtons.length && problemTitle && problemText && problemList && measureList){
    const problemData={
      manual:{title:'Reduce repetitive work',text:'Nexus can identify repetitive handoffs, copying, routing, document preparation, and status-update work that may be suitable for automation.',examine:['Manual data entry and copying','Recurring document work','Routing, reminders, and status updates'],measure:['Handling time','Manual touchpoints','Rework and exception rate']},
      revenue:{title:'Generate more revenue',text:'Nexus can examine where leads are lost, follow-up is inconsistent, or sales teams spend too much time on work that does not require human judgment.',examine:['Lead capture and routing','Follow-up consistency','Sales preparation and CRM workflows'],measure:['Lead response time','Follow-up completion','Qualified opportunity conversion']},
      service:{title:'Improve customer response',text:'Nexus can structure intake, triage, scheduling, response preparation, and exception routing so customers receive faster and more consistent service.',examine:['Inquiry classification','Scheduling and intake','Response preparation and escalations'],measure:['Response time','Resolution time','Exception volume']},
      knowledge:{title:'Organize company knowledge',text:'Nexus can make SOPs, policies, project information, and internal documents easier for authorized employees to find and use.',examine:['SOP and policy retrieval','Document search','Internal knowledge assistance'],measure:['Search time','Repeat questions','Successful retrieval rate']},
      data:{title:'Understand business data',text:'Nexus can help turn recurring reporting work and scattered operational data into clearer summaries, dashboards, and exception views.',examine:['Recurring KPI reporting','Cross-system summaries','Management visibility and exceptions'],measure:['Reporting time','Data completeness','Decision latency']},
      systems:{title:'Connect disconnected systems',text:'Nexus can map where employees manually move information between email, spreadsheets, CRMs, documents, and operating systems—and determine what can be connected safely.',examine:['Cross-system handoffs','Duplicate data entry','Status synchronization'],measure:['Handoff time','Duplicate entry volume','Sync and exception rate']}
    };
    function setProblem(key){
      const data=problemData[key];if(!data)return;
      problemTitle.textContent=data.title;problemText.textContent=data.text;
      problemList.innerHTML=data.examine.map(x=>`<li>${x}</li>`).join('');measureList.innerHTML=data.measure.map(x=>`<li>${x}</li>`).join('');
      problemButtons.forEach(btn=>{const active=btn.dataset.problem===key;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));});
      window.nexusTrack('home_problem_selected',{problem:key});
    }
    problemButtons.forEach(btn=>btn.addEventListener('click',()=>setProblem(btn.dataset.problem)));
  }

  // Personalized service recommendation banner.
  if(location.pathname.startsWith('/services')){
    const rec=journey.recommendation;
    const root=document.getElementById('serviceRoot')||document.querySelector('main');
    if(rec?.service&&root&&!document.getElementById('personalRecommendation')){
      const section=document.createElement('section');section.id='personalRecommendation';section.className='personal-recommendation';
      section.innerHTML=`<div class="wrap"><div class="recommendation-band"><div><div class="kicker">Recommended from your Nexus diagnostic</div><h2>${escapeHtml(rec.service)}</h2><p>${escapeHtml(rec.reason||'This is the smallest responsible next engagement based on the information you provided.')}</p><div class="rec-chips"><span>Readiness ${escapeHtml(rec.score||'—')}</span><span>${escapeHtml(rec.impact||'Impact to validate')}</span><span>${escapeHtml(rec.complexity||'Complexity to validate')}</span></div></div><div class="actions"><a class="btn primary" href="/book">Discuss My Recommendation →</a><a class="btn secondary" href="/assessment">Review My Diagnostic</a></div></div></div>`;
      const first=root.firstElementChild;first?first.after(section):root.appendChild(section);
    }
  }

  // Improve portal account-creation UX and carry prospect context into signup fields when app.js is used there.
  if(isPortal){
    const form=document.getElementById('createForm');
    const pane=document.getElementById('createPane');
    const message=document.getElementById('authMessage');
    const signInTab=document.getElementById('tabSignIn');
    const createTab=document.getElementById('tabCreate');
    let signupTimer=null;

    const contact=journey.contact||{};
    if(document.getElementById('createName')&&!document.getElementById('createName').value)document.getElementById('createName').value=contact.name||'';
    if(document.getElementById('createCompany')&&!document.getElementById('createCompany').value)document.getElementById('createCompany').value=contact.company||'';
    if(document.getElementById('createWebsite')&&!document.getElementById('createWebsite').value)document.getElementById('createWebsite').value=contact.website||'';
    if(document.getElementById('createEmail')&&!document.getElementById('createEmail').value)document.getElementById('createEmail').value=contact.email||'';

    if(journey.assessment?.completedAt&&createTab){createTab.textContent='Continue my evaluation';}

    if(form && !document.getElementById('portalEmailConfirmNote')){
      const note=document.createElement('div');note.id='portalEmailConfirmNote';note.className='note';note.style.marginBottom='16px';
      note.innerHTML=journey.assessment?.completedAt?'<b>Your Nexus context is ready:</b> Create your login and the opportunity you already identified will be carried into the workspace after setup.':'<b>Email verification required:</b> After creating the account, we will send a confirmation email. Delivery can take a minute.';
      form.parentElement.insertBefore(note,form);
    }

    form?.addEventListener('submit',()=>{
      const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Sending confirmation email…';}
      clearTimeout(signupTimer);signupTimer=setTimeout(()=>{if(message && /Creating account|Submitting account/i.test(message.textContent||'')){message.innerHTML='<b>Still working.</b> Do not submit again. Check your inbox while this page remains open.';message.style.color='var(--muted)';}},8000);
    },true);

    if(message){
      const observer=new MutationObserver(()=>{
        const text=(message.textContent||'').trim();const button=form?.querySelector('button[type="submit"]');
        if(/Account created\. Check your email|sent a confirmation email/i.test(text)){
          clearTimeout(signupTimer);if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Create account';}
          if(pane && !document.getElementById('portalConfirmationState')){
            const email=document.getElementById('createEmail')?.value?.trim()||'your email address';const card=document.createElement('div');card.id='portalConfirmationState';card.className='result-box';card.style.marginTop='18px';
            card.innerHTML='<div class="kicker">Account created</div><h3 style="font-size:25px;margin:8px 0">Check your email to finish verification.</h3><p style="color:var(--muted)">A confirmation message was sent to <b style="color:var(--text)">'+escapeHtml(email)+'</b>. Click the confirmation link once, then return here and sign in.</p><div class="actions"><button id="portalReturnSignIn" class="btn primary" type="button">Return to sign in</button></div>';
            pane.appendChild(card);document.getElementById('portalReturnSignIn')?.addEventListener('click',()=>signInTab?.click());
          }
        }else if(text && !/Creating account|Submitting account|Still working/i.test(text)){clearTimeout(signupTimer);if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Create account';}}
      });observer.observe(message,{childList:true,subtree:true,characterData:true});
    }

    const authParams=new URLSearchParams((location.hash||'').replace(/^#/,''));const authError=authParams.get('error_description')||authParams.get('error');
    if(authError && message){message.textContent='Email verification could not complete: '+decodeURIComponent(authError.replace(/\+/g,' '))+'. Please return to sign in or request a fresh confirmation email.';message.style.color='#ffb5b5';}
  }

  // Booking success was historically linked straight to the generic client portal.
  // Route that specific handoff into the prospect evaluation workspace instead.
  if(location.pathname==='/book'){
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href="/portal"]');
      if(link && /Continue to My Nexus Workspace/i.test(link.textContent||'')){
        event.preventDefault();location.href='/prospect-workspace';
      }
    });
  }

  const consent=localStorage.getItem('nexus_cookie_consent');
  const banner=document.getElementById('cookieBanner');
  function loadHubSpot(){if(document.getElementById('hs-script-loader'))return;window._hsq=window._hsq||[];const s=document.createElement('script');s.id='hs-script-loader';s.async=true;s.defer=true;s.src='https://js.hs-scripts.com/247215482.js';document.body.appendChild(s);}
  const gpc=navigator.globalPrivacyControl===true;if(gpc&&!consent)safeStore('nexus_cookie_consent','declined');if(consent==='accepted'&&!gpc)loadHubSpot();if(!consent&&!gpc&&banner)banner.classList.add('show');
  document.getElementById('acceptCookies')?.addEventListener('click',()=>{safeStore('nexus_cookie_consent','accepted');banner?.classList.remove('show');loadHubSpot();});
  document.getElementById('declineCookies')?.addEventListener('click',()=>{safeStore('nexus_cookie_consent','declined');banner?.classList.remove('show');});
  document.querySelectorAll('[data-track]').forEach(el=>el.addEventListener('click',()=>window.nexusTrack(el.dataset.track)));

  renderJourneyUI();
})();
