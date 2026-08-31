import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;

async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await page.locator('#signInEmail').fill(email);
  await page.locator('#signInPassword').fill(password);
  await page.locator('#signInBtn').click();
  await expect(page.locator('#portalApp')).toBeVisible({timeout:20_000});
}

test.describe('authenticated role boundaries',()=>{
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword,'Dedicated QA credentials are required; never use live-client credentials in CI.');

  test('admin reaches one stable Client Journey workspace',async({page})=>{
    const consoleErrors=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    await signIn(page,adminEmail,adminPassword);
    if(qaCompany){
      const select=page.locator('#companySelect');
      await select.selectOption({label:qaCompany});
    }
    await expect(page.getByRole('button',{name:'Client Journey',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Discovery & Diagnosis',exact:true})).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button',{name:'Client Journey',exact:true})).toBeVisible();
    expect(consoleErrors.filter(x=>!/favicon|analytics/i.test(x))).toEqual([]);
  });

  test('client cannot see administrator navigation or internal company-memory decision notes',async({page})=>{
    await signIn(page,clientEmail,clientPassword);
    await expect(page.getByRole('button',{name:'Client Journey',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Discovery & Diagnosis',exact:true})).toHaveCount(0);
    await expect(page.getByText('Important decisions',{exact:true})).toHaveCount(0);
    await expect(page.getByText(/Nexus administrator/i)).toHaveCount(0);
  });

  test('company selector never exposes a company outside the QA client membership',async({page})=>{
    test.skip(!qaCompany,'Set NEXUS_QA_COMPANY_NAME for tenant-boundary verification.');
    await signIn(page,clientEmail,clientPassword);
    const options=await page.locator('#companySelect option').allTextContents();
    expect(options.filter(Boolean)).toEqual([qaCompany]);
  });
});
