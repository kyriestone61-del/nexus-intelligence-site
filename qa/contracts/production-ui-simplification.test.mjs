import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const portalApp=readFileSync(new URL('../../portal-app.js',import.meta.url),'utf8');
const simplify=readFileSync(new URL('../../portal-production-simplification.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../portal-production-simplification.css',import.meta.url),'utf8');
const redirects=readFileSync(new URL('../../_redirects',import.meta.url),'utf8');

test('portal loads the final production simplification layer after role shells',()=>{
  assert.match(portalApp,/portal-production-simplification\.css/);
  assert.match(portalApp,/portal-production-simplification\.js/);
  assert.match(portalApp,/20260903-production-simple1/);
});

test('founder daily navigation is constrained to Home, Clients, Decisions, Sales',()=>{
  for(const label of ["text(home,'Home')","text(clients,'Clients')","text(decisions,'Decisions')","text(sales,'Sales')"]){
    assert.ok(simplify.includes(label),`missing ${label}`);
  }
  assert.match(simplify,/Records & Tools/);
});

test('client daily navigation is constrained to Today, Files, Results',()=>{
  assert.match(simplify,/const labels=\{today:'Today',files:'Files',improvement:'Results'\}/);
  assert.match(simplify,/nexusClientReportsButton/);
});

test('diagnosis step 3 is the resolution-selection gate, not the legacy package starter',()=>{
  assert.match(simplify,/Choose Solutions & Confirm Plan/);
  assert.match(simplify,/Review suggested solutions/);
  assert.match(simplify,/data-start-package=\\"solution_design\\"|\[data-start-package=\\"solution_design\\"\]/);
  assert.match(simplify,/stopImmediatePropagation/);
  assert.match(simplify,/openDecisions\(\)/);
});

test('decisions and sales hide operational complexity behind progressive disclosure',()=>{
  assert.match(simplify,/Search & advanced filters/);
  assert.match(simplify,/Advanced prospect intake & evidence/);
  assert.match(css,/nexus-production-records/);
  assert.match(css,/nexus-sales-advanced/);
});

test('legacy duplicate workflows redirect to canonical surfaces',()=>{
  assert.match(redirects,/\/operations \/portal\?view_mode=admin 301/);
  assert.match(redirects,/\/assessment \/quick-scan 301/);
  assert.match(redirects,/\/prospect-workspace \/portal 301/);
});
