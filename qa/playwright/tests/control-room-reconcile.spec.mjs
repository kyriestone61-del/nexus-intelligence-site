import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;

function meaningfulConsoleErrors(messages){return messages.filter(text=>!/favicon|cloudflareinsights|analytics|ResizeObserver loop/i.test(text));}
async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await page.locator('#signInEmail').fill(email);
  await page.locator('#signInPassword').fill(password);
  await page.locator('#signInBtn').click();
  await expect(page.locator('#portalApp')).toBeVisible({timeout:25_000});
  await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/,{timeout:25_000});
  await expect(page.locator('#nexusPortalBootOverlay')).toHaveCount(0,{timeout:25_000});
}
async function assertNoOverflow(page){
  const dims=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth+1);
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
  test.skip(!clientEmail||!clientPassword,'Dedicated Nexus QA client credentials are required.');

  test('client sees exactly three primary surfaces and working utilities',async({page})=>{
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await signIn(page,clientEmail,clientPassword);
    const nav=page.locator('#nexusClientPrimaryNav [data-client-view]');
    await expect(nav).toHaveCount(3);
    expect(await nav.allTextContents()).toEqual(['01 Today','02 Secure Data Room','03 Improvement Record']);
    await expect(page.locator('#nexus-client-today')).toBeVisible();
    await nav.nth(1).click();await expect(page.locator('#nexus-client-files')).toBeVisible();await expect(page.locator('#uploadForm')).toBeVisible();
    await nav.nth(2).click();await expect(page.locator('#nexus-client-improvement')).toBeVisible();
    await expect(page.locator('#nexusClientReportsButton')).toBeVisible();await expect(page.locator('#nexusClientHelpButton')).toBeVisible();await expect(page.locator('#nexusClientInboxButton')).toBeVisible();
    await page.locator('#nexusClientReportsButton').click();await expect(page.locator('#nexus-client-reports')).toBeVisible();
    await page.locator('#nexusClientInboxButton').click();await expect(page.locator('#nexusClientInboxDrawer')).toHaveClass(/show/);await page.keyboard.press('Escape');await expect(page.locator('#nexusClientInboxDrawer')).not.toHaveClass(/show/);
    await page.locator('#nexusClientHelpButton').click();await expect(page.locator('#nexusClientGuideDrawer')).toHaveClass(/show/);await page.keyboard.press('Escape');
    await assertNoOverflow(page);expect(meaningfulConsoleErrors(errors)).toEqual([]);
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

  test('company selector refreshes one coherent client workspace',async({page})=>{
    await signIn(page,clientEmail,clientPassword);
    const select=page.locator('#companySelect'),optionCount=await select.locator('option').count();
    if(qaCompany)expect(await select.locator('option').allTextContents()).toContain(qaCompany);
    if(optionCount>1){
      const second=await select.locator('option').nth(1).getAttribute('value');
      await select.selectOption(second);
      await expect.poll(async()=>await page.locator('#nexusClientMiniContext b').textContent()).not.toBe('');
      await expect(page.locator('#nexus-client-today')).toBeVisible();
    }
  });
});

test.describe('administrator and client-preview boundaries',()=>{
  test.skip(!adminEmail||!adminPassword,'Dedicated Nexus QA administrator credentials are required.');

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

  test('administrator can enter Client View without boot failure',async({page})=>{
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await signIn(page,adminEmail,adminPassword);
    if(qaCompany){const select=page.locator('#companySelect');if((await select.locator('option').allTextContents()).includes(qaCompany))await select.selectOption({label:qaCompany});}
    const switcher=page.locator('#nexusPerspectiveSwitcher');await expect(switcher).toBeVisible();await switcher.locator('summary').click();
    await switcher.locator('[data-perspective="client"]').click();
    await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:25_000});
    await expect(page.getByText('Nexus could not finish loading.',{exact:true})).toHaveCount(0);
    await expect(page.locator('#nexusClientPrimaryNav [data-client-view]')).toHaveCount(3);
    expect(meaningfulConsoleErrors(errors)).toEqual([]);
  });

  test('legacy admin modals open and close without scroll or focus leakage',async({page})=>{
    await signIn(page,adminEmail,adminPassword);
    const cases=[['#newTaskBtn','#taskModal'],['#newMetricBtn','#metricModal'],['#newMilestoneBtn','#milestoneModal'],['#newDocumentRequestBtn','#documentRequestModal']];
    for(const [buttonSelector,modalSelector] of cases){
      const button=page.locator(buttonSelector);if(!(await button.isVisible().catch(()=>false)))continue;
      await button.focus();await button.click();const modal=page.locator(modalSelector);await expect(modal).toHaveClass(/show/);await expect(page.locator('body')).toHaveClass(/nexus-modal-open/);
      await page.keyboard.press('Escape');await expect(modal).not.toHaveClass(/show/);await expect(page.locator('body')).not.toHaveClass(/nexus-modal-open/);await expect(button).toBeFocused();
    }
  });
});
