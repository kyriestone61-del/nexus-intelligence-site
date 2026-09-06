import {test,expect} from '@playwright/test';

function meaningful(errors){return errors.filter(text=>!/favicon|analytics|third-party cookie|ResizeObserver loop|cloudflareinsights/i.test(text));}
function watchErrors(page){
  const consoleErrors=[];const pageErrors=[];
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error?.message||error)));
  return ()=>{expect(meaningful(consoleErrors),'Public tool must not emit console errors').toEqual([]);expect(pageErrors,'Public tool must not emit page errors').toEqual([])};
}
async function resetJourney(page,path){
  await page.goto(path,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});
  await page.reload({waitUntil:'domcontentloaded'});
}

test.describe('RELYSTRA public interactive tools',()=>{
  test('mobile menu opens and reaches a canonical public destination',async({page})=>{
    const assertErrors=watchErrors(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/',{waitUntil:'domcontentloaded'});
    const menu=page.getByRole('button',{name:/menu/i});
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded','true');
    const services=page.locator('.navlinks a[href="/services"]').first();
    await expect(services).toBeVisible();
    await services.click();
    await expect(page).toHaveURL(/\/services\/?$/);
    await expect(page.locator('h1')).toBeVisible();
    assertErrors();
  });

  test('free Opportunity Snapshot completes all eight screening steps without sending a lead',async({page})=>{
    const assertErrors=watchErrors(page);
    await resetJourney(page,'/quick-scan');
    const next=page.locator('#snapshotNext');

    await page.locator('.snapshot-step[data-step="0"] .choice[data-value="field"]').click();
    await expect(next).toBeEnabled();await next.click();
    await page.locator('.snapshot-step[data-step="1"] .choice[data-value="6-10"]').click();await next.click();
    await page.locator('.snapshot-step[data-step="2"] .choice[data-value="time"]').click();await next.click();
    const areas=page.locator('.snapshot-step[data-step="3"]');
    await areas.locator('.choice[data-value="admin"]').click();
    await areas.locator('.choice[data-value="reporting"]').click();
    await expect(page.locator('#areaCount')).toContainText('2 selected');await next.click();
    await page.locator('.snapshot-step[data-step="4"] .choice[data-value="daily"]').click();await next.click();
    await page.locator('.snapshot-step[data-step="5"] .choice[data-value="15-40"]').click();await next.click();
    await page.locator('.snapshot-step[data-step="6"] .choice[data-value="multiple"]').click();await next.click();
    const readiness=page.locator('.snapshot-step[data-step="7"]');
    await readiness.locator('[data-subkey="authority"] .choice[data-value="owner"]').click();
    await readiness.locator('[data-subkey="timeline"] .choice[data-value="month"]').click();
    await expect(next).toBeEnabled();await next.click();

    await expect(page.locator('#contactStep')).toHaveClass(/active/);
    await expect(page.locator('#snapshotLeadForm')).toBeVisible();
    await expect(page.locator('#unlockSnapshot')).toBeVisible();
    await expect(page.locator('#snapshotActions')).toBeHidden();
    await expect(page.locator('#leadStatus')).toBeEmpty();
    assertErrors();
  });

  test('deeper Opportunity Diagnostic completes all nine questions and renders a recommendation',async({page})=>{
    const assertErrors=watchErrors(page);
    await resetJourney(page,'/assessment');
    const next=page.locator('#diagNext');

    await page.locator('#diagOffer').fill('Commercial service business');await next.click();
    await page.locator('#diagEmployees').selectOption({index:1});await next.click();
    await page.locator('#diagProblem').fill('Monthly reporting requires repetitive exports, spreadsheet cleanup, and manual review.');await next.click();
    await page.locator('#diagFrequency').selectOption('3');await next.click();
    await page.locator('#diagBurden').selectOption('3');await next.click();
    await page.locator('#diagSystems').fill('Email, spreadsheets, and accounting software');await next.click();
    await page.locator('#diagSensitivity').selectOption('3');await next.click();
    await page.locator('#diagAuthority').selectOption('3');await next.click();
    await page.locator('#diagSuccess').fill('Reduce reporting preparation by at least 10 hours per month while keeping human approval.');await next.click();

    await expect(page.locator('#resultPanel')).toHaveClass(/active/);
    await expect(page.locator('#reportRoot .report-hero')).toBeVisible();
    await expect(page.locator('#reportRoot')).toContainText('Your Relystra AI Opportunity Report');
    await expect(page.locator('#reportRoot')).toContainText('Recommended Relystra path');
    await expect(page.locator('#reportRoot a[href="/book"]')).toBeVisible();
    await expect(page.locator('#reportRoot a[href^="/services/"]')).toBeVisible();
    assertErrors();
  });

  test('ROI scenario calculator recalculates deterministically from user inputs',async({page})=>{
    const assertErrors=watchErrors(page);
    await page.goto('/roi-calculator',{waitUntil:'domcontentloaded'});
    await page.locator('#people').fill('2');
    await page.locator('#hours').fill('10');
    await page.locator('#rate').fill('50');
    await page.locator('#reduction').fill('50');
    await page.locator('#cost').fill('1000');
    await page.locator('#managed').fill('0');

    await expect(page.locator('#monthlyBurden')).toHaveText('$4,330');
    await expect(page.locator('#monthlySaved')).toHaveText('$2,165');
    await expect(page.locator('#annualNet')).toHaveText('$24,980');
    await expect(page.locator('#payback')).toHaveText('0.5 mo');
    await expect(page.locator('a[href="/assessment"]').filter({hasText:/Validate the opportunity/i})).toBeVisible();
    assertErrors();
  });
});
