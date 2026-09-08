import {test,expect} from '@playwright/test';
const file={name:'meeting-transcript.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC QA: meeting discussed intake and scheduling. No real client data.')};
test('transcript upload failure retains file, retry persists, diagnosis failure recovers without duplicate navigation runs',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/qa/journey-browser/?upload=fail&diagnosis=fail');
  await expect(page.getByRole('navigation',{name:'Numbered client journey'}).getByRole('button')).toHaveCount(10);
  await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:'Upload meeting transcript',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Simulated upload failure');expect(await page.locator('input[type=file]').evaluate(e=>e.files.length)).toBe(1);
  await page.getByRole('button',{name:'Upload meeting transcript',exact:true}).click();await expect(page.getByText('Transcript ready:',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Run Diagnosis',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Simulated diagnosis failure');
  await page.getByRole('button',{name:'Retry existing diagnosis',exact:true}).click();await expect(page.getByRole('heading',{name:'Existing diagnosis review'})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:/Meeting transcript/}).click();await page.getByRole('button',{name:'Continue to diagnosis & approval',exact:true}).click();await expect(page.locator('#calls')).toHaveText('2');
  await page.reload();await expect(page.getByText('Transcript ready:',{exact:false})).toBeVisible();
  await page.locator('#company').selectOption('b');await expect(page.getByText('No transcript selected yet.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Run Diagnosis',exact:true})).toBeDisabled();
  await page.getByRole('navigation').getByRole('button',{name:/Final handoff/}).click();await expect(page.getByRole('heading',{name:'This step begins after scope and payment'})).toBeVisible();
  const dims=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));expect(dims.s).toBeLessThanOrEqual(dims.w+1);expect(errors).toEqual([]);
});
test('client can save a transcript but cannot run internal diagnosis or bypass unpaid access',async({page})=>{
 await page.goto('/qa/journey-browser/?role=client&access=no');await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:'Upload meeting transcript',exact:true}).click();await expect(page.getByText('Transcript ready:',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Review setup & access',exact:true})).toBeVisible();await expect(page.locator('[data-transcript-run]')).toHaveCount(0);await expect(page.locator('#calls')).toHaveText('0');
});
