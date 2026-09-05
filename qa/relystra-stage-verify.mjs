import { createRequire } from 'node:module';
import { access, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const output = resolve(process.env.RELYSTRA_QA_OUTPUT || join(root, 'qa-artifacts'));

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveAsset(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const clean = normalize(pathname).replace(/^[/\\]+/, '');
  if (clean.startsWith('..')) return null;
  const candidates = pathname === '/'
    ? [join(root, 'index.html')]
    : extname(clean)
      ? [join(root, clean)]
      : [join(root, `${clean}.html`), join(root, clean, 'index.html')];
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  return null;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', error => pageErrors.push(error.message));
page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || 'failed'}`));

await page.route('http://relystra.local/**', async route => {
  const path = await resolveAsset(route.request().url());
  if (!path) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  const body = await readFile(path);
  return route.fulfill({ status: 200, contentType: types[extname(path)] || 'application/octet-stream', body });
});

const checks = [];
async function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail });
}

const response = await page.goto('http://relystra.local/', { waitUntil: 'networkidle' });
await check('Home returns 200', response?.status() === 200, String(response?.status()));
await check('Home has meaningful content', (await page.locator('body').innerText()).trim().length > 800);
await check('Title identifies Relystra', (await page.title()).includes('Relystra'), await page.title());
await check('Brand mark renders', await page.locator('.brand-mark').first().isVisible());
await check('Transition message renders', await page.locator('.rebrand-transition').isVisible());
await check('Positioning headline renders', (await page.locator('h1').first().innerText()).includes('less friction'));
await check('Primary CTA is present', await page.getByRole('link', { name: /Highest-Value Opportunity/i }).isVisible());
await check('Staging is noindex', await page.locator('meta[name="robots"][content*="noindex"]').count() === 1);
await page.screenshot({ path: join(output, 'relystra-home-desktop.png'), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://relystra.local/', { waitUntil: 'networkidle' });
await check('Mobile menu control renders', await page.getByRole('button', { name: /Open navigation/i }).isVisible());
await page.screenshot({ path: join(output, 'relystra-home-mobile.png'), fullPage: true });

for (const route of ['/services', '/about', '/quick-scan', '/portal']) {
  const routeResponse = await page.goto(`http://relystra.local${route}`, { waitUntil: 'domcontentloaded' });
  await check(`${route} returns 200`, routeResponse?.status() === 200, String(routeResponse?.status()));
  await check(`${route} has visible content`, (await page.locator('body').innerText()).trim().length > 150);
}

await check('No runtime page errors', pageErrors.length === 0, pageErrors.join(' | '));
await check('No failed local asset requests', failedRequests.filter(x => x.includes('relystra.local')).length === 0, failedRequests.join(' | '));
const ignoredConsolePatterns = [/supabase/i, /fetch/i, /network/i];
const blockingConsoleErrors = consoleErrors.filter(message => !ignoredConsolePatterns.some(pattern => pattern.test(message)));
await check('No blocking console errors', blockingConsoleErrors.length === 0, blockingConsoleErrors.join(' | '));

await browser.close();
const failed = checks.filter(item => !item.pass);
console.log(JSON.stringify({ status: failed.length ? 'FAIL' : 'PASS', checks, consoleErrors, pageErrors, failedRequests }, null, 2));
if (failed.length) process.exit(1);
