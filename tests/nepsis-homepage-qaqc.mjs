import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = fs.readFileSync(new URL('nepsis-homepage.js', root), 'utf8');
const css = fs.readFileSync(new URL('nepsis-homepage.css', root), 'utf8');
const headers = fs.readFileSync(new URL('_headers', root), 'utf8');

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
  // The shared header keeps the cross-page nav label; homepage body CTAs use the approved wording.
  const header = html.match(/<header\b[\s\S]*?<\/header>/)[0];
  const main = html.match(/<main\b[\s\S]*?<\/main>/)[0];
  assert.deepEqual([...header.matchAll(/<a\b[^>]*href="\/book"[^>]*>(.*?)<\/a>/g)].map(link => link[1]), ['Schedule a free consultation']);
  const mainBookings = [...main.matchAll(/<a\b[^>]*href="\/book"[^>]*>(.*?)<\/a>/g)].map(link => link[1]);
  assert.deepEqual(mainBookings, ['Book a free consultation', 'Book a free consultation']);
  assert.doesNotMatch(main, /Schedule a free consultation/);
  const consultationLinks = [...html.matchAll(/<a\b([^>]*)>([^<]*free consultation)<\/a>/gi)];
  assert.equal(consultationLinks.length, 3);
  for (const [, attributes, label] of consultationLinks) assert.match(attributes, /\bhref="\/book"/, label);
});

test('Homepage leads with the approved category, headline and free/optional-paid boundary', () => {
  const text = value => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  assert.match(html, /<title>Nepsis Intelligence \| Workflow Consulting for Owner-Led Small Businesses<\/title>/);
  assert.doesNotMatch(html, /Practical Construction Systems|Make everyday|operations work better/);
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
  assert.equal(text(h1[1]), 'Know what to fix before you pay to change it.');
  const hero = html.match(/<section class="hero[^"]*"[\s\S]*?<\/section>/)[0];
  assert.ok(text(hero).includes('Workflow consulting for owner-led small businesses.'));
  assert.ok(text(hero).includes('where work gets delayed, repeated or lost'));
  const primary = hero.match(/<a class="button"[^>]*>(.*?)<\/a>/);
  assert.match(primary[0], /href="\/book"/);
  assert.equal(primary[1], 'Book a free consultation');
  assert.match(hero, /<a class="text-link" href="\/services">See workflow examples<\/a>/);
  assert.ok(text(hero).includes('Free: the consultation, including a written Basic Diagnosis.'));
  assert.ok(text(hero).includes('Optional: a paid Full Diagnosis and scoped implementation, agreed before any paid work starts.'));
  for (const meta of [/name="description" content="([^"]+)"/, /property="og:title" content="([^"]+)"/, /property="og:description" content="([^"]+)"/, /"description":"([^"]+)"/]) {
    const value = html.match(meta)[1];
    assert.doesNotMatch(value, /construction businesses/i);
  }
  assert.match(html.match(/name="description" content="([^"]+)"/)[1], /owner-led small businesses/);
  assert.match(html.match(/property="og:description" content="([^"]+)"/)[1], /owner-led small businesses/);
  assert.match(html.match(/"description":"([^"]+)"/)[1], /owner-led small businesses/);
  assert.doesNotMatch(html, /guaranteed (fix|result|savings)|we guarantee|testimonial|case study|\$\d|always (identif|find|recommend)/i);
  assert.match(html, /Examples do not guarantee results\./);
});

test('Hero shows a labelled illustrative Basic Diagnosis, not a client result, with exactly three evidence statements', () => {
  const text = value => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const panel = html.match(/<aside class="diagnosis-panel" aria-labelledby="diagnosis-title">([\s\S]*?)<\/aside>/);
  assert.ok(panel, 'diagnosis panel');
  assert.match(panel[1], /<h2 id="diagnosis-title">Illustrative Basic Diagnosis<\/h2>/);
  assert.match(text(panel[1]), /Illustrative example · Not a client result/);
  const items = [...panel[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(item => text(item[1]));
  assert.deepEqual(items, [
    'What we know: Requests arrive by phone and form and are tracked separately.',
    'What we suspect: Requests can wait without a named next owner.',
    'What still needs checking: Who takes over when the first person is unavailable?'
  ]);
  for (const statement of items) assert.equal(text(html).split(statement).length - 1, 1, statement);
  assert.doesNotMatch(panel[1], /<img\b|steps-panel|hero-steps/);
  assert.doesNotMatch(text(panel[1]), /recommend|we will fix|result:/i);
  assert.doesNotMatch(html.match(/<section class="hero[\s\S]*?<\/section>/)[0], /kyrie-founder/);
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

test('Homepage publishes the three approved workflow videos with local media, captions and transcripts', () => {
  const section = html.match(/<section class="content-section section-shell workflow-videos-section"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'workflow video section');
  assert.match(section, /See the workflow, not just the claim\./);
  assert.equal((section.match(/<article class="workflow-video-card">/g) || []).length, 3);
  assert.equal((section.match(/<video\b/g) || []).length, 3);
  assert.equal((section.match(/<track kind="captions"/g) || []).length, 3);
  assert.equal((section.match(/<details class="workflow-transcript"/g) || []).length, 3);
  for (const asset of [...section.matchAll(/(?:src|poster)="(\/assets\/workflow-walkthroughs\/[^"]+)"/g)].map(match => match[1])) {
    assert.ok(fs.existsSync(new URL(asset.slice(1), root)), asset);
  }
  for (const title of ['Where the Estimate Actually Stops', 'Requested Is Not Collected', 'The Handoff Test Most Demos Skip']) assert.ok(section.includes(title), title);
  assert.match(headers, /\/assets\/workflow-walkthroughs\/\*\.vtt\s+Content-Type: text\/vtt; charset=utf-8/);
  assert.doesNotMatch(section, /not a real example|fictional|mock client|sample client|disclaimer/i);
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
  const frames = []; window.requestAnimationFrame = fn => frames.push(fn);
  const localStorage = { getItem: key => { if (storageBlocked) throw Error('Storage denied'); return storage.get(key) ?? null; }, removeItem: key => { if (storageBlocked) throw Error('Storage denied'); storage.delete(key); }, setItem: (key, value) => { if (storageBlocked) throw Error('Storage denied'); storage.set(key, value); } };
  vm.runInNewContext(script, { window, document, localStorage, navigator: { globalPrivacyControl: gpc }, location: { pathname: '/' }, Date, JSON });
  return { elements, storage, loaded, document, window, media, link, click: id => elements.get(id).dispatch('click'), flushFrames: () => frames.splice(0).forEach(fn => fn()) };
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

test('Breakpoint recovery retains a still-focused link when hiding emits no blur', () => {
  const h = harness();
  const menu = h.elements.get('public-menu-button');
  h.link.isConnected = true;
  h.document.activeElement = h.link;
  h.document.dispatch('focusin', { target: h.link });
  h.media.matches = true;
  h.media.dispatch('change');
  // Simulate layout hiding the link and dropping focus to body without focusout.
  h.document.activeElement = h.document.body;
  h.media.matches = false;
  h.media.dispatch('change');
  assert.equal(menu.focused, true);
});

test('Resize recovers hidden navigation when breakpoint change events are coalesced', () => {
  const h = harness();
  h.link.isConnected = true;
  h.link.getClientRects = () => [];
  h.document.activeElement = h.link;
  h.document.dispatch('focusin', { target: h.link });
  // Layout crossed desktop and returned to mobile without a media change event.
  h.media.matches = false;
  h.document.activeElement = h.document.body;
  h.document.dispatch('focusout', { target: h.link, relatedTarget: null });
  h.window.dispatch('resize');
  h.flushFrames();
  assert.equal(h.elements.get('public-menu-button').focused, true);
});
