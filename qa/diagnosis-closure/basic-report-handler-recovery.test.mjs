// Offline regression for the Basic Report handler recovery copy.
// Loads the real local handler and its real checkout/payments/stripe import chain.
// Only the two external packages are substituted with deterministic in-memory stubs;
// every other remote import throws, and Stripe/fetch fail if they are ever reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks,stripTypeScriptTypes} from 'node:module';

const RECOVERY = 'This report link is no longer available. Contact the Nepsis person who shared it to request a new link. Please don’t forward the old link.';
const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const SHARED = new URL('../../supabase/functions/_shared/', import.meta.url);
const REAL_FILES = ['relystra-basic-report-handler.ts', 'relystra-checkout-handler.ts', 'relystra-payments.ts', 'relystra-stripe.ts'].map(name => new URL(name, SHARED).href);
const STUBS = {'jsr:@supabase/supabase-js@2': 'stub:supabase', 'npm:stripe@22.6.1': 'stub:stripe'};

const activity = {createClient: 0, rpc: [], from: 0, lookups: [], stripe: 0, fetch: 0, loaded: new Set()};
let rpcResult = {data: null, error: null};
// Synthetic nexus_delivery_settings lookup result; 'throw' makes the lookup reject.
let settingsResult = {data: null, error: null};

globalThis.Deno = {env: {get: key => ({
  SUPABASE_URL: 'http://synthetic.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
  SUPABASE_ANON_KEY: 'synthetic-anon',
  RELYSTRA_PORTAL_ORIGIN: 'https://synthetic.invalid',
})[key]}};
globalThis.fetch = () => { activity.fetch++; throw new Error('NETWORK_DISABLED_IN_TEST'); };
globalThis.__basicReportStubs = {
  createClient() {
    activity.createClient++;
    return {
      rpc: async (name, args) => { activity.rpc.push({name, args}); return rpcResult; },
      // Records the exact availability lookup chain so a wrong table/column/filter cannot
      // hide behind the handler's fail-closed catch and still look like "unknown".
      from(table) {
        activity.from++;
        const lookup = {table};
        activity.lookups.push(lookup);
        return {select(columns) {
          lookup.select = columns;
          return {eq(column, value) {
            lookup.eq = [column, value];
            return {async maybeSingle() {
              lookup.maybeSingle = (lookup.maybeSingle ?? 0) + 1;
              if (settingsResult === 'throw') throw new Error('synthetic lookup failure');
              return settingsResult;
            }};
          }};
        }};
      },
      auth: {getUser() { throw new Error('UNEXPECTED_AUTH'); }},
    };
  },
  Stripe: class StripeStub {
    constructor() { activity.stripe++; throw new Error('STRIPE_DISABLED_IN_TEST'); }
    static createFetchHttpClient() { activity.stripe++; throw new Error('STRIPE_DISABLED_IN_TEST'); }
  },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(STUBS, specifier)) return {url: STUBS[specifier], shortCircuit: true};
    if (specifier.startsWith('./') && context.parentURL && REAL_FILES.includes(context.parentURL)) {
      const url = new URL(specifier, context.parentURL).href;
      if (!REAL_FILES.includes(url)) throw new Error(`UNEXPECTED_LOCAL_IMPORT ${specifier}`);
      return {url, shortCircuit: true};
    }
    if (context.parentURL && REAL_FILES.includes(context.parentURL)) throw new Error(`UNEXPECTED_REMOTE_IMPORT ${specifier}`);
    if (/^(jsr|npm|https?|data|blob|stub):/.test(specifier)) throw new Error(`UNEXPECTED_REMOTE_IMPORT ${specifier}`);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'stub:supabase') return {format: 'module', shortCircuit: true, source: 'export const createClient=(...a)=>globalThis.__basicReportStubs.createClient(...a);'};
    if (url === 'stub:stripe') return {format: 'module', shortCircuit: true, source: 'export default globalThis.__basicReportStubs.Stripe;'};
    if (REAL_FILES.includes(url)) {
      activity.loaded.add(url);
      return {format: 'module', shortCircuit: true, source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), {mode: 'strip'})};
    }
    return nextLoad(url, context);
  },
});

const {handleBasicReport} = await import(REAL_FILES[0]);

const reset = (result, settings = {data: null, error: null}) => {
  rpcResult = result; settingsResult = settings;
  activity.createClient = 0; activity.rpc = []; activity.from = 0; activity.lookups = [];
};
const call = () => handleBasicReport(new Request('https://synthetic.invalid/api/basic-report', {
  method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({token: TOKEN, operation: 'view'}),
}));
const assertHeaders = res => {
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
};
const assertNoCheckoutActivity = ({availabilityLookup = false} = {}) => {
  assert.equal(activity.createClient, 1, 'only the report handler creates a client');
  assert.equal(activity.stripe, 0, 'Stripe never instantiated');
  assert.equal(activity.fetch, 0, 'fetch never called');
  assert.deepEqual(activity.rpc, [{name: 'relystra_basic_report_access', args: {p_token: TOKEN, p_operation: 'view'}}]);
  if (availabilityLookup) {
    assert.equal(activity.from, 1, 'exactly one table access');
    assert.deepEqual(activity.lookups, [{table: 'nexus_delivery_settings', select: 'checkout_enabled,stripe_account_id', eq: ['singleton', true], maybeSingle: 1}]);
  } else {
    assert.equal(activity.from, 0, 'no table access');
  }
};

test('real import chain loaded with only external packages substituted', async () => {
  assert.deepEqual([...activity.loaded].sort(), [...REAL_FILES].sort());
  await assert.rejects(import('npm:left-pad@1.3.0'), /UNEXPECTED_REMOTE_IMPORT/);
  await assert.rejects(import('https://esm.sh/stripe'), /UNEXPECTED_REMOTE_IMPORT/);
  assert.throws(() => fetch('https://synthetic.invalid'), /NETWORK_DISABLED_IN_TEST/);
  activity.fetch = 0;
});

for (const [label, result] of [['RPC error', {data: null, error: {message: 'synthetic failure'}}], ['null data', {data: null, error: null}]]) {
  test(`${label} returns 404 REPORT_UNAVAILABLE with exact recovery copy`, async () => {
    reset(result);
    const res = await call();
    assert.equal(res.status, 404);
    assertHeaders(res);
    assert.deepEqual(await res.json(), {error: 'REPORT_UNAVAILABLE', message: RECOVERY});
    assertNoCheckoutActivity();
  });
}

const ACCOUNT = 'acct_synthetic_only';
const AVAILABILITY_CASES = [
  ['enabled with account id', {data: {checkout_enabled: true, stripe_account_id: ACCOUNT}, error: null}, true],
  ['checkout disabled', {data: {checkout_enabled: false, stripe_account_id: ACCOUNT}, error: null}, false],
  ['enabled with empty account id', {data: {checkout_enabled: true, stripe_account_id: ''}, error: null}, false],
  ['enabled with non-string account id', {data: {checkout_enabled: true, stripe_account_id: null}, error: null}, false],
  ['lookup error (unknown)', {data: null, error: {message: 'synthetic lookup error'}}, null],
  ['no settings row (unknown)', {data: null, error: null}, null],
  ['lookup throws (unknown)', 'throw', null],
];

for (const [label, settings, expected] of AVAILABILITY_CASES) {
  test(`valid view returns 200 with client-safe fields; checkout_available ${JSON.stringify(expected)} when ${label}`, async () => {
    const safe = {
      id: 'synthetic-report', plan_id: null, plan_status: null, state: 'pending', company_name: 'Synthetic Co',
      heard: 'Synthetic heard', bottleneck: 'Synthetic bottleneck',
      primary: {name: 'Synthetic build', offer_name: 'Synthetic offer', price_cents: 100000, deposit_cents: 50000, currency: 'usd'},
      later: [],
    };
    reset({data: {...safe, actor_id: 'synthetic-actor', company_id: 'synthetic-company'}, error: null}, settings);
    const res = await call();
    assert.equal(res.status, 200);
    assertHeaders(res);
    const text = await res.text();
    assert.ok(!text.includes(RECOVERY), 'success body has no recovery copy');
    for (const leak of ['actor_id', 'company_id', 'synthetic-actor', 'synthetic-company', 'stripe_account_id', 'checkout_enabled', ACCOUNT, 'synthetic lookup']) {
      assert.ok(!text.includes(leak), `leaked ${leak}`);
    }
    assert.deepEqual(JSON.parse(text), {ok: true, report: {...safe, checkout_available: expected}});
    assertNoCheckoutActivity({availabilityLookup: true});
  });
}
