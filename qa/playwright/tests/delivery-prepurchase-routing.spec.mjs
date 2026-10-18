import {test,expect} from '@playwright/test';

test('empty discovery keeps generation unavailable on the dedicated Free Diagnosis page',async({page})=>{
  await page.goto('/qa/workflow-routing-browser/?reportState=not-ready');
  const journey=page.getByRole('navigation',{name:'Numbered client journey'});

  await journey.getByRole('button',{name:/Upload Discovery Material/}).click();
  await expect(page.getByRole('heading',{name:'Upload Discovery Material'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Generate Free Diagnosis',exact:true})).toHaveCount(0);

  await journey.getByRole('button',{name:/Free Diagnosis/}).click();
  await expect(page.getByRole('heading',{name:'Free Business Diagnosis'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Free Diagnosis report controls'}).getByText('Not ready · upload discovery material first',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Generate Free Diagnosis',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Return to Step 1',exact:true})).toBeVisible();
});
