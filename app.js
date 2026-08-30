(function(){
  const path=location.pathname.replace(/\/$/,'')||'/';
  const isPortal=path==='/portal';
  const JOURNEY_KEY='nexus_prospect_journey_v2';

  const safeParse=(value,fallback={})=>{try{return JSON.parse(value)||fallback}catch{return fallback}};
  const safeStore=(key,value)=>{try{localStorage.setItem(key,value);return true}catch{return false}};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const normalizeText=value=>String(value??'').replace(/</g,'‹').replace(/>/g,'›');
  const normalizeJourneyValue=value=>{
    if(typeof value==='string')return normalizeText(value);
    if(Array.isArray(value))return value.map(normalizeJourneyValue);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeJourneyValue(v)]));
    return value;
  };
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
      return normalizeJourneyValue(JSON.parse(decodeURIComponent(escape(atob(value)))));
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
    if(j?.booking?.status)return 'booking';
    if(j?.assessment?.completedAt)return 'assessment';
    if(j?.quickScan?.completedAt)return 'scan';
    return 'new';
  }

  let journey=normalizeJourneyValue(safeParse(localStorage.getItem(JOURNEY_KEY)||'{}',{}));
  const hashParams=new URLSearchParams((location.hash||'').replace(/^#/,''));
  const imported=hashParams.get('journey');
  if(imported){
    const decoded=decodeJourney(imported);
    if(decoded){
      journey=mergeDeep(journey,decoded);
      journey.importedAt=new Date().toISOString();
      safeStore(JOURNEY_KEY,JSON.stringify(journey));
    }
  }
  journey.stage=deriveStage(journey);

  window.NexusJourney={
    load:()=>normalizeJourneyValue(safeParse(localStorage.getItem(JOURNEY_KEY)||'{}',{})),
    get:()=>journey,
    save(patch={}){
      journey=mergeDeep(journey,normalizeJourneyValue(patch));
      journey.stage=deriveStage(journey);
      journey.updatedAt=new Date().toISOString();
      safeStore(JOURNEY_KEY,JSON.stringify(journey));
      window.dispatchEvent(new CustomEvent('nexusjourneychange',{detail:{stage:journey.stage}}));
      return journey;
    },
    clear(){
      journey={};
      try{localStorage.removeItem(JOURNEY_KEY)}catch{}
      window.dispatchEvent(new CustomEvent('nexusjourneychange',{detail:{stage:'new'}}));
    },
    shareUrl(target='/book'){
      const code=encodeJourney(journey);
      return `${location.origin}${target}${code?`#journey=${code}`:''}`;
    },
    next(){
      const j=this.get();
      if(!j.quickScan?.completedAt&&!j.assessment?.completedAt)return {href:'/quick-scan',label:'Get My Free AI Snapshot'};
      if(!j.booking?.status)return {href:'/book',label:'Request My Fit Call'};
      return {href:'/prospect-workspace',label:'Continue My Nexus Journey'};
    }
  };

  // Keep generated report/review HTML safe from angle-bracket input.
  if(path==='/assessment'||path==='/book'){
    document.addEventListener('input',event=>{
      const el=event.target;
      if(!el||typeof el.value!=='string'||!/[<>]/.test(el.value))return;
      const start=el.selectionStart,end=el.selectionEnd;
      el.value=normalizeText(el.value);
      try{if(start!==null&&end!==null)el.setSelectionRange(start,end)}catch{}
    },true);
  }

  // Shared visual layers.
  if(!isPortal&&!document.querySelector('link[href="/simple-site.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/simple-site.css';document.head.appendChild(link);
  }
  if(!document.querySelector('link[href="/mobile-ux.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/mobile-ux.css';document.head.appendChild(link);
  }
  if(!document.querySelector('link[href="/experience-round-two.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/experience-round-two.css';document.head.appendChild(link);
  }

  // Public navigation is intentionally prospect-journey first.
  const menu=document.querySelector('.menu-btn'),nav=document.querySelector('.navlinks');
  if(nav&&!isPortal){
    nav.innerHTML='<a href="/services">Solutions</a><a href="/methodology">How It Works</a><a href="/case-studies">Results</a><a href="/about">About</a><a href="/portal">Client Login</a><a class="nav-cta" data-track="nav_quick_scan" href="/quick-scan">Free AI Snapshot</a>';
  }
  if(menu&&nav){
    menu.addEventListener('click',()=>{
      const open=nav.classList.toggle('open');
      menu.setAttribute('aria-expanded',String(open));
      document.body.classList.toggle('menu-open',open);
    });
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
      nav.classList.remove('open');menu.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open');
    }));
  }

  function markActiveNavigation(){
    if(!nav||isPortal)return;
    nav.querySelectorAll('a').forEach(a=>{
      const href=a.getAttribute('href')||'';
      const active=href==='/'?path==='/':href==='/services'?path.startsWith('/services'):href===path;
      if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
  }

  function renderJourneyUI(){
    if(isPortal)return;
    const j=window.NexusJourney.get();
    const existing=document.getElementById('nexusJourneyBar');
    if(j.stage==='new'){existing?.remove();renderMobileStart();return;}
    const next=window.NexusJourney.next();
    const labels={scan:'Free AI Snapshot complete',assessment:'Deeper diagnostic complete',booking:j.booking?.status==='confirmed'?'Fit Call confirmed':'Fit Call requested'};
    existing?.remove();
    document.querySelector('.nx-mobile-start')?.remove();
    document.body.classList.remove('nx-has-mobile-start');
    const bar=document.createElement('div');bar.id='nexusJourneyBar';bar.className='journey-bar';
    const rec=j.recommendation?.service?` · ${escapeHtml(j.recommendation.service)}`:'';
    bar.innerHTML=`<div class="journey-inner"><div class="journey-copy"><span class="journey-check">✓</span><div><b>${labels[j.stage]||'Nexus journey in progress'}</b><small>Your previous answers will follow you${rec}.</small></div></div><a class="btn primary journey-action" href="${next.href}">${next.label} →</a></div>`;
    document.body.appendChild(bar);
  }

  function renderMobileStart(){
    if(isPortal)return;
    const excluded=['/quick-scan','/assessment','/book','/prospect-workspace'];
    document.querySelector('.nx-mobile-start')?.remove();
    document.body.classList.remove('nx-has-mobile-start');
    if(window.NexusJourney.get().stage!=='new'||excluded.includes(path))return;
    const bar=document.createElement('div');bar.className='nx-mobile-start';
    bar.innerHTML='<a class="btn primary" href="/quick-scan">Get My Free AI Snapshot →</a>';
    document.body.appendChild(bar);document.body.classList.add('nx-has-mobile-start');
  }
  window.addEventListener('nexusjourneychange',renderJourneyUI);

  // Homepage problem-first explorer.
  const problemButtons=[...document.querySelectorAll('.problem-btn')];
  const problemTitle=document.getElementById('problemTitle');
  const problemText=document.getElementById('problemText');
  const problemList=document.getElementById('problemList');
  const measureList=document.getElementById('measureList');
  if(problemButtons.length&&problemTitle&&problemText&&problemList&&measureList){
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
      problemList.innerHTML=data.examine.map(x=>`<li>${x}</li>`).join('');
      measureList.innerHTML=data.measure.map(x=>`<li>${x}</li>`).join('');
      problemButtons.forEach(btn=>{const active=btn.dataset.problem===key;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));});
      window.nexusTrack('home_problem_selected',{problem:key});
    }
    problemButtons.forEach(btn=>btn.addEventListener('click',()=>setProblem(btn.dataset.problem)));
  }

  // Improvement 6: service selection is guided by business stage rather than a six-item menu.
  function injectServiceGuide(){
    if(path!=='/services')return;
    const root=document.getElementById('serviceRoot')||document.querySelector('main');if(!root)return;
    const rec=window.NexusJourney.get().recommendation;
    const hero=root.querySelector('.wrap.hero');if(!hero)return;

    if(rec?.service&&!document.getElementById('personalRecommendation')){
      const section=document.createElement('section');section.id='personalRecommendation';section.className='personal-recommendation';
      section.innerHTML=`<div class="wrap"><div class="recommendation-band"><div><div class="kicker">Recommended from your Nexus diagnostic</div><h2>${escapeHtml(rec.service)}</h2><p>${escapeHtml(rec.reason||'This is the smallest responsible next engagement based on the information you provided.')}</p><div class="rec-chips"><span>Readiness ${escapeHtml(rec.score||'—')}</span><span>${escapeHtml(rec.impact||'Impact to validate')}</span><span>${escapeHtml(rec.complexity||'Complexity to validate')}</span></div></div><div class="actions"><a class="btn primary" href="/book">Discuss My Recommendation →</a><a class="btn secondary" href="/assessment">Review My Diagnostic</a></div></div></div>`;
      hero.insertAdjacentElement('afterend',section);
      return;
    }
    if(rec?.service||document.getElementById('nxServiceGuide'))return;

    const stageMap={
      unclear:{label:'I know something is inefficient, but not where to start',service:'AI Opportunity Assessment',slug:'ai-opportunity-assessment',reason:'Start by mapping the workflow, baseline, systems, ownership, and risk before spending implementation budget.'},
      workflow:{label:'I already know the workflow I want to improve',service:'Implementation Sprint',slug:'implementation-sprint',reason:'A focused sprint is appropriate when the workflow, owner, systems, baseline, and acceptance criteria can be defined.'},
      adoption:{label:'My team needs better AI usage and standards',service:'AI Enablement & Training',slug:'ai-enablement-training',reason:'Use role-based training, playbooks, boundaries, and SOPs to make approved AI use more consistent.'},
      live:{label:'We already have AI/automation running',service:'Managed AI Operations',slug:'managed-ai-operations',reason:'Move from one-time delivery to an operating cadence for review, maintenance, documentation, and improvement.'},
      multi:{label:'We need to improve several workflows or teams',service:'Business Transformation',slug:'business-transformation',reason:'Coordinate multiple improvement waves only when the organization is ready for a broader program.'},
      leadership:{label:'We need ongoing AI strategy and oversight',service:'Fractional AI Director',slug:'fractional-ai-director',reason:'Use ongoing leadership support for priorities, governance coordination, vendor decisions, and implementation oversight.'}
    };
    const section=document.createElement('section');section.id='nxServiceGuide';
    section.innerHTML=`<div class="wrap"><div class="nx-decision-shell"><div class="nx-decision-head"><div class="kicker">Choose by business stage</div><h2>What does your business need next?</h2><p>You do not need to understand the Nexus service catalog. Choose the situation that sounds most like your current state.</p></div><div class="nx-choice-row">${Object.entries(stageMap).map(([key,x],i)=>`<button class="nx-choice${i===0?' active':''}" type="button" data-stage="${key}"><span>${String(i+1).padStart(2,'0')}</span><b>${x.label}</b></button>`).join('')}</div><div id="nxServiceOutput" class="nx-decision-output"></div></div></div>`;
    hero.insertAdjacentElement('afterend',section);
    const output=document.getElementById('nxServiceOutput');
    const render=key=>{
      const x=stageMap[key]||stageMap.unclear;
      section.querySelectorAll('.nx-choice').forEach(b=>b.classList.toggle('active',b.dataset.stage===key));
      output.innerHTML=`<div><div class="kicker">Likely Nexus starting point</div><h3>${x.service}</h3><p>${x.reason}</p></div><div class="actions"><a class="btn primary" href="/services/${x.slug}">Review This Service →</a><a class="btn secondary" href="/quick-scan">Validate My Fit</a></div>`;
      window.nexusTrack('service_guide_selected',{stage:key,service:x.service});
    };
    section.querySelectorAll('.nx-choice').forEach(b=>b.addEventListener('click',()=>render(b.dataset.stage)));
    render('unclear');
  }

  // Improvement 7: make Results useful even before public case studies exist.
  function injectProofExplorer(){
    if(path!=='/case-studies'||document.getElementById('nxProofExplorer'))return;
    const hero=document.querySelector('main .wrap.hero');if(!hero)return;
    const proof={
      time:{label:'Time & throughput',baseline:'Current handling/cycle time and volume',change:'Exactly which handoffs, steps, or automations changed',measure:'Post-launch handling time, cycle time, volume, hours recovered',caution:'Seasonality, staffing changes, demand changes, and parallel process changes must be noted.'},
      quality:{label:'Quality & reliability',baseline:'Current error, rework, exception, or completion rate',change:'Validation rules, human review, routing, or workflow controls introduced',measure:'Error rate, rework, exception volume, completion rate',caution:'A lower error rate is not automatically caused by Nexus if training, staffing, or upstream data also changed.'},
      commercial:{label:'Commercial impact',baseline:'Current response, follow-up, conversion, and opportunity flow',change:'Lead capture, routing, response support, CRM, or follow-up process changes',measure:'Response time, follow-up completion, conversion, revenue influenced',caution:'Revenue is multi-causal. Nexus should distinguish influenced revenue from revenue proven to be caused by one system.'},
      visibility:{label:'Operating visibility',baseline:'Current reporting time, completeness, access, and decision latency',change:'Reporting workflow, source connections, summaries, dashboards, or exception views introduced',measure:'Reporting time, completeness, decision latency, adoption',caution:'Faster reporting only matters if the data remains reliable and decision-makers actually use it.'}
    };
    const section=document.createElement('section');section.id='nxProofExplorer';
    section.innerHTML=`<div class="wrap"><div class="nx-decision-shell nx-proof-explorer"><div class="nx-decision-head"><div class="kicker">Explore the proof model</div><h2>What would Nexus actually measure?</h2><p>Select an outcome family to see the evidence structure Nexus would establish before making a performance claim.</p></div><div class="nx-proof-tabs">${Object.entries(proof).map(([key,x],i)=>`<button class="nx-proof-tab${i===0?' active':''}" type="button" data-proof="${key}">${x.label}</button>`).join('')}</div><div id="nxProofPanel" class="nx-proof-panel"></div><p class="nx-proof-disclaimer">Illustrative measurement structure only. No example above represents a client result or guaranteed outcome.</p></div></div>`;
    hero.insertAdjacentElement('afterend',section);
    const panel=document.getElementById('nxProofPanel');
    const render=key=>{
      const x=proof[key]||proof.time;
      section.querySelectorAll('.nx-proof-tab').forEach(b=>b.classList.toggle('active',b.dataset.proof===key));
      panel.innerHTML=`<div><span>Baseline</span><b>${x.baseline}</b></div><div><span>Intervention record</span><b>${x.change}</b></div><div><span>Post-launch measurement</span><b>${x.measure}</b></div><div><span>Attribution caution</span><b>${x.caution}</b></div>`;
    };
    section.querySelectorAll('.nx-proof-tab').forEach(b=>b.addEventListener('click',()=>{render(b.dataset.proof);window.nexusTrack('results_proof_selected',{family:b.dataset.proof});}));
    render('time');
  }

  // Improvement 8: convert security language into a fast trust center before the detailed policy content.
  function injectTrustCenter(){
    if(path!=='/security'||document.getElementById('nxTrustCenter'))return;
    const hero=document.querySelector('main .wrap.hero');if(!hero)return;
    const section=document.createElement('section');section.id='nxTrustCenter';
    section.innerHTML=`<div class="wrap"><div class="nx-decision-shell"><div class="nx-decision-head"><div class="kicker">Nexus trust center</div><h2>Six questions clients should be able to answer quickly.</h2><p>The detailed governance language remains below. This summary makes the operating boundaries understandable before a prospect reads the technical detail.</p></div><div class="nx-trust-summary"><div class="nx-trust-card"><div class="nx-icon">🔐</div><h3>Who can access client data?</h3><p>Authenticated company members and authorized Nexus administrators within the access boundaries of the engagement.</p></div><div class="nx-trust-card"><div class="nx-icon">🧭</div><h3>Who makes consequential decisions?</h3><p>Humans remain the decision owners unless a narrow automated action is expressly authorized and controlled.</p></div><div class="nx-trust-card"><div class="nx-icon">🔑</div><h3>How are credentials handled?</h3><p>Production secrets should use approved authorization or credential-management methods—not public forms, chat, or ordinary documents.</p></div><div class="nx-trust-card"><div class="nx-icon">📁</div><h3>Who owns the business assets?</h3><p>Client accounts and client-provided data remain under client control; deliverable rights are defined in the signed agreement.</p></div><div class="nx-trust-card"><div class="nx-icon">↩</div><h3>What happens if something fails?</h3><p>Applicable implementations can define testing, exception handling, manual fallback, disable/rollback procedures, and responsible owners.</p></div><div class="nx-trust-card"><div class="nx-icon">🚪</div><h3>What happens when the engagement ends?</h3><p>Handoff, Nexus access removal, credential rotation, vendor access cleanup, and data return/deletion are handled according to scope and contract.</p></div></div><div class="nx-trust-answer"><b>What Nexus does not claim:</b> this page is not a cybersecurity certification, penetration test, legal compliance opinion, or guarantee that a system cannot fail or be compromised.</div></div></div>`;
    hero.insertAdjacentElement('afterend',section);
  }

  // Existing prospect recommendation banner on service detail pages.
  function injectDetailRecommendation(){
    if(!path.startsWith('/services/')||path==='/services')return;
    const rec=window.NexusJourney.get().recommendation;
    const root=document.getElementById('serviceRoot')||document.querySelector('main');
    if(rec?.service&&root&&!document.getElementById('personalRecommendation')){
      const section=document.createElement('section');section.id='personalRecommendation';section.className='personal-recommendation';
      section.innerHTML=`<div class="wrap"><div class="recommendation-band"><div><div class="kicker">Recommended from your Nexus diagnostic</div><h2>${escapeHtml(rec.service)}</h2><p>${escapeHtml(rec.reason||'This is the smallest responsible next engagement based on the information you provided.')}</p><div class="rec-chips"><span>Readiness ${escapeHtml(rec.score||'—')}</span><span>${escapeHtml(rec.impact||'Impact to validate')}</span><span>${escapeHtml(rec.complexity||'Complexity to validate')}</span></div></div><div class="actions"><a class="btn primary" href="/book">Discuss My Recommendation →</a><a class="btn secondary" href="/assessment">Review My Diagnostic</a></div></div></div>`;
      const hero=root.querySelector('.wrap.hero');hero?.insertAdjacentElement('afterend',section);
    }
  }

  // Improvement 9: make the client portal answer "what needs my attention?" immediately.
  function injectPortalActionCenter(){
    if(!isPortal||document.getElementById('portalActionDeck'))return;
    const overview=document.getElementById('section-overview');if(!overview)return;
    const toolbar=overview.querySelector('.toolbar');
    const deck=document.createElement('div');deck.id='portalActionDeck';
    deck.innerHTML=`<div class="portal-action-head"><div><div class="eyebrow">Next actions</div><h2>What needs your attention?</h2><p id="portalActionSummary">Your workspace will surface open coordination items here.</p></div><span id="portalAttentionCount" class="portal-attention-count">Checking workspace…</span></div><div class="portal-action-grid"><button class="portal-action-button" type="button" data-jump="tasks"><span>Tasks</span><b id="portalTaskAction">Review open tasks</b></button><button class="portal-action-button" type="button" data-jump="documents"><span>Files</span><b id="portalDocAction">Open secure documents</b></button><button class="portal-action-button" type="button" data-jump="metrics"><span>Measurement</span><b id="portalMetricAction">Review improvements</b></button><button class="portal-action-button" type="button" data-jump="notifications"><span>Updates</span><b id="portalNoteAction">Review notifications</b></button></div>`;
    toolbar?.insertAdjacentElement('afterend',deck);
    deck.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{
      document.querySelector(`.side-nav button[data-section="${b.dataset.jump}"]`)?.click();
    }));
    const ids=['sTasks','sDocs','sMiles','sNotes'];
    const update=()=>{
      const num=id=>Number(document.getElementById(id)?.textContent||0)||0;
      const tasks=num('sTasks'),docs=num('sDocs'),miles=num('sMiles'),notes=num('sNotes'),attention=tasks+notes;
      document.getElementById('portalAttentionCount').textContent=attention?`${attention} item${attention===1?'':'s'} need attention`:'Workspace up to date';
      document.getElementById('portalActionSummary').textContent=attention?`You have ${tasks} open task${tasks===1?'':'s'} and ${notes} unread notification${notes===1?'':'s'}.`:`No open task or unread-notification count is currently showing. ${miles} active milestone${miles===1?'':'s'} and ${docs} document${docs===1?'':'s'} are recorded.`;
      document.getElementById('portalTaskAction').textContent=tasks?`${tasks} open task${tasks===1?'':'s'}`:'Review tasks';
      document.getElementById('portalDocAction').textContent=docs?`${docs} secure document${docs===1?'':'s'}`:'Open secure files';
      document.getElementById('portalMetricAction').textContent='Review measured improvements';
      document.getElementById('portalNoteAction').textContent=notes?`${notes} unread update${notes===1?'':'s'}`:'Review updates';
    };
    ids.forEach(id=>{const el=document.getElementById(id);if(el)new MutationObserver(update).observe(el,{childList:true,subtree:true,characterData:true});});
    update();
  }

  // Existing portal account-creation improvements and prospect-context carryover.
  function enhancePortalSignup(){
    if(!isPortal)return;
    const form=document.getElementById('createForm');
    const pane=document.getElementById('createPane');
    const message=document.getElementById('authMessage');
    const signInTab=document.getElementById('tabSignIn');
    const createTab=document.getElementById('tabCreate');
    let signupTimer=null;
    const contact=journey.contact||{};
    const set=(id,value)=>{const el=document.getElementById(id);if(el&&!el.value)el.value=value||'';};
    set('createName',contact.name);set('createCompany',contact.company);set('createWebsite',contact.website);set('createEmail',contact.email);
    if(journey.assessment?.completedAt&&createTab)createTab.textContent='Continue my evaluation';
    if(form&&!document.getElementById('portalEmailConfirmNote')){
      const note=document.createElement('div');note.id='portalEmailConfirmNote';note.className='note';note.style.marginBottom='16px';
      note.innerHTML=journey.assessment?.completedAt?'<b>Your Nexus context is ready:</b> Create your login and the opportunity you already identified will be carried into the workspace after setup.':'<b>Email verification required:</b> After creating the account, Nexus will send a confirmation email.';
      form.parentElement.insertBefore(note,form);
    }
    form?.addEventListener('submit',()=>{
      const button=form.querySelector('button[type="submit"]');
      if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Sending confirmation email…';}
      clearTimeout(signupTimer);signupTimer=setTimeout(()=>{
        if(message&&/Creating account|Submitting account/i.test(message.textContent||'')){
          message.innerHTML='<b>Still working.</b> Do not submit again. Check your inbox while this page remains open.';message.style.color='var(--muted)';
        }
      },8000);
    },true);
    if(message){
      const observer=new MutationObserver(()=>{
        const text=(message.textContent||'').trim();const button=form?.querySelector('button[type="submit"]');
        if(/Account created\. Check your email|sent a confirmation email/i.test(text)){
          clearTimeout(signupTimer);if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Create account';}
          if(pane&&!document.getElementById('portalConfirmationState')){
            const email=document.getElementById('createEmail')?.value?.trim()||'your email address';
            const card=document.createElement('div');card.id='portalConfirmationState';card.className='result-box';card.style.marginTop='18px';
            card.innerHTML='<div class="kicker">Account created</div><h3 style="font-size:25px;margin:8px 0">Check your email to finish verification.</h3><p style="color:var(--muted)">A confirmation message was sent to <b style="color:var(--text)">'+escapeHtml(email)+'</b>. Click the confirmation link once, then return here and sign in.</p><div class="actions"><button id="portalReturnSignIn" class="btn primary" type="button">Return to sign in</button></div>';
            pane.appendChild(card);document.getElementById('portalReturnSignIn')?.addEventListener('click',()=>signInTab?.click());
          }
        }else if(text&&!/Creating account|Submitting account|Still working/i.test(text)){
          clearTimeout(signupTimer);if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Create account';}
        }
      });
      observer.observe(message,{childList:true,subtree:true,characterData:true});
    }
    const authParams=new URLSearchParams((location.hash||'').replace(/^#/,''));
    const authError=authParams.get('error_description')||authParams.get('error');
    if(authError&&message){message.textContent='Email verification could not complete: '+decodeURIComponent(authError.replace(/\+/g,' '))+'. Please return to sign in or request a fresh confirmation email.';message.style.color='#ffb5b5';}
  }

  // Improvement 10: informational pages always end with a context-aware next action.
  function injectNextStep(){
    if(isPortal||document.getElementById('nxNextStep'))return;
    const eligible=['/services','/case-studies','/security','/methodology','/about','/industries','/capabilities','/problems','/delivery-standard','/faq'];
    if(!eligible.includes(path))return;
    const footer=document.querySelector('footer.footer');if(!footer)return;
    const j=window.NexusJourney.get(),next=window.NexusJourney.next();
    const copy={
      '/services':['Not sure which service is actually justified?','Use the opportunity flow to identify the smallest responsible starting point.'],
      '/case-studies':['Want a result Nexus can measure responsibly?','Start by identifying the workflow and establishing the baseline before anyone promises an outcome.'],
      '/security':['Have a workflow that needs controlled implementation?','Nexus can assess the business value and the human, data, access, and fallback boundaries together.'],
      '/methodology':['Turn the method into a business decision.','Apply the Nexus process to one real workflow and carry the context into the next step.'],
      '/about':['See whether Nexus fits your business problem.','Start with the workflow—not an AI product or a sales package.']
    };
    const [headline,body]=copy[path]||['Turn the information into a next step.','Use the Nexus opportunity flow to move from browsing into a structured business decision.'];
    const rec=j.recommendation?.service?` Your diagnostic currently points to ${escapeHtml(j.recommendation.service)}.`:'';
    const section=document.createElement('section');section.id='nxNextStep';
    section.innerHTML=`<div class="wrap"><div class="nx-next-step"><div><div class="kicker">Next best action</div><h3>${headline}</h3><p>${body}${rec}</p></div><div class="actions"><a class="btn primary" href="${next.href}">${next.label} →</a>${j.stage==='new'?'<a class="btn secondary" href="/book">Request a Fit Call</a>':''}</div></div></div>`;
    footer.insertAdjacentElement('beforebegin',section);
  }

  // Booking success handoff should enter the evaluation workspace, not the generic portal entry point.
  if(path==='/book'){
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href="/portal"]');
      if(link&&/Continue to My Nexus Workspace/i.test(link.textContent||'')){
        event.preventDefault();location.href='/prospect-workspace';
      }
    });
  }


  // SMB journey v3: one obvious buying path and simpler buyer language.
  function injectSimpleCustomerJourney(){
    if(path!=='/'||document.getElementById('nxCustomerJourney'))return;
    const hero=document.querySelector('main .hero-section');if(!hero)return;
    const section=document.createElement('section');section.id='nxCustomerJourney';section.className='nx-customer-journey-section';
    section.innerHTML=`<div class="wrap"><div class="nx-journey-shell"><div class="nx-journey-head"><div class="kicker">The simplest way to start</div><h2>One path from curiosity to measurable improvement.</h2><p>You do not need to know which AI tool you need. Start with the business problem and move forward only when the evidence supports the next step.</p></div><div class="nx-journey-steps"><div><span>01</span><b>Free AI Snapshot</b><small>Five minutes to identify the strongest opportunities.</small></div><i>→</i><div><span>02</span><b>Request a Fit Call</b><small>Confirm whether the problem is worth investigating together.</small></div><i>→</i><div><span>03</span><b>Paid Opportunity Assessment</b><small>Establish the real workflow, baseline, risk, and priority.</small></div><i>→</i><div><span>04</span><b>Implement</b><small>Build the smallest controlled solution that is justified.</small></div><i>→</i><div><span>05</span><b>Measure & Improve</b><small>Compare the result to the baseline and expand only when it works.</small></div></div><div class="actions"><a class="btn primary" href="/quick-scan">Get My Free AI Snapshot →</a><a class="btn secondary" href="/book">Request a Fit Call</a></div></div></div>`;
    hero.insertAdjacentElement('afterend',section);
  }

  function simplifyQuickScanHandoff(){
    if(path!=='/quick-scan')return;
    const root=document.getElementById('snapshotBody');if(!root)return;
    const patch=()=>{
      root.querySelectorAll('a[href="/assessment"]').forEach(a=>{
        a.href='/book';
        if(/diagnostic|deeper|continue|assessment/i.test(a.textContent||''))a.textContent='Request a 20-Minute Fit Call →';
      });
      root.querySelectorAll('a[href="/book"]').forEach(a=>{
        if(/book/i.test(a.textContent||''))a.textContent=(a.textContent||'').replace(/Book/gi,'Request');
      });
      document.querySelectorAll('footer a[href="/assessment"]').forEach(a=>{a.href='/book';a.textContent='Request a Fit Call'});
    };
    patch();
    const observer=new MutationObserver(()=>patch());
    observer.observe(root,{childList:true,subtree:true});
  }

  function simplifyAssessmentPositioning(){
    if(path!=='/assessment'||document.getElementById('nxOptionalDiagnostic'))return;
    const hero=document.querySelector('main .wrap.hero');if(!hero)return;
    const note=document.createElement('div');note.id='nxOptionalDiagnostic';note.className='nx-optional-diagnostic';
    note.innerHTML='<b>Optional deeper diagnostic.</b><span>The Free AI Snapshot is enough to request a Fit Call. Use this page only when you want to provide more operating detail before the conversation.</span><a class="btn secondary" href="/book">Request a Fit Call →</a>';
    hero.appendChild(note);
  }

  function simplifyFitCallExperience(){
    if(path!=='/book'||document.getElementById('nxFitCallGuide'))return;
    document.title='Request a Nexus Fit Call | Nexus Intelligence';
    const hero=document.querySelector('main .wrap.hero');if(!hero)return;
    const eyebrow=hero.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='20-minute Nexus Fit Call';
    const h1=hero.querySelector('h1');if(h1)h1.innerHTML='Request a conversation.<br><span class="grad">Keep the process simple.</span>';
    const p=hero.querySelector('p');if(p)p.textContent='Tell Nexus what you want to improve, choose a preferred time, and submit the request. Your time is not considered confirmed until the calendar invitation is sent.';
    const guide=document.createElement('div');guide.id='nxFitCallGuide';guide.className='nx-fit-call-guide';
    guide.innerHTML='<div><span>1</span><b>Confirm your details</b><small>We carry forward your Snapshot when available.</small></div><div><span>2</span><b>Choose a preferred time</b><small>This is a request, not a false confirmation.</small></div><div><span>3</span><b>Receive the invitation</b><small>The meeting becomes confirmed when Nexus sends the calendar invite.</small></div>';
    hero.appendChild(guide);
  }

  function simplifySecurityPortalLanguage(){
    if(path!=='/security')return;
    document.querySelectorAll('p').forEach(p=>{
      if(/The portal is being built as an authenticated business workspace/i.test(p.textContent||''))p.textContent='The Nexus Client Portal is an authenticated business workspace, not a public document dropbox.';
    });
  }

  // Consent remains opt-in and honors Global Privacy Control.
  const consent=localStorage.getItem('nexus_cookie_consent');
  const banner=document.getElementById('cookieBanner');
  function loadHubSpot(){
    if(document.getElementById('hs-script-loader'))return;
    window._hsq=window._hsq||[];
    const s=document.createElement('script');s.id='hs-script-loader';s.async=true;s.defer=true;s.src='https://js.hs-scripts.com/247215482.js';document.body.appendChild(s);
  }
  const gpc=navigator.globalPrivacyControl===true;
  if(gpc&&!consent)safeStore('nexus_cookie_consent','declined');
  if(consent==='accepted'&&!gpc)loadHubSpot();
  if(!consent&&!gpc&&banner)banner.classList.add('show');
  document.getElementById('acceptCookies')?.addEventListener('click',()=>{safeStore('nexus_cookie_consent','accepted');banner?.classList.remove('show');loadHubSpot();});
  document.getElementById('declineCookies')?.addEventListener('click',()=>{safeStore('nexus_cookie_consent','declined');banner?.classList.remove('show');});
  document.querySelectorAll('[data-track]').forEach(el=>el.addEventListener('click',()=>window.nexusTrack(el.dataset.track)));

  injectSimpleCustomerJourney();
  simplifyQuickScanHandoff();
  simplifyAssessmentPositioning();
  simplifyFitCallExperience();
  simplifySecurityPortalLanguage();
  markActiveNavigation();
  injectServiceGuide();
  injectDetailRecommendation();
  injectProofExplorer();
  injectTrustCenter();
  enhancePortalSignup();
  injectPortalActionCenter();
  injectNextStep();
  renderJourneyUI();
})();
