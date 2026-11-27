// Offline behavioral check for basic-report.js recovery handling.
// Loads the real client module against in-memory browser globals. No browser, no network.
// The sibling ./portal-discovery-evidence.js import is substituted with a stub that fails if used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const RECOVERY = 'This report link is no longer available. Contact the Nepsis person who shared it to request a new link. Please don’t forward the old link.';
const RETRY = 'Your decision may have been saved. Refresh the same report before retrying.';
const TOKEN = 'b'.repeat(32) + 'fedcba9876543210fedcba9876543210';
const CLIENT = new URL('../../basic-report.js', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(CLIENT)) {
      if (specifier === './portal-discovery-evidence.js') return {url: 'stub:portal-discovery-evidence', shortCircuit: true};
      throw new Error(`UNEXPECTED_CLIENT_IMPORT ${specifier}`);
    }
    if (specifier.startsWith(CLIENT)) return {url: specifier, shortCircuit: true};
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'stub:portal-discovery-evidence') return {format: 'module', shortCircuit: true, source: 'export function freeReportMarkup(){throw new Error("UNEXPECTED_FREE_REPORT_RENDER")}'};
    if (url.startsWith(CLIENT)) return {format: 'module', shortCircuit: true, source: nextLoad(CLIENT.split('?')[0], {...context, format: 'module'}).source};
    return nextLoad(url, context);
  },
});

let run = 0;
async function loadClient({hash = '', stored = null, respond}) {
  const fetches = [];
  let settle;
  const rendered = new Promise(resolve => { settle = resolve; });
  const root = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(value) { this._html = value; settle(value); },
    addEventListener() {},
    querySelectorAll() { return []; },
  };
  const store = new Map(stored ? [['relystra_basic_report', stored]] : []);
  globalThis.document = {getElementById: id => (id === 'report' ? root : null)};
  globalThis.location = {hash, pathname: '/basic-report', search: '', assign() { throw new Error('UNEXPECTED_NAVIGATION'); }};
  globalThis.history = {replaceState() {}};
  globalThis.sessionStorage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)};
  globalThis.fetch = async (url, init) => {
    fetches.push({url, init});
    if (!respond) throw new Error('NETWORK_DISABLED_IN_TEST');
    return respond();
  };
  await import(`${CLIENT}?scenario=${++run}`);
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('render timeout')), 2000); });
  const html = await Promise.race([rendered, timeout]).finally(() => clearTimeout(timer));
  return {html, fetches};
}

const parserText = body => { try { JSON.parse(body); } catch (error) { return error.message; } return null; };

test('missing token renders exact recovery copy without fetching', async () => {
  const {html, fetches} = await loadClient({});
  assert.equal(fetches.length, 0);
  assert.ok(html.includes(RECOVERY), html);
});

for (const [label, body] of [['HTML', '<html><body>Bad gateway</body></html>'], ['empty', ''], ['truncated JSON', '{"error":']]) {
  test(`malformed ${label} 502 body renders recovery copy, not parser text`, async () => {
    const {html, fetches} = await loadClient({hash: `#report=${TOKEN}`, respond: () => new Response(body, {status: 502, headers: {'content-type': 'application/json'}})});
    assert.equal(fetches.length, 1);
    assert.ok(html.includes(RECOVERY), html);
    const raw = parserText(body);
    assert.ok(raw && !html.includes(raw), 'raw parser message must not render');
    for (const leak of ['Unexpected', 'JSON', 'SyntaxError', 'Bad gateway']) assert.ok(!html.includes(leak), `leaked ${leak}`);
  });
}

for (const [label, body] of [['null', 'null'], ['array', '[]']]) {
  test(`non-object JSON ${label} body renders recovery copy`, async () => {
    const {html} = await loadClient({hash: `#report=${TOKEN}`, respond: () => new Response(body, {status: 502})});
    assert.ok(html.includes(RECOVERY), html);
    assert.ok(!/TypeError|Cannot read/.test(html), html);
  });
}

test('valid JSON error message is preserved (transient retry)', async () => {
  const {html} = await loadClient({hash: `#report=${TOKEN}`, respond: () => new Response(JSON.stringify({error: 'RETRY', message: RETRY}), {status: 503})});
  assert.ok(html.includes(RETRY), html);
  assert.ok(!html.includes(RECOVERY));
});

test('error JSON without usable message falls back to recovery copy', async () => {
  const {html} = await loadClient({stored: TOKEN, respond: () => new Response(JSON.stringify({error: 'REPORT_UNAVAILABLE', message: '  '}), {status: 404})});
  assert.ok(html.includes(RECOVERY), html);
});

test('request shape is unchanged and a valid report still renders', async () => {
  const report = {
    company_name: 'Synthetic Co', heard: 'Synthetic heard', bottleneck: 'Synthetic bottleneck', checkout_available: false,
    primary: {name: 'Synthetic build', offer_name: 'Synthetic offer', outcome: 'Synthetic outcome', price_cents: 100000, deposit_cents: 50000, currency: 'usd', duration_min: 5, duration_max: 10, scope_in: [], deliverables: [], inputs: [], scope_out: []},
    later: [],
  };
  const {html, fetches} = await loadClient({hash: `#report=${TOKEN}`, respond: () => new Response(JSON.stringify({ok: true, report}), {status: 200})});
  assert.equal(fetches.length, 1);
  const [{url, init}] = fetches;
  assert.equal(url, '/api/basic-report');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, {'content-type': 'application/json'});
  assert.deepEqual(JSON.parse(init.body), {token: TOKEN, operation: 'view'});
  assert.ok(html.includes('Prepared for Synthetic Co'), html);
  assert.ok(html.includes('data-decision="accept"'));
  assert.ok(!html.includes(RECOVERY));
});
