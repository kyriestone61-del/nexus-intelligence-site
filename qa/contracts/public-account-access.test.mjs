import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(path,'utf8');

test('public navigation keeps a visible client login route',()=>{
  const app=read('app.js');
  const pages=['index','services','methodology','about','construction','faq'];
  const styles=read('styles.css');
  const runtimeSmoke=read('.github/workflows/production-runtime-smoke.yml');

  assert.match(app,/class="nav-account"[^>]*href="\/portal">Client Login<\/a>/);
  for(const page of pages){
    const html=read(`${page}.html`);
    const nav=html.match(/<nav class="public-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav,`${page}: main navigation exists`);
    const login=nav.match(/<a\b([^>]*href="\/portal"[^>]*)>(Client login)<\/a>/);
    assert.ok(login,`${page}: client login remains in the main navigation`);
    assert.doesNotMatch(login[1],/hidden|aria-hidden="true"|tabindex="-1"|style=/);
    assert.match(html,/aria-controls="public-nav"/);
    assert.match(html,/src="\/nepsis-homepage.js"/);
  }
  const publicStyles=read('nepsis-homepage.css');
  assert.match(publicStyles,/\.public-nav\.is-open\s*\{\s*display:\s*grid;/);
  assert.match(publicStyles,/\.public-nav a\s*\{[^}]*display:\s*inline-flex/);
  const delivery=read('delivery-standard.html');
  const deliveryNav=delivery.match(/<div class="navlinks">([\s\S]*?)<\/div><\/nav>/)?.[1];
  assert.ok(deliveryNav,'delivery-standard: main navigation exists');
  const deliveryLogin=deliveryNav.match(/<a\b([^>]*href="\/portal"[^>]*)>Client login<\/a>/);
  assert.ok(deliveryLogin,'delivery-standard: client login remains in the main navigation');
  assert.doesNotMatch(deliveryLogin[1],/hidden|aria-hidden="true"|tabindex="-1"|style=/);
  for(const retired of ['/industries','/problems','/capabilities'])assert.doesNotMatch(deliveryNav,new RegExp(`href="${retired}"`));
  assert.match(styles,/\.nav-account\{/);
  assert.match(runtimeSmoke,/custom-public-client-login-home[^\n]+data-track="nav_client_login" href="\/portal">Client login<\/a>/);
  assert.doesNotMatch(runtimeSmoke,/custom-public-client-login-home[^\n]+class="nav-account"/);
});

test('later phases cannot strip client login from public navigation',()=>{
  const phaseFive=read('phase-five.js');
  const middleware=read('functions/_middleware.js');

  assert.doesNotMatch(phaseFive,/querySelectorAll\([^\n]*href="\/portal"/);
  assert.doesNotMatch(middleware,/\.on\('\.navlinks a\[href="\/portal"\]'/);
});
