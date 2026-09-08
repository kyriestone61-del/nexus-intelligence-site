import {test,expect} from '@playwright/test';
const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL,adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL,clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD,companyName=process.env.NEXUS_QA_COMPANY_NAME;
async function login(page,email,password){
  await page.goto('/portal');await page.locator('#signInEmail').fill(email);await page.locator('#signInPassword').fill(password);await page.locator('#signInBtn').click();
  await expect(page.locator('#portalApp')).toBeVisible({timeout:45_000});
  await expect.poll(()=>page.evaluate(()=>!!window.NexusPortal?.state?.user&&!window.__nexusPortalBooting),{timeout:45_000}).toBe(true);
}

test('authenticated preparation retains private files and enforces diagnosis and Project payment gates',async({page,browser},info)=>{
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword||!companyName,'Protected disposable QA identities required.');
  test.setTimeout(120_000);
  await login(page,adminEmail,adminPassword);
  const company=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(o=>o.textContent.trim()===name)?.value,companyName);
  expect(company).toBeTruthy();
  const gates=await page.evaluate(async company=>{
    const {sb,state}=window.NexusPortal;
    const diagnosis=await sb.from('nexus_diagnosis_runs').insert({company_id:company,status:'ready_for_review',created_by:state.user.id,analysis_result:{qa_fixture:true}});
    const project=await sb.from('nexus_projects').insert({company_id:company,name:'QA unpaid Project rejection',created_by:state.user.id});
    return {diagnosis:diagnosis.error?.message,project:project.error?.message};
  },company);
  expect(gates.diagnosis).toMatch(/paid|payment|purchase/i);expect(gates.project).toMatch(/paid|payment|purchase/i);
  const context=await browser.newContext({...info.project.use}),client=await context.newPage();
  try{
    await login(client,clientEmail,clientPassword);
    await expect(client.locator('#companySelect')).toHaveValue(company);
    const journey=client.getByRole('navigation',{name:'Numbered client journey'});
    await expect(journey.getByRole('button')).toHaveCount(10);
    await journey.getByRole('button',{name:/Meeting transcript/}).click();
    await expect(client.getByRole('heading',{name:'Add the meeting transcript.'})).toBeVisible();
    await expect(client.locator('[data-transcript-run]')).toHaveCount(0);
    await expect(client.getByRole('button',{name:'Review setup & access',exact:true})).toBeVisible();
    await journey.getByRole('button',{name:/Final handoff/}).click();
    await expect(client.getByRole('heading',{name:'This step begins after scope and payment'})).toBeVisible();

    await client.locator('#nexusClientReportsButton').click();await expect(client.locator('#uploadForm')).toBeVisible();
    const filename=`qa-preparation-${info.project.name}.csv`;
    await client.locator('#docFile').setInputFiles({name:filename,mimeType:'text/csv',buffer:Buffer.from('sample_id,site,owner,status\nQA-001,Sample site,QA owner,received\n')});
    await client.locator('#docNote').fill('Disposable QA preparation sample. No real customer records.');
    await client.locator('#uploadForm button[type="submit"]').click();
    await expect.poll(()=>client.evaluate(async({company,filename})=>{const r=await window.NexusPortal.sb.from('nexus_documents').select('id,project_id,company_id').eq('company_id',company).eq('file_name',filename);if(r.error)throw new Error(r.error.message);return r.data},{company,filename}),{timeout:60_000}).toEqual([expect.objectContaining({project_id:null,company_id:company})]);
    await client.reload();await expect(client.locator('#nexusClientReportsButton')).toBeVisible({timeout:30_000});await client.locator('#nexusClientReportsButton').click();
    await client.locator('#nexus-client-files .nexus-client-shared-files > summary').click();
    await expect(client.locator('#nexus-client-files').getByText(filename,{exact:true})).toBeVisible();
    const facts=await client.evaluate(async company=>{
      const sb=window.NexusPortal.sb;
      const [projects,tasks,otherDocs]=await Promise.all([sb.from('nexus_projects').select('id').eq('company_id',company),sb.from('nexus_tasks').select('id').eq('work_kind','build_task'),sb.from('nexus_documents').select('id').neq('company_id',company)]);
      for(const r of [projects,tasks,otherDocs])if(r.error)throw new Error(r.error.message);
      return {projects:projects.data.length,internalTasks:tasks.data.length,otherCompanyDocuments:otherDocs.data.length};
    },company);
    expect(facts).toEqual({projects:0,internalTasks:0,otherCompanyDocuments:0});
    const dims=await client.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));expect(dims.scroll).toBeLessThanOrEqual(dims.width+1);
  }finally{await context.close()}
});
