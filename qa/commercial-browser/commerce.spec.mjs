import {test,expect} from '../playwright/node_modules/@playwright/test/index.mjs';
test.beforeEach(async({request})=>{const r=await request.post('/qa-reset-commercial');expect((await r.json()).error).toBeNull()});
async function fits(page){const d=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(d.scroll).toBeLessThanOrEqual(d.width+1)}
test('account-free Basic Report keeps one primary scope, records decisions, and retains acceptance on refresh',async({page,request},testInfo)=>{
 const info=await (await request.get('/qa-fixture-info')).json();
 await page.goto('/basic-report#report='+info.reportToken);
 await expect(page.getByRole('heading',{name:'One practical place to start.'})).toBeVisible();
 for(const size of [page.viewportSize()]){await page.setViewportSize(size);await fits(page);await expect(page.getByRole('button',{name:'Accept this scope',exact:true})).toBeVisible();await page.screenshot({path:`test-results/basic-report-${testInfo.project.name}.png`,fullPage:true})}
 await expect(page.locator('.report-panel.primary')).toHaveCount(1);await expect(page.locator('.report-later article')).toHaveCount(1);
 await expect(page.locator('.report-price')).toHaveText('$1,000.00');await expect(page.locator('.report-panel.primary')).toContainText('$500.00 required deposit');
 await page.getByRole('button',{name:'Discuss another recommendation'}).click();await expect(page.getByRole('status')).toContainText('request to discuss');
 await page.getByRole('button',{name:'Accept this scope',exact:true}).click();await expect(page.getByRole('button',{name:'Continue to secure payment'})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Continue to secure payment'})).toBeVisible();
 const response=await request.post('/api/basic-report',{data:{token:info.reportToken,operation:'view'}});const data=await response.json();
 expect(data.report.plan_status).toBe('awaiting_payment');expect(data.report.actor_id).toBeUndefined();expect(data.report.company_id).toBeUndefined();expect(JSON.stringify(data)).not.toContain('transcript');
 const bad=await request.post('/api/basic-report',{data:{token:'0'.repeat(64),operation:'view'}});expect(bad.status()).toBe(404);
});
test('client Roadmap preserves original scope, supports one or multiple additions, and discussion never activates work',async({page,request},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/qa/delivery-browser/?role=client&shell&section=builds');
 await expect(page.getByRole('heading',{name:'Included Now',exact:true})).toBeVisible();
 const checkboxes=page.locator('[data-build-select]');await expect(checkboxes).toHaveCount(2);
 for(const size of [page.viewportSize()]){await page.setViewportSize(size);await fits(page);await expect(page.getByRole('button',{name:'Review additional scope and payment',exact:true})).toBeVisible();await page.screenshot({path:`test-results/roadmap-${testInfo.project.name}.png`,fullPage:true})}
 await checkboxes.nth(0).check();await expect(page.locator('.relystra-build-selection-total')).toContainText('1 selected');
 await checkboxes.nth(1).check();await expect(page.locator('.relystra-build-selection-total')).toContainText('2 selected');await expect(page.locator('.relystra-build-selection-total')).toContainText('$2,000.00 additional scope');
 await page.getByText('Later · 1 other qualified opportunities',{exact:true}).click();
 await page.getByRole('button',{name:'Discuss this Build / confirm scope'}).click();await expect(page.locator('#fixtureNotice')).toContainText('recorded');
 await page.getByRole('button',{name:'Review additional scope and payment',exact:true}).click();
 await expect(page.locator('[data-saved-plans]')).toContainText('$2,000.00');await expect(page.locator('[data-saved-plans]')).toContainText('Required payment now: $1,000.00');
 await page.getByRole('button',{name:'Recommended Builds Completed',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Included Now',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View implementation progress',exact:true}).click();
 await expect(page.locator('#nexus-client-progress').getByText('Bid intake',{exact:true})).toBeVisible();await fits(page);expect(errors).toEqual([]);
});
test('administrator can save Offer defaults and the Master Build Library through actual database RPCs',async({page})=>{
 await page.goto('/qa/delivery-browser/?section=offers');await expect(page.getByRole('heading',{name:'Offers & optional local add-ons'})).toBeVisible();
 await page.getByRole('button',{name:'Save Offer defaults',exact:true}).nth(1).click();await expect(page.locator('#fixtureNotice')).toHaveText('Saved.');
 await page.goto('/qa/delivery-browser/?section=templates');await expect(page.getByRole('heading',{name:'Master Build Library'})).toBeVisible();
 await page.getByRole('searchbox',{name:'Find a Build'}).fill('Estimate Follow-Up');
 const card=page.locator('[data-library-card]').filter({hasText:'Estimate Follow-Up System'});await card.locator('summary').click();await card.getByRole('button',{name:'Save capability',exact:true}).click();await expect(page.locator('#fixtureNotice')).toHaveText('Saved.');
});

test('administrator requests a private input for its paid Build before implementation',async({page})=>{
 await page.goto('/qa/delivery-browser/?section=progress');
 await page.getByText('Inputs · Bid intake',{exact:true}).click();
 const form=page.locator('[data-delivery-form="request-input"]');
 await form.getByLabel('Input title',{exact:true}).fill('Authorized sample rows');
 await form.getByLabel('Why this input is needed',{exact:true}).fill('Populate the accepted intake register with authorized sample rows.');
 await form.getByRole('button',{name:'Request Build input',exact:true}).click();
 await expect(page.getByText('Bid intake: Authorized sample rows',{exact:true})).toBeVisible();
 await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test('rendered Services preserves the settled free-to-paid sequence and retires legacy injected recommendations',async({page})=>{
 await page.goto('/services');
 await expect(page.getByRole('heading',{name:'One workflow. A clearer way forward.'})).toBeVisible();
 await expect(page.locator('body')).not.toContainText('AI Opportunity Assessment');
 await expect(page.locator('body')).not.toContainText('Free AI Snapshot');
 await expect(page.locator('#nxServiceGuide')).toHaveCount(0);
 await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',/owner-led construction businesses/);
 await expect(page.locator('footer')).toContainText('Nepsis Intelligence');
 await expect(page.locator('footer')).toContainText('Practical systems. Human-led.');
 await expect(page.getByRole('heading',{name:'Basic Diagnosis report',exact:true})).toBeVisible();
 const paid=page.locator('.service-card').filter({hasText:'Full Diagnosis + implementation'});
 await expect(paid).toContainText('One paid engagement combines deeper diagnosis with a bounded implementation.');
 await expect(page.locator('body')).not.toContainText('$350');
 await fits(page);
});

test('rendered Delivery Standard remains inside the Nepsis public sequence',async({page})=>{
 await page.goto('/delivery-standard');
 await expect(page.getByRole('heading',{name:'The Nepsis Intelligence Engagement Evidence Chain.'})).toBeVisible();
 await expect(page.locator('body')).not.toContainText('Free Discovery');
 await expect(page.locator('body')).not.toContainText('Basic Report');
 await expect(page.locator('body')).not.toContainText('recommended Build');
 await expect(page.locator('#nxNextStep')).toHaveCount(0);
 await expect(page.locator('#nexusSchema')).toHaveCount(0);
 await expect(page.locator('link[href="/simple-site.css"]')).toHaveCount(0);
 await expect(page.locator('link[href="/mobile-ux.css"]')).toHaveCount(0);
 const login=page.locator('.navlinks a[href="/portal"]');
 await expect(login).toHaveAttribute('href','/portal');
 if(!await login.isVisible())await page.getByRole('button',{name:'Open navigation'}).click();
 await expect(login).toBeVisible();
 for(const retired of ['/industries','/problems','/capabilities'])await expect(page.locator(`.navlinks a[href="${retired}"]`)).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Schedule a free consultation'}).first()).toHaveAttribute('href','/book');
 await fits(page);
});

test('current capabilities page renders without its retired catalog injector',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/capabilities');
 await expect(page.getByRole('heading',{name:'The workflow comes first.',exact:true})).toBeVisible();
 await fits(page);expect(errors).toEqual([]);
});
