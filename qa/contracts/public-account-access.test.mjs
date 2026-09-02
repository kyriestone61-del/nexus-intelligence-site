import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(path,'utf8');

test('public navigation keeps a visible client login route',()=>{
  const app=read('app.js');
  const homepage=read('index.html');
  const styles=read('styles.css');

  assert.match(app,/class="nav-account"[^>]*href="\/portal">Client Login<\/a>/);
  assert.match(homepage,/class="nav-account"[^>]*href="\/portal">Client Login<\/a>/);
  assert.match(styles,/\.nav-account\{/);
});

test('later phases cannot strip client login from public navigation',()=>{
  const phaseFive=read('phase-five.js');
  const middleware=read('functions/_middleware.js');

  assert.doesNotMatch(phaseFive,/querySelectorAll\([^\n]*href="\/portal"/);
  assert.doesNotMatch(middleware,/\.on\('\.navlinks a\[href="\/portal"\]'/);
});
