import {test,expect} from '@playwright/test';

test.use({viewport:{width:390,height:844}});

test('portal auth experience fits a phone viewport without horizontal overflow',async({page})=>{
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#signInForm')).toBeVisible();
  const dims=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth+1);
  const email=page.locator('#signInEmail');
  const password=page.locator('#signInPassword');
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  const emailBox=await email.boundingBox();
  const passBox=await password.boundingBox();
  expect(emailBox?.width||0).toBeGreaterThan(250);
  expect(passBox?.width||0).toBeGreaterThan(250);
});

test('portal primary auth controls meet minimum touch-height expectations',async({page})=>{
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  const targets=['#tabSignIn','#tabCreate','#signInBtn'];
  for(const selector of targets){
    const box=await page.locator(selector).boundingBox();
    expect(box?.height||0).toBeGreaterThanOrEqual(40);
  }
});
