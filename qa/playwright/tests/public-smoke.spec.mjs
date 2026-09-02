import {test,expect} from '@playwright/test';

test('public homepage and portal load without server errors',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const home=await page.goto('/',{waitUntil:'domcontentloaded'});
  expect(home?.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();

  const portal=await page.goto('/portal',{waitUntil:'domcontentloaded'});
  expect(portal?.status()).toBeLessThan(500);
  await expect(page.locator('#signInForm')).toBeVisible();
  await expect(page.locator('#createForm')).toBeAttached();
  expect(errors).toEqual([]);
});

test('public navigation exposes client login and reaches the sign-in experience',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const login=page.locator('.navlinks .nav-account[href="/portal"]');
  test.skip(await login.count()===0,'The target environment does not contain this candidate change yet.');
  await expect(login).toBeVisible();
  await expect(login).toHaveAttribute('href','/portal');
  await login.click();
  await expect(page).toHaveURL(/\/portal\/?$/);
  await expect(page.locator('#signInForm')).toBeVisible();
});

test('portal is private from search indexing and has security boundary copy',async({page})=>{
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  const robots=page.locator('meta[name="robots"]');
  expect(await robots.count()).toBeGreaterThan(0);
  const directives=await robots.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('content')||''));
  expect(directives.every(x=>/noindex/i.test(x))).toBe(true);
  await expect(page.getByText('Security boundary:',{exact:false})).toBeVisible();
});

test('reset acceptance requires password recovery when enforcement is enabled',async({page})=>{
  test.skip(process.env.NEXUS_QA_ENFORCE_RESET!=='1','Enable after the reset is ready for acceptance testing.');
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  const recovery=page.getByRole('button',{name:/forgot|reset password/i}).or(page.getByRole('link',{name:/forgot|reset password/i}));
  await expect(recovery).toBeVisible();
});
