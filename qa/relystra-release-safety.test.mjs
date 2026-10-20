import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const allFiles = await walk(root);
const convertedPublicHtml = new Set(['index.html', 'services.html', 'methodology.html', 'about.html', 'construction.html', 'faq.html']);
const nepsisLegacyShellHtml = new Set(['delivery-standard.html']);
const brandedLegalHtml = new Set(['privacy.html', 'terms.html', 'security.html', 'accessibility.html']);
const privatePortalHtml = new Set(['portal.html']);
const privateNepsisReportHtml = new Set(['basic-report.html']);
const activeHtml = allFiles.filter(path => extname(path) === '.html'
  && !path.includes('/hlo-builds/')
  && !path.includes('/qa/')
  && !path.includes('/delivery/qa-'));
const activeText = allFiles.filter(path => /\.(?:css|html|js|json|md|mjs|py|ts)$/.test(path)
  && !path.includes('/hlo-builds/')
  && !path.includes('/supabase/migrations/')
  && !path.endsWith('/relystra-release.json')
  && !path.endsWith('/qa/relystra-release-safety.test.mjs'));

test('release metadata makes preview-only state explicit', async () => {
  const release = JSON.parse(await readFile(join(root, 'relystra-release.json'), 'utf8'));
  assert.equal(release.brand, 'Relystra');
  assert.equal(release.productionReady, false);
  assert.equal(release.currentProductionOrigin, 'https://nexusintelligence.live');
  assert.equal(release.domainMigration, 'deferred-by-owner');
});

test('converted public and supporting documents carry the intended brand and indexing policy', async () => {
  assert.ok(activeHtml.length > 0);
  for (const path of activeHtml) {
    const text = await readFile(path, 'utf8');
    const name = relative(root, path);
    if (convertedPublicHtml.has(name)) {
      assert.match(text, /<title>[^<]*Nepsis Intelligence[^<]*<\/title>/, name);
      assert.match(text, /href="\/nepsis-homepage\.css"/, name);
      assert.match(text, /href="\/assets\/nepsis-homepage-mark\.svg"/, name);
      assert.match(text, /src="\/nepsis-homepage\.js"/, name);
      assert.match(text, /name="robots" content="index,follow"/, name);
      assert.doesNotMatch(text, /relystra-brand\.css|relystra-mark\.svg|src="\/app\.js"|relystra-stage/, name);
    } else if (nepsisLegacyShellHtml.has(name)) {
      assert.match(text, /<title>[^<]*Nepsis Intelligence[^<]*<\/title>/, name);
      assert.match(text, /relystra-brand\.css/, name);
      assert.match(text, /href="\/assets\/nepsis-homepage-mark\.svg"/, name);
      assert.match(text, /name="robots" content="index,follow"/, name);
      assert.doesNotMatch(text, /relystra-mark\.svg|relystra-stage|site\.webmanifest|apple-touch-icon|relystra-icon/i, name);
    } else if (brandedLegalHtml.has(name)) {
      assert.match(text, /<title>[^<]*Nepsis Intelligence[^<]*<\/title>/, name);
      assert.match(text, /relystra-brand\.css/, name);
      assert.match(text, /href="\/assets\/nepsis-homepage-mark\.svg"/, name);
      assert.match(text, /site\.webmanifest/, name);
      assert.match(text, /apple-touch-icon\.png/, name);
      assert.match(text, /name="robots" content="noindex,nofollow"/, name);
      assert.match(text, /Nepsis Intelligence is the public-facing brand/, name);
      assert.match(text, /Relystra/, name);
      assert.doesNotMatch(text, /relystra-mark\.svg|relystra-stage/, name);
    } else if (privatePortalHtml.has(name)) {
      assert.match(text, /<title>Client Workspace \| Nepsis<\/title>/, name);
      assert.match(text, /relystra-brand\.css/, name);
      assert.match(text, /href="\/assets\/nepsis-homepage-mark\.svg"/, name);
      assert.match(text, /site\.webmanifest/, name);
      assert.match(text, /apple-touch-icon\.png/, name);
      assert.match(text, /noindex,nofollow/, name);
      assert.doesNotMatch(text, /relystra-mark\.svg/, name);
    } else if (privateNepsisReportHtml.has(name)) {
      assert.match(text, /<title>Your Basic Diagnosis \| Nepsis Intelligence<\/title>/, name);
      assert.match(text, /relystra-brand\.css/, name);
      assert.match(text, /class="nepsis-report-wordmark"/, name);
      assert.match(text, /noindex,nofollow/, name);
      assert.doesNotMatch(text, /relystra-mark\.svg|relystra-logo|site\.webmanifest|apple-touch-icon/i, name);
    } else {
      assert.match(text, /relystra-brand\.css/, name);
      assert.match(text, /relystra-mark\.svg/, name);
      assert.match(text, /site\.webmanifest/, name);
      assert.match(text, /apple-touch-icon\.png/, name);
      assert.match(text, /noindex,nofollow/, name);
    }
  }
});

test('public production pages are indexable while private and preview routes remain blocked', async () => {
  const robots=await readFile(join(root, 'robots.txt'), 'utf8');
  const headers=await readFile(join(root, '_headers'), 'utf8');
  const middleware=await readFile(join(root, 'functions/_middleware.js'), 'utf8');
  assert.match(robots, /User-agent: \*\s+Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/nexusintelligence\.live\/sitemap\.xml/);
  assert.doesNotMatch(headers, /\/\*\s+X-Robots-Tag: noindex, nofollow/);
  assert.match(headers, /\/portal\*\s+[\s\S]*X-Robots-Tag: noindex, nofollow/);
  assert.match(middleware, /const isPreview=url\.hostname\.endsWith\('\.pages\.dev'\)/);
  assert.match(middleware, /if\(isPrivate\|\|isProtectedMarketing\)headers\.set\('X-Robots-Tag','noindex, nofollow, noarchive'\)/);
});

test('converted Nepsis pages are indexable on production and noindex on branch previews', async () => {
  const source = await readFile(join(root, 'functions/_middleware.js'), 'utf8');
  const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  globalThis.HTMLRewriter = class { constructor() { throw Error('Converted pages must bypass the legacy rewrite pipeline'); } };
  for (const name of convertedPublicHtml) {
    const html = await readFile(join(root, name), 'utf8');
    const route = name === 'index.html' ? '/' : `/${name.replace('.html', '')}`;
    for (const [host, expected] of [['nexusintelligence.live', null], ['review.project.pages.dev', 'noindex']]) {
      const response = await onRequest({ request: new Request(`https://${host}${route}`), next: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) });
      assert.equal(response.headers.get('X-Robots-Tag'), expected, `${host}${route}`);
      assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
      assert.equal(await response.text(), html);
    }
  }
});

test('canonical brand avoids prohibited compound names', async () => {
  const prohibited = /Relystra (?:Intelligence|Solutions|Technologies)/;
  for (const path of activeText) {
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, prohibited, relative(root, path));
  }
});

test('unowned future domain is not activated in application code', async () => {
  for (const path of activeText) {
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /relystrasolutions\.com/i, relative(root, path));
  }
});

test('legacy compatibility identifiers remain available', async () => {
  assert.match(await readFile(join(root, 'portal-client.js'), 'utf8'), /nexus_/);
  assert.match(await readFile(join(root, 'supabase/functions/nexus-email-worker/index.ts'), 'utf8'), /NEXUS_EMAIL_FROM/);
  assert.match(await readFile(join(root, 'qa/playwright/playwright.config.mjs'), 'utf8'), /NEXUS_QA_BASE_URL/);
});

test('public legal pages avoid migration residue and the current-domain sender uses canonical branding', async () => {
  for (const path of ['privacy.html', 'terms.html']) {
    const page = await readFile(join(root, path), 'utf8');
    assert.doesNotMatch(page, /Staging notice:|successor brand to Relystra/i);
  }
  assert.match(await readFile(join(root, 'supabase/functions/nexus-email-worker/index.ts'), 'utf8'), /Relystra <contact@nexusintelligence\.live>/);
  assert.doesNotMatch(await readFile(join(root, 'supabase/functions/nexus-email-worker/index.ts'), 'utf8'), /formerly Nexus Intelligence/);
});

test('PNG identity assets have required dimensions', async () => {
  const dimensions = async name => {
    const png = await readFile(join(root, 'assets', name));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  };
  assert.deepEqual(await dimensions('relystra-icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(await dimensions('relystra-icon-512.png'), { width: 512, height: 512 });
  assert.deepEqual(await dimensions('apple-touch-icon.png'), { width: 180, height: 180 });
  assert.deepEqual(await dimensions('favicon-32x32.png'), { width: 32, height: 32 });
  assert.deepEqual(await dimensions('relystra-og.png'), { width: 1200, height: 630 });
});
