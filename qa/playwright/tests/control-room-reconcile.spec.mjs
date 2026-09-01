import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;
const clientTabs=[['overview','Today'],['data-room','Data Room'],['action-queue','Actions'],['projects','Projects'],['ledger','Improvements'],['notifications','Notifications']];

function meaningfulConsoleErrors(messages){return messages.filter(text=>!/favicon|cloudflareinsights|analytics|ResizeObserver loop/i.test(text));}
async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await page.locator('#signInEmail').fill(email);
  await page.locator('#signInPassword').fill(password);
  await page.locator('#signInBtn').click();
  await expect(page.locator('#portalApp')).toBeVisible({timeout:25_000});
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

test.describe('authenticated Level Two client control room',()=>{
  test.skip(!clientEmail||!clientPassword,'Dedicated Nexus QA client credentials are required.');

  test('client sees six coherent tabs and passes the self-healing health matrix',async({page})=>{
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await signIn(page,clientEmail,clientPassword);
    const nav=page.locator('#nexusClientPrimaryNav [data-client-view]');
    await expect(nav).toHaveCount(6);
    expect(await nav.allTextContents()).toEqual(clientTabs.map(([,label])=>label));
    for(const [index,[key]] of clientTabs.entries()){
      await nav.nth(index).click();
      await expect(page.locator(`#nexus-client-${key}`)).toBeVisible();
      await expect(nav.nth(index)).toHaveAttribute('aria-selected','true');
    }
    await page.locator('[data-client-view="overview"]').click();
    await expect(page.getByRole('heading',{name:'Your Next Single Step'})).toBeVisible();
    await page.locator('[data-client-view="data-room"]').click();
    await expect(page.locator('[data-room-dropzone]')).toBeVisible();
    await expect(page.locator('#uploadForm')).toBeVisible();
    await expect.poll(async()=>await page.evaluate(()=>typeof window.__NEXUS_HEALTH_CHECK)).toBe('function');
    const report=await page.evaluate(()=>window.__NEXUS_HEALTH_CHECK());
    expect(report.status,JSON.stringify(report.matrix.filter(row=>row.result==='FAILED'))).toBe('PASSED');
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.total);
    await assertNoOverflow(page);
    expect(meaningfulConsoleErrors(errors)).toEqual([]);
  });

  test('company selector refreshes one coherent client workspace without page reload',async({page})=>{
    await signIn(page,clientEmail,clientPassword);
    const select=page.locator('#companySelect'),optionCount=await select.locator('option').count();
    if(qaCompany)expect(await select.locator('option').allTextContents()).toContain(qaCompany);
    if(optionCount>1){
      const first=await select.inputValue();
      const second=await select.locator('option').filter({hasNot:page.locator(`option[value="${first}"]`)}).first().getAttribute('value').catch(()=>null) || await select.locator('option').nth(1).getAttribute('value');
      await select.selectOption(second);
      await expect.poll(async()=>await page.evaluate(()=>window.NexusPortal?.state?.companyId)).toBe(second);
      await expect(page.locator('#nexusClientMiniContext b')).not.toHaveText('');
      await expect(page.locator('#nexus-client-overview')).toBeVisible();
    }
  });
});

test.describe('administrator and client-preview boundaries',()=>{
  test.skip(!adminEmail||!adminPassword,'Dedicated Nexus QA administrator credentials are required.');

  test('administrator can enter Client View without boot failure',async({page})=>{
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await signIn(page,adminEmail,adminPassword);
    if(qaCompany){const select=page.locator('#companySelect');if((await select.locator('option').allTextContents()).includes(qaCompany))await select.selectOption({label:qaCompany});}
    const switcher=page.locator('#nexusPerspectiveSwitcher');await expect(switcher).toBeVisible();await switcher.locator('summary').click();
    await switcher.locator('[data-perspective="client"]').click();
    await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:25_000});
    await expect(page.getByText('Nexus could not finish loading.',{exact:true})).toHaveCount(0);
    await expect(page.locator('#nexusClientPrimaryNav [data-client-view]')).toHaveCount(6);
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
