import {test,expect} from '../playwright/node_modules/@playwright/test/index.mjs';
const sizes=[{width:1440,height:1000},{width:390,height:844},{width:412,height:915}];
async function fits(page){const d=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(d.scroll).toBeLessThanOrEqual(d.width+1)}
test('account-free Basic Report keeps one primary scope, records decisions, and retains acceptance on refresh',async({page,request})=>{
 const info=await (await request.get('/qa-fixture-info')).json();
 await page.goto('/basic-report#report='+info.reportToken);
 await expect(page.getByRole('heading',{name:'One practical place to start.'})).toBeVisible();
 for(const size of sizes){await page.setViewportSize(size);await fits(page);await expect(page.getByRole('button',{name:'Accept this scope',exact:true})).toBeVisible();await page.screenshot({path:`test-results/basic-report-${size.width}.png`,fullPage:true})}
 await expect(page.locator('.report-panel.primary')).toHaveCount(1);await expect(page.locator('.report-later article')).toHaveCount(1);
 await expect(page.locator('.report-price')).toHaveText('$1,000.00');await expect(page.locator('.report-panel.primary')).toContainText('$500.00 required deposit');
 await page.getByRole('button',{name:'Discuss another recommendation'}).click();await expect(page.getByRole('status')).toContainText('request to discuss');
 await page.getByRole('button',{name:'Accept this scope',exact:true}).click();await expect(page.getByRole('button',{name:'Continue to secure payment'})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Continue to secure payment'})).toBeVisible();
 const response=await request.post('/api/basic-report',{data:{token:info.reportToken,operation:'view'}});const data=await response.json();
 expect(data.report.plan_status).toBe('awaiting_payment');expect(data.report.actor_id).toBeUndefined();expect(data.report.company_id).toBeUndefined();expect(JSON.stringify(data)).not.toContain('transcript');
 const bad=await request.post('/api/basic-report',{data:{token:'0'.repeat(64),operation:'view'}});expect(bad.status()).toBe(404);
});
test('client Roadmap preserves original scope, supports one or multiple additions, and discussion never activates work',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/qa/delivery-browser/?role=client&shell&section=builds');
 await expect(page.getByRole('heading',{name:'Included Now',exact:true})).toBeVisible();
 const checkboxes=page.locator('[data-build-select]');await expect(checkboxes).toHaveCount(2);
 for(const size of sizes){await page.setViewportSize(size);await fits(page);await expect(page.getByRole('button',{name:'Review additional scope and payment',exact:true})).toBeVisible();await page.screenshot({path:`test-results/roadmap-${size.width}.png`,fullPage:true})}
 await checkboxes.nth(0).check();await expect(page.locator('.relystra-build-selection-total')).toContainText('1 selected');
 await checkboxes.nth(1).check();await expect(page.locator('.relystra-build-selection-total')).toContainText('2 selected');await expect(page.locator('.relystra-build-selection-total')).toContainText('$2,000.00 additional scope');
 await page.getByText('Later · 1 other qualified opportunities',{exact:true}).click();
 await page.getByRole('button',{name:'Discuss this Build / confirm scope'}).click();await expect(page.locator('#fixtureNotice')).toContainText('recorded');
 await page.getByRole('button',{name:'Review additional scope and payment',exact:true}).click();
 await expect(page.locator('[data-saved-plans]')).toContainText('$2,000.00');await expect(page.locator('[data-saved-plans]')).toContainText('Required payment now: $1,000.00');
 await page.getByRole('button',{name:'Recommended Builds Completed',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Included Now',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View implementation progress',exact:true}).click();
 await expect(page.getByText('Bid intake',{exact:true})).toBeVisible();await fits(page);expect(errors).toEqual([]);
});
test('administrator can save Offer defaults and the Master Build Library through actual database RPCs',async({page})=>{
 await page.goto('/qa/delivery-browser/?section=offers');await expect(page.getByRole('heading',{name:'Offers & optional local add-ons'})).toBeVisible();
 await page.getByRole('button',{name:'Save Offer defaults',exact:true}).nth(1).click();await expect(page.locator('#fixtureNotice')).toHaveText('Saved.');
 await page.goto('/qa/delivery-browser/?section=templates');await expect(page.getByRole('heading',{name:'Master Build Library'})).toBeVisible();
 await page.getByRole('searchbox',{name:'Find a Build'}).fill('Estimate Follow-Up');
 const card=page.locator('[data-library-card]').filter({hasText:'Estimate Follow-Up System'});await card.locator('summary').click();await card.getByRole('button',{name:'Save capability',exact:true}).click();await expect(page.locator('#fixtureNotice')).toHaveText('Saved.');
});
