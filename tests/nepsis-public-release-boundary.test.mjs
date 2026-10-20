import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const sha256 = name => crypto.createHash('sha256').update(fs.readFileSync(new URL(name, root))).digest('hex');
const publicPages = ['index', 'about', 'services', 'methodology', 'construction', 'faq', 'delivery-standard'];
const legalPages = ['privacy', 'terms', 'security', 'accessibility'];

test('release keeps the approved private Nepsis portal checkpoint and booking contract byte-for-byte unchanged', () => {
  assert.equal(sha256('portal.html'), '64064f3ef75a00c70b0ae43be7b7886c41243b4ad11cbc34b3519bb383a0ca48');
  assert.equal(sha256('_redirects'), '80c26659e927677c01a48b545815de3a2058ee1792337a0e6052e8c51f05d59f');
  assert.match(read('_redirects'), /^\/book https:\/\/calendar\.app\.google\/Tf4mfbREYbdR51BV7 302$/m);
});

test('public Nepsis pages are indexable, canonical and free of provisional release markers', () => {
  for (const page of publicPages) {
    const html = read(`${page}.html`);
    const path = page === 'index' ? '' : page;
    assert.match(html, /<title>[^<]*Nepsis Intelligence[^<]*<\/title>/, page);
    assert.match(html, /name="robots" content="index,follow"/, page);
    assert.match(html, new RegExp(`rel="canonical" href="https://nexusintelligence\\.live/${path}"`), page);
    assert.match(html, new RegExp(`property="og:url" content="https://nexusintelligence\\.live/${path}"`), page);
    assert.match(html, /assets\/nepsis-homepage-mark\.svg/, page);
    assert.doesNotMatch(html, /property="og:image" content="[^"]+\.svg"/i, page);
    assert.doesNotMatch(html, /relystra-stage|provisional-owner-risk-accepted|assets\/relystra-mark\.svg/i, page);
  }
  assert.match(read('about.html'), /property="og:image" content="https:\/\/nexusintelligence\.live\/assets\/kyrie-founder-primary\.webp"/);
  const delivery = read('delivery-standard.html');
  assert.match(delivery, /<html lang="en" data-nepsis-static-public>/);
  assert.doesNotMatch(delivery, /Free Discovery|Basic Report|recommended Build|Book Free Discovery|site\.webmanifest|apple-touch-icon|relystra-icon/i);
});

test('legal pages show the public brand while preserving the existing Relystra legal identity', () => {
  for (const page of legalPages) {
    const html = read(`${page}.html`);
    assert.match(html, /Nepsis Intelligence/, page);
    assert.match(html, /Nepsis Intelligence is the public-facing brand/, page);
    assert.match(html, /Relystra/, page);
    assert.match(html, /name="robots" content="noindex,nofollow"/, page);
    assert.doesNotMatch(html, /relystra-stage|provisional-owner-risk-accepted|assets\/relystra-mark\.svg/i, page);
  }
});

test('operational brand parity verifies Nepsis publicly and preserves Relystra in the portal', () => {
  const workflow = read('.github/workflows/relystra-operational-release-brand-parity.yml');
  assert.match(workflow, /name: Nepsis Public \/ Relystra Portal Brand Parity/);
  assert.match(workflow, /pages-home-brand[^\n]+Nepsis Intelligence \| Practical Construction Systems/);
  assert.match(workflow, /custom-home-name[^\n]+<span>NEPSIS<\/span><small>INTELLIGENCE<\/small>/);
  assert.match(workflow, /pages-portal-brand[^\n]+Relystra/);
  assert.match(workflow, /custom-portal-brand[^\n]+Relystra/);
  assert.match(workflow, /NEPSIS_PUBLIC_RELYSTRA_PORTAL_BRAND_PARITY=PASS/);
  assert.doesNotMatch(workflow, /Construction workflows, made usable|<span>Relystra<\/span>/);
});

test('release does not invent the unresolved price or collapse diagnosis into implementation acceptance', () => {
  const html = publicPages.map(page => read(`${page}.html`)).join('\n');
  assert.doesNotMatch(html, /\$350|350-dollar|350 dollar/i);
  assert.match(read('index.html'), /Basic Diagnosis report/);
  assert.match(read('index.html'), /Full Diagnosis report with the scoped implementation/);
  assert.match(read('methodology.html'), /implementation acceptance against the agreed criteria/);
  assert.match(read('faq.html'), /A released report does not mean an implementation has been accepted/);
});
