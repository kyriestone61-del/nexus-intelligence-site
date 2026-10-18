import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = fs.readFileSync(new URL('nepsis-homepage.js', root), 'utf8');
const css = fs.readFileSync(new URL('nepsis-homepage.css', root), 'utf8');

test('Homepage contains only approved public experience and commercial sequence', () => {
  assert.match(html, /Nepsis Intelligence/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /Basic Diagnosis report/);
  assert.match(html, /Full Diagnosis report with the scoped implementation/);
  assert.doesNotMatch(html, /\$350|data-dialog|data-view|Local UI prototype|synthetic|instant unlock|Book Free Discovery/i);
  assert.match(html, /name="robots" content="index,follow"/);
  assert.match(html, /rel="canonical" href="https:\/\/nexusintelligence\.live\/"/);
  assert.match(html, /property="og:url" content="https:\/\/nexusintelligence\.live\/"/);
  assert.match(html, /data-nexus-schema="indexability"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /aria-controls="public-nav"/);
  const bookings = [...html.matchAll(/<a\b[^>]*href="\/book"[^>]*>(.*?)<\/a>/g)];
  assert.equal(bookings.length, 3);
  bookings.forEach(link => assert.equal(link[1], 'Schedule a free consultation'));
});

test('All local links, fragment targets and asset references resolve without external calls', () => {
  const redirects = fs.readFileSync(new URL('_redirects', root), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
  assert.equal(ids.size, [...html.matchAll(/\bid="([^"]+)"/g)].length);
  for (const [, target] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (target.startsWith('#')) { assert.ok(ids.has(target.slice(1)), target); continue; }
    if (target === 'https://nexusintelligence.live/') continue;
    assert.ok(target.startsWith('/'), `Unexpected external resource: ${target}`);
    if (target === '/') continue;
    const path = target.slice(1);
    const found = fs.existsSync(new URL(path, root)) || fs.existsSync(new URL(path + '.html', root)) || redirects.split('\n').some(line => line.startsWith(target + ' '));
    assert.ok(found, `Unresolved route/asset: ${target}`);
  }
  for (const route of ['/services', '/methodology', '/about', '/portal', '/book', '/privacy', '/terms', '/accessibility']) assert.ok(html.includes(`href="${route}"`));
  assert.match(redirects, /\/book https:\/\/calendar.app.google\/Tf4mfbREYbdR51BV7 302/);
});

test('Approved palette, typography, responsive breakpoints and focus affordances remain', () => {
  for (const token of ['#f7f3ea', '#082538', '#197884', 'Baskerville', 'Georgia', 'Avenir', ':focus-visible', 'prefers-reduced-motion', 'max-width: 960px', 'max-width: 760px', 'max-width: 440px']) assert.ok(css.includes(token), token);
  assert.match(css, /\.wordmark span \{/);
  assert.doesNotMatch(html, /src="\/app.js"|href="\/styles.css"|href="\/simple-site.css"/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|supabase/);
});

// Minimal DOM contract harness: no browser, networking or third-party code executes.
function harness({ storage = new Map(), gpc = false, storageBlocked = false } = {}) {
  const elements = new Map();
  function element(id) {
    const classes = new Set(); const handlers = new Map();
    const el = { id, attributes: {}, dataset: {}, textContent: '', focused: false,
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: x => { if (classes.has(x)) { classes.delete(x); return false; } classes.add(x); return true; } },
      addEventListener: (type, fn) => { const list = handlers.get(type) || []; list.push(fn); handlers.set(type, list); },
      dispatch: (type, event = {}) => (handlers.get(type) || []).forEach(fn => fn(event)),
      setAttribute: (key, value) => { el.attributes[key] = value; },
      contains: target => target === el || (el.links || []).includes(target),
      focus: () => { el.focused = true; }, querySelectorAll: () => el.links || []
    };
    elements.set(id, el); return el;
  }
  for (const id of ['public-menu-button', 'public-nav', 'cookieBanner', 'acceptCookies', 'declineCookies']) element(id);
  const link = element('nav-link'); link.dataset.track = 'nav_discovery';
  elements.get('public-nav').links = [link];
  const document = element('document');
  document.getElementById = id => elements.get(id) || null;
  document.querySelectorAll = () => [link];
  document.querySelector = () => null;
  document.createElement = () => element('');
  const loaded = [];
  document.body = { appendChild: node => { if (node.src) loaded.push(node.src); elements.set(node.id, node); } };
  const media = element('media'); const window = element('window'); window.matchMedia = () => media;
  const localStorage = { getItem: key => { if (storageBlocked) throw Error('Storage denied'); return storage.get(key) ?? null; }, removeItem: key => { if (storageBlocked) throw Error('Storage denied'); storage.delete(key); }, setItem: (key, value) => { if (storageBlocked) throw Error('Storage denied'); storage.set(key, value); } };
  vm.runInNewContext(script, { window, document, localStorage, navigator: { globalPrivacyControl: gpc }, location: { pathname: '/' }, Date, JSON });
  return { elements, storage, loaded, document, window, media, link, click: id => elements.get(id).dispatch('click') };
}

test('Fresh visit has no analytics; rejection persists and survives reload', () => {
  const h = harness(); assert.deepEqual(h.loaded, []); assert.ok(h.elements.get('cookieBanner').classList.contains('show'));
  h.click('declineCookies'); assert.equal(h.storage.get('nexus_cookie_consent'), 'declined'); assert.deepEqual(h.loaded, []);
  assert.equal(h.elements.get('cookieBanner').classList.contains('show'), false);
  const reload = harness({ storage: h.storage }); assert.deepEqual(reload.loaded, []); assert.equal(reload.elements.get('cookieBanner').classList.contains('show'), false);
});

test('Accept persists and loads only the existing analytics ID, once per page', () => {
  const h = harness(); h.click('acceptCookies'); h.click('acceptCookies');
  assert.equal(h.storage.get('nexus_cookie_consent'), 'accepted');
  assert.deepEqual(h.loaded, ['https://js.hs-scripts.com/247215482.js']);
  const reload = harness({ storage: h.storage }); assert.deepEqual(reload.loaded, h.loaded); assert.equal(reload.elements.get('cookieBanner').classList.contains('show'), false);
});

test('GPC suppresses analytics and banner, including previously accepted consent', () => {
  for (const consent of [undefined, 'accepted', 'declined']) {
    const storage = new Map(consent ? [['nexus_cookie_consent', consent]] : []);
    const h = harness({ storage, gpc: true });
    assert.deepEqual(h.loaded, []); assert.equal(h.elements.get('cookieBanner').classList.contains('show'), false);
    assert.equal(storage.get('nexus_cookie_consent'), consent || 'declined');
  }
});

test('Unavailable storage does not break navigation or opt-in consent', () => {
  const h = harness({ storageBlocked: true }); assert.deepEqual(h.loaded, []);
  h.click('public-menu-button'); assert.equal(h.elements.get('public-menu-button').attributes['aria-expanded'], 'true');
  h.click('declineCookies'); assert.deepEqual(h.loaded, []);
});

test('Menu repeated toggles, Escape/focus, outside click, link, viewport and history restore', () => {
  const h = harness(); const menu = h.elements.get('public-menu-button'); const nav = h.elements.get('public-nav');
  h.click('public-menu-button'); assert.equal(menu.attributes['aria-expanded'], 'true'); assert.equal(menu.textContent, 'Close');
  h.click('public-menu-button'); assert.equal(menu.attributes['aria-expanded'], 'false');
  h.click('public-menu-button'); h.document.dispatch('keydown', { key: 'Escape' }); assert.equal(nav.classList.contains('is-open'), false); assert.ok(menu.focused);
  for (const close of [() => h.document.dispatch('click', { target: {} }), () => h.link.dispatch('click'), () => h.media.dispatch('change'), () => h.window.dispatch('pageshow')]) {
    h.click('public-menu-button'); close(); assert.equal(menu.attributes['aria-expanded'], 'false'); assert.equal(menu.textContent, 'Menu'); assert.equal(nav.classList.contains('is-open'), false);
  }
  assert.equal(h.storage.has('nexus_event_queue'), false);
  assert.deepEqual(h.loaded, []);
});


test('CTA events and direct tracking remain opt-in; decline clears only the owned queue', () => {
  const storage = new Map([['another_product_key', 'keep']]);
  const h = harness({ storage });
  h.link.dispatch('click'); h.window.nexusTrack('direct');
  assert.equal(storage.has('nexus_event_queue'), false);
  h.click('acceptCookies'); h.link.dispatch('click');
  assert.equal(JSON.parse(storage.get('nexus_event_queue'))[0].name, 'nav_discovery');
  h.click('declineCookies'); h.link.dispatch('click'); h.window.nexusTrack('direct');
  assert.equal(storage.has('nexus_event_queue'), false);
  assert.equal(storage.get('another_product_key'), 'keep');
});

test('GPC blocks even direct Accept events and tracking with stale accepted consent', () => {
  const storage = new Map([['nexus_cookie_consent', 'accepted'], ['nexus_event_queue', '[{}]']]);
  const h = harness({ storage, gpc: true });
  h.click('acceptCookies'); h.link.dispatch('click'); h.window.nexusTrack('direct');
  assert.deepEqual(h.loaded, []);
  assert.equal(storage.has('nexus_event_queue'), false);
});

test('Previously declined and fresh visits discard stale analytics queue without tracking', () => {
  for (const consent of [undefined, 'declined']) {
    const storage = new Map([['nexus_event_queue', '[{}]']]);
    if (consent) storage.set('nexus_cookie_consent', consent);
    const h = harness({ storage }); h.link.dispatch('click');
    assert.equal(storage.has('nexus_event_queue'), false);
    assert.deepEqual(h.loaded, []);
  }
});
