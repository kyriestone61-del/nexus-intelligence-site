import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
test('QA register persists synthetic inputs, rejects bad restore and downloads a usable backup',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/delivery/qa-estimate-intake-register/');
  await expect(page.getByRole('heading',{name:'Estimate intake register',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save request',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Enter id');
  const a={id:'QA-001',site:'Sample North Site',contact:'qa-contact@example.invalid',scope:'lobby floor cleaning estimate',urgency:'normal',owner:'QA Coordinator',status:'received',due:'2026-09-10',source:'synthetic phone note'};
  const b={...a,id:'QA-002',site:'Sample South Site',contact:'qa-backup@example.invalid',scope:'window cleaning estimate',urgency:'urgent',owner:'QA Reviewer',status:'needs clarification',due:'2026-09-11',source:'synthetic email note'};
  async function fill(record){for(const [key,value] of Object.entries(record)){const field=page.locator(`[name="${key}"]`);if(['urgency','status'].includes(key))await field.selectOption(value);else await field.fill(value);}await page.getByRole('button',{name:'Save request',exact:true}).click();}
  await fill(a);await fill(b);await expect(page.locator('#count')).toHaveText('2 saved');
  await fill(a);await expect(page.getByRole('alert')).toContainText('Duplicate request ID');await expect(page.locator('#count')).toHaveText('2 saved');
  await page.reload();await expect(page.locator('#count')).toHaveText('2 saved');
  await page.locator('#importFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"format":"relystra-qa-intake","version":1,"records":[{"id":"bad"}]}')});
  await expect(page.getByRole('alert')).toContainText('Import rejected');await expect(page.locator('#count')).toHaveText('2 saved');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON backup',exact:true}).click();
  const download=await downloadPromise,path=info.outputPath('backup.json');await download.saveAs(path);const text=await fs.readFile(path,'utf8');expect(JSON.parse(text).records).toEqual([a,b]);
  await page.locator('#importFile').setInputFiles(path);await page.getByRole('button',{name:'Replace with validated backup',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Restored 2 requests.');
  await page.getByRole('button',{name:'Edit request QA-001',exact:true}).click();await expect(page.locator('[name="id"]')).toHaveAttribute('readonly','');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.locator('#count')).toHaveText('2 saved');
  const offlinePromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download offline tool',exact:true}).click();const offline=await offlinePromise;const offlinePath=info.outputPath('offline.html');await offline.saveAs(offlinePath);const html=await fs.readFile(offlinePath,'utf8');expect(html).toContain('function validateRecords');expect(html).not.toContain('readonly=""');
  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,short:[...document.querySelectorAll('#requestForm input,#requestForm textarea,#requestForm select,#requestForm button')].filter(n=>!n.hidden&&n.getBoundingClientRect().height<44).length}));expect(size.scroll).toBeLessThanOrEqual(size.width);expect(size.short).toBe(0);expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('register.png'),fullPage:true});
});
