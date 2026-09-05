import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;

function meaningfulConsoleErrors(messages){return messages.filter(text=>!/favicon|cloudflareinsights|analytics|ResizeObserver loop/i.test(text));}
async function waitForSettledPortal(page,timeout=40_000){
  await expect(page.locator('#portalApp')).toBeVisible({timeout});
  await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/,{timeout});
  await expect(page.locator('#nexusPortalBootOverlay')).toHaveCount(0,{timeout});
  await expect.poll(()=>page.evaluate(()=>{
    const state=window.NexusPortal?.state;
    const shell=state?.admin&&state.viewMode!=='client'
      ?document.querySelector('.nexus-production-primary-nav')
      :document.getElementById('nexusClientPrimaryNav');
    return window.__nexusPortalBooting===false&&!!state?.user&&!!shell&&
      !document.body.classList.contains('nexus-runtime-degraded');
  }),{timeout,message:'Authenticated role shell must finish loading'}).toBe(true);
}
async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await page.locator('#signInEmail').fill(email);
  await page.locator('#signInPassword').fill(password);
  await page.locator('#signInBtn').click();
  await waitForSettledPortal(page);
}
async function assertNoOverflow(page){
  const dims=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth+1);
}
async function selectQaCompanyForSetup(page){
  if(!qaCompany)return null;
  const target=await page.locator('#companySelect option').evaluateAll((options,companyName)=>{
    const option=options.find(item=>item.textContent?.trim()===companyName);
    return option?.value||null;
  },qaCompany);
  if(!target)throw new Error(`Disposable QA company not found: ${qaCompany}`);
  const current=new URL(page.url()).searchParams.get('company');
  if(current!==target){
    await page.goto(`/portal?view_mode=admin&company=${encodeURIComponent(target)}`,{waitUntil:'domcontentloaded'});
    await waitForSettledPortal(page);
  }
  await expect(page.locator('#companySelect')).toHaveValue(target,{timeout:20_000});
  return target;
}

test('auth tabs and verification entry surface remain stable',async({page})=>{
  const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#signInForm')).toBeVisible();
  await page.locator('#tabCreate').click();
  await expect(page.locator('#createForm')).toBeVisible();
  await expect(page.locator('#createCompany')).toBeVisible();
  await page.locator('#tabSignIn').click();
  await expect(page.locator('#signInForm')).toBeVisible();
  await assertNoOverflow(page);
  expect(meaningfulConsoleErrors(errors)).toEqual([]);
});

test('public Control Room header links remain reachable and touch safe',async({page})=>{
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await expect(page.locator('a.brand')).toHaveAttribute('href','/');
  for(const selector of ['#tabSignIn','#tabCreate','#signInBtn']){const box=await page.locator(selector).boundingBox();expect(box?.height||0).toBeGreaterThanOrEqual(40);}
  await assertNoOverflow(page);
});

test('deployed inbox runtime contains the lockout regression guard',async({request})=>{
  const response=await request.get('/portal-approval-inbox.js');
  expect(response.ok()).toBeTruthy();
  const source=await response.text();
  expect(source).toContain('queueInboxRefresh');
  expect(source).not.toContain('new MutationObserver');
  expect(source).not.toContain('observer.observe(document.body');
});

test.describe('authenticated client control room',()=>{
  test.skip(!clientEmail||!clientPassword,'Disposable Nexus QA client credentials are required.');

  test('client sees the canonical Today, Files, Results surfaces and working utilities',async({page})=>{
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await signIn(page,clientEmail,clientPassword);
    const nav=page.locator('#nexusClientPrimaryNav [data-client-view]');
    await expect(nav).toHaveCount(3);
    expect(await nav.allTextContents()).toEqual(['Today','Files','Results']);
    await expect(page.locator('#nexus-client-today')).toBeVisible();
    await nav.nth(1).click();await expect(page.locator('#nexus-client-files')).toBeVisible();await expect(page.locator('#uploadForm')).toBeVisible();
    await nav.nth(2).click();await expect(page.locator('#nexus-client-improvement')).toBeVisible();
    await expect(page.locator('#nexusClientReportsButton')).toBeHidden();
    await expect(page.locator('#nexusClientHelpButton')).toBeVisible();await expect(page.locator('#nexusClientInboxButton')).toBeVisible();
    const contextualReports=page.locator('[data-client-reports]').first();await expect(contextualReports).toBeVisible();await contextualReports.click();await expect(page.locator('#nexus-client-reports')).toBeVisible();
    await page.locator('#nexusClientInboxButton').click();await expect(page.locator('#nexusClientInboxDrawer')).toHaveClass(/show/);await page.keyboard.press('Escape');await expect(page.locator('#nexusClientInboxDrawer')).not.toHaveClass(/show/);
    await page.locator('#nexusClientHelpButton').click();await expect(page.locator('#nexusClientGuideDrawer')).toHaveClass(/show/);await page.keyboard.press('Escape');await expect(page.locator('#nexusClientGuideDrawer')).not.toHaveClass(/show/);
    await assertNoOverflow(page);expect(meaningfulConsoleErrors(errors)).toEqual([]);
    await page.locator('#signOutBtn').click();await expect(page.locator('#signInForm')).toBeVisible({timeout:20_000});
  });

  test('client portal settles without runaway inbox traffic',async({page})=>{
    let inboxCalls=0;
    page.on('request',request=>{if(request.url().includes('/rest/v1/rpc/nexus_get_inbox'))inboxCalls+=1;});
    await signIn(page,clientEmail,clientPassword);
    inboxCalls=0;
    await page.waitForTimeout(3_000);
    expect(inboxCalls,'Idle client portal must not continuously poll nexus_get_inbox').toBeLessThanOrEqual(4);
    await expect(page.locator('#portalApp')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/);
  });

  test('QA client is isolated to the dedicated disposable company workspace',async({page})=>{
    await signIn(page,clientEmail,clientPassword);
    const select=page.locator('#companySelect');
    await expect(select.locator('option')).toHaveCount(1);
    if(qaCompany)expect(await select.locator('option').allTextContents()).toEqual([qaCompany]);
    await expect(page.locator('#nexusClientMiniContext b')).toHaveText(qaCompany||/Nexus QA/);
    await expect(page.locator('#nexus-client-today')).toBeVisible();
  });
});

test.describe('administrator and client-preview boundaries',()=>{
  test.skip(!adminEmail||!adminPassword,'Disposable Nexus QA administrator credentials are required.');

  test('administrator settles without runaway inbox traffic or boot lock',async({page})=>{
    let inboxCalls=0;
    const errors=[];
    page.on('request',request=>{if(request.url().includes('/rest/v1/rpc/nexus_get_inbox'))inboxCalls+=1;});
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await signIn(page,adminEmail,adminPassword);
    inboxCalls=0;
    await page.waitForTimeout(3_000);
    expect(inboxCalls,'Idle admin portal must not recursively reload nexus_get_inbox').toBeLessThanOrEqual(4);
    await expect(page.locator('#portalApp')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/);
    await expect(page.locator('#nexusPortalBootOverlay')).toHaveCount(0);
    expect(meaningfulConsoleErrors(errors)).toEqual([]);
  });

  test('founder navigation is reduced to Home, Clients, Decisions, Sales and each route opens',async({page})=>{
    test.setTimeout(90_000);
    await signIn(page,adminEmail,adminPassword);
    await selectQaCompanyForSetup(page);
    const menu=page.locator('#nexusMobileNavToggle');
    async function openMenu(){
      if(await menu.isVisible()&&await menu.getAttribute('aria-expanded')==='false'){
        await menu.click();await expect(menu).toHaveAttribute('aria-expanded','true');
      }
    }
    async function openRoute(label){
      await openMenu();
      const button=page.locator('.nexus-production-primary-nav').getByRole('button',{name:label,exact:true});
      await button.click();
    }
    const primary=page.locator('.nexus-production-primary-nav > button');
    await expect(primary).toHaveCount(4);
    expect(await primary.allTextContents()).toEqual(['Home','Clients','Decisions','Sales']);
    await openRoute('Clients');await expect(page.locator('#section-companies')).toHaveClass(/active/);
    await openRoute('Decisions');await expect(page.locator('#section-notifications')).toHaveClass(/active/);
    await openRoute('Sales');await expect(page.locator('#section-revenue')).toHaveClass(/active/);
    await openRoute('Home');await expect(page.locator('#adminJourneyRoot')).toBeVisible();
    await openMenu();
    const records=page.locator('details.nexus-production-records');await expect(records).toBeVisible();await records.locator('summary').click();await expect(records).toHaveAttribute('open','');
    await assertNoOverflow(page);
  });

  test('administrator can enter Client View without boot failure',async({page})=>{
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await signIn(page,adminEmail,adminPassword);
    await selectQaCompanyForSetup(page);
    const switcher=page.locator('#nexusPerspectiveSwitcher');await expect(switcher).toBeVisible();await switcher.locator('summary').click();
    await switcher.locator('[data-perspective="client"]').click();
    await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:40_000});
    await expect(page.getByText('Nexus could not finish loading.',{exact:true})).toHaveCount(0);
    await expect(page.locator('#nexusClientPrimaryNav [data-client-view]')).toHaveCount(3);
    expect(await page.locator('#nexusClientPrimaryNav [data-client-view]').allTextContents()).toEqual(['Today','Files','Results']);
    expect(meaningfulConsoleErrors(errors)).toEqual([]);
  });

  test('legacy manual creation buttons remain hidden from the canonical workflow',async({page})=>{
    await signIn(page,adminEmail,adminPassword);
    for(const selector of ['#newTaskBtn','#newMetricBtn','#newMilestoneBtn','#newDocumentRequestBtn'])await expect(page.locator(selector)).toBeHidden();
  });
});