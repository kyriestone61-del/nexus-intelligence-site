import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const source = fs.readFileSync(new URL('functions/_middleware.js', root), 'utf8');
const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function context(path, body = html, status = 200) {
  return { request: new Request('https://local.test' + path), next: async () => new Response(body, { status, headers: { 'content-type': 'text/html', 'x-test-header': 'retained' } }) };
}

test('Real middleware homepage response preserves exact Nepsis HTML and production indexing headers', async () => {
  globalThis.HTMLRewriter = class { constructor() { throw Error('Legacy transformation must not run on homepage'); } };
  for (const route of ['/', '/?source=test', '/index', '/index.html', '/index.html/']) {
    const result = await onRequest(context(route));
    assert.equal(await result.text(), html, route);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('X-Robots-Tag'), null);
    assert.equal(result.headers.get('x-test-header'), 'retained');
    assert.equal(result.headers.get('X-Frame-Options'), 'DENY');
    assert.match(result.headers.get('Content-Security-Policy'), /default-src 'self'/);
  }
  const preview = context('/'); preview.request = new Request('https://branch.project.pages.dev/');
  assert.equal((await onRequest(preview)).headers.get('X-Robots-Tag'), 'noindex');
  const error = await onRequest(context('/', '<h1>Unavailable</h1>', 503));
  assert.equal(error.status, 503); assert.equal(await error.text(), '<h1>Unavailable</h1>');
  assert.equal(error.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
});

test('Other marketing, private and legal pages retain existing rewrite pipeline and headers', async () => {
  let handlers;
  globalThis.HTMLRewriter = class {
    constructor() { handlers = []; }
    on(selector, handler) { handlers.push({ selector, handler }); return this; }
    transform(response) { return response; }
  };
  for (const route of ['/security', '/construction/project', '/faq/extra', '/construction//', '/faq.html//', '/about/team', '/methodology-notes', '/about//', '/about.html//', '/service-detail', '/privacy', '/terms', '/accessibility', '/portal']) {
    const result = await onRequest(context(route, '<html><head></head><body><main>Existing page</main></body></html>'));
    assert.ok(handlers.some(x => x.selector === 'body'), route);
    assert.ok(handlers.some(x => x.selector === 'head'), route);
    let appended = '';
    handlers.find(x => x.selector === 'body').handler.element({ append: value => { appended += value; } });
    assert.match(appended, /launch-readiness.js/); assert.match(appended, /phase-five.js/);
    if (['/privacy', '/terms', '/accessibility', '/portal'].includes(route)) assert.equal(result.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
  }
});

test('Delivery Standard owns its Nepsis metadata and bypasses legacy launch injectors', async () => {
  const delivery = fs.readFileSync(new URL('delivery-standard.html', root), 'utf8');
  globalThis.HTMLRewriter = class { constructor() { throw Error('Legacy transformation must not run on Delivery Standard'); } };
  for (const route of ['/delivery-standard', '/delivery-standard/', '/delivery-standard.html', '/delivery-standard.html/']) {
    const result = await onRequest(context(route, delivery));
    assert.equal(await result.text(), delivery, route);
    assert.equal(result.headers.get('X-Robots-Tag'), null, route);
    assert.equal(result.headers.get('X-Frame-Options'), 'DENY', route);
  }
});

test('Retired public routes and non-HTML responses are unchanged', async () => {
  for (const [from, to] of [['/quick-scan', '/book'], ['/assessment', '/book'], ['/case-studies', '/methodology'], ['/capabilities', '/services']]) {
    const result = await onRequest(context(from));
    assert.equal(result.status, 301); assert.equal(result.headers.get('location'), 'https://local.test' + to);
  }
  const c = context('/nepsis-homepage.css'); c.next = async () => new Response('body {}', { headers: { 'content-type': 'text/css' } });
  assert.equal(await (await onRequest(c)).text(), 'body {}');
});
