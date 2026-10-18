/* BEGIN SHARED ANALYTICS CONSENT */
/* Shared consent bootstrap. Embedded into each independent entry script by
 * qa/scripts/sync-analytics-consent.mjs; do not edit embedded copies directly. */
(function () {
  if (window.NexusConsent) return;
  const CURRENT = 'nexus_cookie_consent', LEGACY = 'nexus_analytics_consent_v1';
  const owned = ['nexus_event_queue', 'nexus_first_touch_v1', 'nexus_last_touch_v1', 'nexus_anon_id_v1', 'nexus_session_id_v1'];
  let failedWrite = false, stopped = false;
  const gpc = () => navigator.globalPrivacyControl === true;
  function state() {
    if (gpc() || failedWrite) return 'declined';
    try {
      const current = localStorage.getItem(CURRENT), legacy = localStorage.getItem(LEGACY);
      if (current === 'declined' || legacy === 'declined') return 'declined';
      // A legacy-only acceptance cannot grant permission on the new site.
      return current === 'accepted' && (legacy === null || legacy === 'accepted') ? 'accepted' : null;
    } catch { return null; }
  }
  function clear() {
    for (const key of owned) { try { localStorage.removeItem(key); } catch {} }
  }
  function stop() {
    clear();
    // Removing a script does not stop code already running. Use the vendor's
    // documented opt-out API; do not load the vendor merely to opt out.
    if (!stopped && window._hsq) {
      window._hsq.push(['revokeCookieConsent']);
      window._hsq.push(['doNotTrack']);
      stopped = true;
    }
  }
  function allowed() {
    if (state() === 'accepted') return true;
    stop();
    return false;
  }
  function set(value) {
    const next = value === 'accepted' && !gpc() ? 'accepted' : 'declined';
    // Fail closed if either write is blocked. Never keep an in-memory opt-in
    // when another route could read a stale, contradictory preference.
    failedWrite = true;
    let failures = 0;
    for (const key of [CURRENT, LEGACY]) {
      try { localStorage.setItem(key, next); } catch { failures++; }
    }
    failedWrite = failures > 0;
    if (failedWrite) {
      // A partially saved acceptance must not survive the next navigation.
      for (const key of [CURRENT, LEGACY]) { try { localStorage.removeItem(key); } catch {} }
    }
    if (!allowed()) stop();
    return allowed();
  }
  function loadHubSpot() {
    if (!allowed()) return;
    window._hsq = window._hsq || [];
    if (stopped) { window._hsq.push(['doNotTrack', { track: true }]); stopped = false; }
    if (document.getElementById('hs-script-loader')) return;
    const script = document.createElement('script');
    script.id = 'hs-script-loader'; script.async = true; script.defer = true;
    script.src = 'https://js.hs-scripts.com/247215482.js';
    document.body.appendChild(script);
  }
  function bindBanner() {
    const converted = Boolean(document.getElementById('public-nav'));
    const secondaryClass = converted ? 'secondary-button' : 'btn secondary';
    let banner = document.getElementById('cookieBanner');
    // The authenticated portal has no public footer/banner. Provide the same
    // narrow consent controls without changing its application or login UI.
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'cookieBanner'; banner.className = 'cookie';
      banner.setAttribute('role', 'dialog'); banner.setAttribute('aria-label', 'Analytics consent');
      const text = document.createElement('p');
      text.textContent = 'Optional analytics loads only if you accept.';
      banner.appendChild(text);
      const actions = document.createElement('div'); actions.className = 'cookie-actions';
      for (const [id, label] of [['declineCookies', 'Decline'], ['acceptCookies', 'Accept']]) {
        const control = document.createElement('button');
        control.id = id; control.type = 'button'; control.textContent = label;
        control.className = id === 'acceptCookies' ? (converted ? 'button' : 'btn primary') : secondaryClass;
        actions.appendChild(control);
      }
      banner.appendChild(actions); document.body.appendChild(banner);
    }
    const accept = document.getElementById('acceptCookies');
    const decline = document.getElementById('declineCookies');
    if (banner.dataset.consentBound) return;
    banner.dataset.consentBound = 'true';
    if (!state()) banner.classList.add('show');
    if (gpc()) { try { if (!localStorage.getItem(CURRENT)) set('declined'); } catch {} }
    let settingsOpen = false;
    const close = () => {
      banner.classList.remove('show');
      if (settingsOpen) document.getElementById('analytics-cookie-settings')?.focus();
      settingsOpen = false;
    };
    accept?.addEventListener('click', () => { if (set('accepted')) loadHubSpot(); close(); });
    decline?.addEventListener('click', () => { set('declined'); close(); });
    if (!document.getElementById('analytics-cookie-settings')) {
      const footer = document.querySelector('footer');
      const button = document.createElement('button');
      button.id = 'analytics-cookie-settings'; button.type = 'button'; button.className = secondaryClass;
      button.textContent = 'Cookie settings';
      button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'cookieBanner');
      if (!footer) button.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:80');
      button.addEventListener('click', () => {
        settingsOpen = true;
        if (accept) accept.disabled = gpc();
        banner.classList.add('show');
        (gpc() ? decline : accept)?.focus();
      });
      (footer || document.body).appendChild(button);
    }
    loadHubSpot();
  }
  window.NexusConsent = { allowed, state, set, clear, loadHubSpot, bindBanner };
  window.addEventListener('storage', () => { allowed(); });
  window.addEventListener('pageshow', () => { allowed(); });
  document.addEventListener('visibilitychange', () => { allowed(); });
  allowed();
})();
/* END SHARED ANALYTICS CONSENT */
/* Converted Nepsis public pages only. Legacy shared app remains unchanged elsewhere. */
(function () {
  'use strict';
  const safeParse=(value,fallback={})=>{try{return JSON.parse(value)||fallback}catch{return fallback}};
  const safeStore=(key,value)=>{try{localStorage.setItem(key,value);return true}catch{return false}};
  const analyticsAllowed=()=>window.NexusConsent.allowed();
  window.nexusTrack=function(name,props={}){
    if(!analyticsAllowed())return;
    try{
      const e={name,props,path:location.pathname,ts:new Date().toISOString()};
      const q=safeParse(localStorage.getItem('nexus_event_queue')||'[]',[]);q.push(e);
      safeStore('nexus_event_queue',JSON.stringify(q.slice(-200)));
    }catch{}
  };

  const menu = document.getElementById('public-menu-button');
  const nav = document.getElementById('public-nav');
  const desktop = window.matchMedia('(min-width: 961px)');
  function closeMenu(restoreFocus = false) {
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.textContent = 'Menu';
    if (restoreFocus) menu.focus();
  }
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menu.setAttribute('aria-expanded', String(open));
    menu.textContent = open ? 'Close' : 'Menu';
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !menu.contains(event.target)) closeMenu();
  });
  desktop.addEventListener('change', () => closeMenu());
  window.addEventListener('pageshow', () => closeMenu());

  window.NexusConsent.bindBanner();
  document.querySelectorAll('[data-track]').forEach(el=>el.addEventListener('click',()=>window.nexusTrack(el.dataset.track)));


})();
