import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const pages = ['services', 'methodology', 'about', 'construction', 'faq'];
const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(read('functions/_middleware.js')).toString('base64'));

for (const page of pages) {
  const html = read(page + '.html');
  test(`${page}: complete Nepsis shell, opt-in runtime and accessible navigation contract`, () => {
    assert.match(html, /<title>[^<]+Nepsis Intelligence<\/title>/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<main\b/g) || []).length, 1);
    assert.match(html, /<main id="main-content" tabindex="-1">/);
    if (page !== 'construction') assert.match(html, new RegExp(`href="/${page}" aria-current="page"`));
    assert.match(html, /aria-controls="public-nav"/);
    assert.match(html, /id="public-nav"/);
    assert.match(html, /id="acceptCookies"/);
    assert.match(html, /id="declineCookies"/);
    assert.match(html, /name="robots" content="index,follow"/);
    assert.match(html, new RegExp(`rel="canonical" href="https://nexusintelligence\\.live/${page}"`));
    assert.match(html, new RegExp(`property="og:url" content="https://nexusintelligence\\.live/${page}"`));
    assert.match(html, /data-nexus-schema="indexability"/);
    assert.match(html, /href="\/nepsis-homepage.css"/);
    assert.match(html, /href="\/nepsis-public-pages.css"/);
    assert.deepEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(x => x[1]), ['/nepsis-homepage.js']);
    assert.doesNotMatch(html, /Relystra|Nexus Intelligence|\$\d|Book Free Discovery|data-offer-ladder|commercial-offers|\/app\.js|\/styles\.css/);
    for (const match of html.matchAll(/<a\b[^>]*href="\/book"[^>]*>(.*?)<\/a>/gs)) assert.equal(match[1], 'Schedule a free consultation');
    for (const token of ['Basic Diagnosis', 'Full Diagnosis', 'implementation', 'acceptance', 'support']) assert.ok(html.includes(token), token);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), id);
    for (const [, asset] of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+|[^"/?#]+\.(?:css|js))"/g)) assert.ok(fs.existsSync(new URL(asset, root)), asset);
  });
  test(`${page}: actual middleware preserves page and security headers for converted aliases`, async () => {
    globalThis.HTMLRewriter = class { constructor() { throw Error('Legacy injection must not run'); } };
    for (const route of [`/${page}`, `/${page}/`, `/${page}.html`, `/${page}.html/`, `/${page}?ref=review`]) {
      for (const host of ['local.test', 'review.project.pages.dev']) {
        const result = await onRequest({ request: new Request(`https://${host}${route}`), next: async () => new Response(html, { headers: { 'content-type': 'text/html', 'x-existing': 'retained' } }) });
        assert.equal(await result.text(), html);
        assert.equal(result.headers.get('X-Robots-Tag'), host.endsWith('.pages.dev') ? 'noindex' : null);
        assert.equal(result.headers.get('X-Frame-Options'), 'DENY');
        assert.equal(result.headers.get('x-existing'), 'retained');
        assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff');
        assert.match(result.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
        assert.equal(result.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
      }
    }
  });
}

test('Founder facts and original photographs remain grounded in the existing profile', () => {
  const about = read('about.html');
  for (const fact of ['Delaware-based project engineer', '4+ years', 'submittals', 'RFIs', 'document control', 'subcontractor coordination', 'site-safety', 'OSHA 30 training', 'Bluebeam', 'AutoCAD', '/assets/kyrie-founder-primary.webp', '/assets/kyrie-founder-secondary.webp']) assert.ok(about.includes(fact), fact);
  assert.doesNotMatch(about, /certified|certification|guaranteed savings/i);
});

test('Methodology distinguishes report QA and release from implementation acceptance', () => {
  const html = read('methodology.html');
  assert.match(html, /QA, resolve issues and explicitly release/);
  assert.match(html, /implementation acceptance against the agreed criteria/);
  assert.match(html, /Scope the Full Diagnosis and implementation together/);
});

test('Page additions are scoped and include narrow-screen layout', () => {
  const css = read('nepsis-public-pages.css');
  assert.match(css, /\.nepsis-public-page/);
  assert.match(css, /max-width: 760px/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.doesNotMatch(css, /@import|url\(https:/);
});


test('FAQ uses native keyboard-accessible disclosures without another runtime', () => {
  const html = read('faq.html');
  const details = [...html.matchAll(/<details>([\s\S]*?)<\/details>/g)];
  assert.equal(details.length, 13);
  for (const [, content] of details) {
    assert.match(content, /^<summary>[^<]+<\/summary><div class="faq-answer"><p>.+<\/p><\/div>$/);
  }
  assert.doesNotMatch(html, /role="button"|onclick=|tabindex="0"/);
  assert.match(html, /Full Diagnosis report and scoped implementation form one paid engagement/);
  assert.match(html, /A released report does not mean an implementation has been accepted/);
  assert.doesNotMatch(html, /Starting prices|\$350|only for construction|current specialization/i);
});

test('Construction retains grounded workflow examples without size or geography restrictions', () => {
  const html = read('construction.html');
  for (const token of ['Bid intake', 'RFIs', 'submittals', 'Daily reports', 'warranty information', 'Invoice status', 'standard operating procedures']) assert.ok(html.includes(token), token);
  assert.match(html, /Illustrative example/);
  assert.doesNotMatch(html, /5[–-]50|South Jersey|Southeast Pennsylvania|Delaware|Construction first|Free AI Snapshot|guaranteed savings/i);
});

test('Converted public page links and assets resolve locally or through a declared redirect', () => {
  const redirects = read('_redirects');
  const exactRedirects = new Set(redirects.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.split(/\s+/)[0]));
  for (const page of ['index', ...pages]) {
    const html = read(page + '.html');
    assert.match(html, /href="\/faq"/);
    for (const [, href] of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
      if (href === `https://nexusintelligence.live/${page === 'index' ? '' : page}`) continue;
      assert.ok(href.startsWith('/'), `${page}: unexpected external resource ${href}`);
      const path = href.split(/[?#]/)[0];
      const resource = path === '/' ? 'index.html' : path.slice(1);
      assert.ok(fs.existsSync(new URL(resource, root)) || fs.existsSync(new URL(resource + '.html', root)) || exactRedirects.has(path), `${page}: missing ${href}`);
    }
  }
});

test('Retired industry aliases still lead to the converted construction route', async () => {
  for (const route of ['/industries', '/industries/', '/industries.html', '/industries/commercial']) {
    let nextCalled = false;
    const result = await onRequest({ request: new Request('https://local.test' + route), next: async () => { nextCalled = true; return new Response('unused'); } });
    assert.equal(result.status, 301);
    assert.equal(result.headers.get('location'), 'https://local.test/construction');
    assert.equal(nextCalled, false);
  }
});

test('New converted routes preserve error responses and do not rewrite non-HTML content', async () => {
  globalThis.HTMLRewriter = class { constructor() { throw Error('Legacy injection must not run'); } };
  for (const page of ['construction', 'faq']) {
    for (const [status, type, body] of [[404, 'text/html', '<h1>Not found</h1>'], [503, 'text/html', '<h1>Unavailable</h1>'], [200, 'text/plain', 'plain response']]) {
      const result = await onRequest({ request: new Request('https://local.test/' + page), next: async () => new Response(body, { status, headers: { 'content-type': type } }) });
      assert.equal(result.status, status);
      assert.equal(await result.text(), body);
      assert.equal(result.headers.get('X-Frame-Options'), 'DENY');
      if (status >= 400) assert.equal(result.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
      else assert.equal(result.headers.get('X-Robots-Tag'), null);
    }
  }
});
