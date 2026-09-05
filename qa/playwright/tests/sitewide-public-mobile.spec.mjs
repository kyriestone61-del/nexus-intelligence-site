import {test,expect} from '@playwright/test';

// Full RELYSTRA QAQC rerun marker after the FAQ mobile accordion correction.
const paths=[
  '/','/about','/accessibility','/assessment','/capabilities','/construction','/delivery-standard','/faq','/industries','/methodology','/privacy','/problems','/quick-scan','/roi-calculator','/security','/services',
  '/services/ai-enablement-training','/services/ai-opportunity-assessment','/services/business-transformation','/services/fractional-ai-director','/services/implementation-sprint','/services/managed-ai-operations','/terms'
];
const base=process.env.NEXUS_QA_BASE_URL||'https://nexusintelligence.live';
const canonical='https://nexusintelligence.live';

function meaningfulErrors(errors){return errors.filter(x=>!/favicon|analytics|third-party cookie|ResizeObserver loop/i.test(x));}

for(const path of paths){
  test(`public contract ${path}`,async({page})=>{
    const consoleErrors=[];const pageErrors=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    page.on('pageerror',e=>pageErrors.push(String(e?.message||e)));
    const response=await page.goto(`${base}${path}`,{waitUntil:'domcontentloaded',timeout:30_000});
    expect(response,`No navigation response for ${path}`).not.toBeNull();
    expect(response.status(),`${path} returned ${response.status()}`).toBeLessThan(400);
    expect(new URL(page.url()).origin).toBe(new URL(base).origin);
    await expect(page.locator('body')).toBeVisible();
    const text=(await page.locator('body').innerText()).trim();
    expect(text.length,`${path} rendered an effectively blank page`).toBeGreaterThan(80);

    const invalidLinks=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>({text:(a.textContent||'').trim(),href:a.getAttribute('href')})).filter(x=>/^javascript:/i.test(x.href||'')||!String(x.href||'').trim()));
    expect(invalidLinks,`${path} contains invalid link targets`).toEqual([]);

    const unnamedButtons=await page.locator('button:visible').evaluateAll(nodes=>nodes.map(b=>({text:(b.textContent||'').trim(),aria:b.getAttribute('aria-label'),title:b.getAttribute('title')})).filter(x=>!(x.text||x.aria||x.title)));
    expect(unnamedButtons,`${path} contains visible unnamed buttons`).toEqual([]);

    expect(meaningfulErrors(consoleErrors),`${path} console errors`).toEqual([]);
    expect(pageErrors,`${path} page errors`).toEqual([]);
  });

  test(`mobile 390px contract ${path}`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    const response=await page.goto(`${base}${path}`,{waitUntil:'domcontentloaded',timeout:30_000});
    expect(response).not.toBeNull();expect(response.status()).toBeLessThan(400);
    const dims=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
    expect(dims.scrollWidth,`${path} horizontal overflow: ${JSON.stringify(dims)}`).toBeLessThanOrEqual(dims.clientWidth+1);
    const tinyTargets=await page.locator('button:visible,a:visible').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {name:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,80),w:r.width,h:r.height}}).filter(x=>x.w>0&&x.h>0&&x.w<24&&x.h<24));
    expect(tinyTargets,`${path} has very small interactive targets`).toEqual([]);
  });
}

test('booking route remains an intentional external redirect',async({request})=>{
  const response=await request.get(`${base}/book`,{maxRedirects:0});
  expect([301,302,303,307,308]).toContain(response.status());
  const location=response.headers()['location']||'';
  expect(location).toMatch(/^https:\/\//);
  expect(new URL(location).origin).not.toBe(new URL(base).origin);
});

test('sitemap exposes the complete governed public surface on the canonical domain',async({request})=>{
  const response=await request.get(`${base}/sitemap.xml`);expect(response.ok()).toBeTruthy();
  const xml=await response.text();
  for(const path of paths)expect(xml).toContain(`<loc>${canonical}${path}</loc>`);
  expect(xml).not.toMatch(/\/portal|\/operations|\/admin/);
});
