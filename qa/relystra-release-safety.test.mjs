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
const activeHtml = allFiles.filter(path => extname(path) === '.html' && !path.includes('/hlo-builds/'));
const activeText = allFiles.filter(path => /\.(?:css|html|js|json|md|mjs|py|ts)$/.test(path)
  && !path.includes('/hlo-builds/')
  && !path.includes('/supabase/migrations/')
  && !path.endsWith('/relystra-release.json')
  && !path.endsWith('/qa/relystra-release-safety.test.mjs'));

test('release metadata makes preview-only state explicit', async () => {
  const release = JSON.parse(await readFile(join(root, 'relystra-release.json'), 'utf8'));
  assert.equal(release.brand, 'Relystra');
  assert.equal(release.productionReady, false);
  assert.equal(release.domainControlVerified, false);
  assert.equal(release.intendedFutureDomain, 'RelystraSolutions.com');
  assert.equal(release.crawlPolicy, 'noindex-nofollow-disallow-all');
});

test('every active HTML document carries brand and preview safeguards', async () => {
  assert.equal(activeHtml.length, 30);
  for (const path of activeHtml) {
    const text = await readFile(path, 'utf8');
    assert.match(text, /relystra-brand\.css/, relative(root, path));
    assert.match(text, /relystra-mark\.svg/, relative(root, path));
    assert.match(text, /site\.webmanifest/, relative(root, path));
    assert.match(text, /apple-touch-icon\.png/, relative(root, path));
    assert.match(text, /noindex,nofollow/, relative(root, path));
  }
});

test('robots and response headers block preview indexing', async () => {
  assert.match(await readFile(join(root, 'robots.txt'), 'utf8'), /User-agent: \*\s+Disallow: \//);
  assert.match(await readFile(join(root, '_headers'), 'utf8'), /\/\*\s+X-Robots-Tag: noindex, nofollow/);
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

test('legal drafts and transitional sender remain visibly provisional', async () => {
  assert.match(await readFile(join(root, 'privacy.html'), 'utf8'), /Staging notice:/);
  assert.match(await readFile(join(root, 'terms.html'), 'utf8'), /Staging notice:/);
  assert.match(await readFile(join(root, 'supabase/functions/nexus-email-worker/index.ts'), 'utf8'), /Relystra \(formerly Nexus Intelligence\)/);
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
