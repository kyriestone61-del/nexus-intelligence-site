import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;

async function waitForPortal(page,timeout=30_000){
  await expect(page.locator('#portalApp')).toBeVisible({timeout});
  await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/,{timeout});
  await expect(page.locator('#nexusPortalBootOverlay')).toHaveCount(0,{timeout});
  await expect.poll(()=>page.evaluate(()=>window.__nexusPortalBooting===false&&!!window.NexusPortal?.state?.user&&!document.body.classList.contains('nexus-runtime-degraded')),{timeout}).toBe(true);
}

async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await page.locator('#signInEmail').fill(email);
  await page.locator('#signInPassword').fill(password);
  await page.locator('#signInBtn').click();
  await waitForPortal(page);
}

async function openQaAdminCompany(page){
  if(!qaCompany)return null;
  const target=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(option=>option.textContent?.trim()===name)?.value||null,qaCompany);
  if(!target)throw new Error(`Disposable QA company not found: ${qaCompany}`);
  const current=new URL(page.url()).searchParams.get('company');
  if(current!==target){
    await page.goto(`/portal?view_mode=admin&company=${encodeURIComponent(target)}`,{waitUntil:'domcontentloaded'});
    await waitForPortal(page);
  }
  await expect(page.locator('#companySelect')).toHaveValue(target,{timeout:20_000});
  return target;
}

async function openRecords(page){
  const records=page.locator('details.nexus-production-records');
  await expect(records).toBeVisible({timeout:20_000});
  if(!await records.evaluate(node=>node.open))await records.locator('summary').click();
  await expect(records).toHaveAttribute('open','');
  return records;
}

test.describe('authenticated role boundaries',()=>{
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword,'Dedicated QA credentials are required; never use live-client credentials in CI.');

  test('admin reaches one stable simplified journey workspace',async({page})=>{
    const consoleErrors=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    await signIn(page,adminEmail,adminPassword);
    await openQaAdminCompany(page);

    await expect(page.locator('#adminJourneyRoot')).toBeVisible({timeout:20_000});
    await expect(page.getByRole('button',{name:'Client Journey',exact:true})).toHaveCount(0);
    for(const label of ['Home','Clients','Decisions','Sales'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();

    const records=await openRecords(page);
    const diagnosis=records.locator('button').filter({hasText:/Discovery|Diagnosis/i}).first();
    await expect(diagnosis).toBeVisible();
    await diagnosis.click();
    await expect(page.locator('#section-intake')).toHaveClass(/active/,{timeout:15_000});

    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(250);
    const dims=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
    expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth+1);
    await expect(page.locator('#adminJourneyRoot')).toBeVisible();
    await expect(page.getByRole('button',{name:'Client Journey',exact:true})).toHaveCount(0);
    expect(consoleErrors.filter(x=>!/favicon|analytics|ResizeObserver loop/i.test(x))).toEqual([]);
  });

  test('client cannot see administrator navigation or internal company-memory decision notes',async({page})=>{
    await signIn(page,clientEmail,clientPassword);
    await expect(page.getByRole('button',{name:'Client Journey',exact:true})).toHaveCount(0);
    await expect(page.locator('#adminJourneyRoot')).toHaveCount(0);
    await expect(page.getByRole('button',{name:/Discovery & Diagnosis/i})).toHaveCount(0);
    await expect(page.getByText('Important decisions',{exact:true})).toHaveCount(0);
    await expect(page.getByText(/Relystra administrator/i)).toHaveCount(0);
  });

  test('company selector never exposes a company outside the QA client membership',async({page})=>{
    test.skip(!qaCompany,'Set NEXUS_QA_COMPANY_NAME for tenant-boundary verification.');
    await signIn(page,clientEmail,clientPassword);
    const options=await page.locator('#companySelect option').allTextContents();
    expect(options.filter(Boolean)).toEqual([qaCompany]);
  });
});
