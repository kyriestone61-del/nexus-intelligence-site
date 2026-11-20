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
  const menu=page.getByRole('button',{name:'Menu',exact:true});
  if(await menu.isVisible())await menu.click();
  const login=page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Client login',exact:true});
  await expect(login).toBeVisible();
  await expect(login).toHaveAttribute('href','/portal');
  await expect(login).toHaveAttribute('data-track','nav_client_login');
  await login.click();
  await expect(page).toHaveURL(/\/portal\/?$/);
  await expect(page.locator('#signInForm')).toBeVisible();
});

test('homepage workflow walkthroughs load on desktop and fit a phone viewport',async({page,request})=>{
  await page.goto('/#walkthroughs',{waitUntil:'domcontentloaded'});
  const section=page.locator('#walkthroughs');
  await expect(section.getByRole('heading',{name:'See the workflow, not just the claim.'})).toBeVisible();
  const cards=section.locator('.workflow-video-card');
  await expect(cards).toHaveCount(3);
  await expect(section.locator('video')).toHaveCount(3);
  await expect(section.locator('track[kind="captions"]')).toHaveCount(3);
  await expect(section.locator('details.workflow-transcript')).toHaveCount(3);

  for(const source of await section.locator('video source').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src')))){
    expect(source).toMatch(/^\/assets\/workflow-walkthroughs\/.+\.mp4$/);
    const response=await request.get(source);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('video/mp4');
  }

  await page.setViewportSize({width:390,height:844});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#walkthroughs .workflow-video-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  const widths=await page.locator('#walkthroughs .workflow-video-card').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));
  expect(widths.every(width=>width<=358&&width>=300)).toBe(true);
});

test('portal is private from search indexing and has security boundary copy',async({page})=>{
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  const robots=page.locator('meta[name="robots"]');
  expect(await robots.count()).toBeGreaterThan(0);
  const directives=await robots.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('content')||''));
  expect(directives.every(x=>/noindex/i.test(x))).toBe(true);
  await expect(page.getByText('Keep sensitive information private.',{exact:true})).toBeVisible();
  await expect(page.locator('.nepsis-auth-security')).toContainText('Never upload passwords, MFA codes, API keys, payment-card data, medical records');
});

test('password recovery opens and cancels without sending email',async({page})=>{
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  const recovery=page.getByRole('button',{name:/forgot|reset password/i}).or(page.getByRole('link',{name:/forgot|reset password/i}));
  await expect(recovery).toBeVisible();
  await recovery.click();
  await expect(page.locator('#portalRecoveryRequestForm')).toBeVisible();
  await expect(page.locator('#portalRecoveryEmail')).toBeEditable();
  await page.locator('#portalRecoveryCancel').click();
  await expect(page.locator('#portalRecoveryOverlay')).toHaveCount(0);
  await expect(page.locator('#signInForm')).toBeVisible();
});
