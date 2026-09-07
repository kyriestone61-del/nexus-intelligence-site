import {test,expect} from '@playwright/test';
const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL,adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL,clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD,companyName=process.env.NEXUS_QA_COMPANY_NAME;
async function login(page,email,password){
  await page.goto('/portal');await page.locator('#signInEmail').fill(email);await page.locator('#signInPassword').fill(password);await page.locator('#signInBtn').click();
  await expect(page.locator('#portalApp')).toBeVisible({timeout:45_000});
  await expect.poll(()=>page.evaluate(()=>!!window.NexusPortal?.state?.user&&!window.__nexusPortalBooting),{timeout:45_000}).toBe(true);
}
async function status(page,id){return page.evaluate(async id=>{const r=await window.NexusPortal.sb.from('nexus_tasks').select('status').eq('id',id).single();if(r.error)throw r.error;return r.data.status},id)}
async function openActions(page){await page.locator('#nexusClientPrimaryNav [data-client-view="actions"]').click();await expect(page.locator('#nexus-client-actions')).toBeVisible()}

test('authenticated pre-build input: approval, private upload, submission, clarification and acceptance without a Project',async({page,browser},info)=>{
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword||!companyName,'Protected disposable QA identities required.');
  test.setTimeout(180_000);
  await login(page,adminEmail,adminPassword);
  const company=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(o=>o.textContent.trim()===name)?.value,companyName);
  expect(company).toBeTruthy();
  const id=await page.evaluate(async({company,tag})=>{
    const {sb,state}=window.NexusPortal;
    const r=await sb.from('nexus_diagnosis_runs').insert({company_id:company,status:'ready_for_review',created_by:state.user.id,analysis_result:{client_action_items:[{title:`QA input ${tag}`,instructions:'Attach the sample intake CSV and identify its columns. QA sample only, not business facts.',template_code:'prebuild_representative_sheet'}],nexus_actions:[]},orchestration_summary:{qa_fixture:true}}).select('id').single();if(r.error)throw r.error;
    const approval=await sb.rpc('nexus_approve_diagnosis',{p_run_id:r.data.id,p_note:'Disposable QA fixture; not a paid diagnosis or business recommendation.'});if(approval.error)throw approval.error;
    const t=await sb.from('nexus_tasks').select('id').eq('source_diagnosis_run_id',r.data.id).single();if(t.error)throw t.error;return t.data.id;
  },{company,tag:info.project.name+' '+Date.now()});
  const context=await browser.newContext({...info.project.use}),client=await context.newPage();
  try{
    await login(client,clientEmail,clientPassword);
    const hidden=await client.evaluate(async id=>{const r=await window.NexusPortal.sb.from('nexus_tasks').select('id').eq('id',id);if(r.error)throw r.error;return r.data.length},id);
    expect(hidden).toBe(0);
    await page.evaluate(async id=>{const r=await window.NexusPortal.sb.rpc('relystra_review_action',{p_task_id:id,p_decision:'approve'});if(r.error)throw r.error},id);
    await client.reload();await expect(client.locator('[data-client-view="actions"]')).toBeVisible({timeout:30_000});await openActions(client);
    const card=client.locator(`[data-action-engine-task="${id}"]`);await expect(card).toBeVisible();
    await card.locator('[data-action-submit]').click();
    await expect.poll(()=>status(page,id)).toBe('waiting_on_client');
    await card.locator('[data-action-upload]').click();await expect(client.locator('#uploadForm')).toBeVisible();
    const filename=`qa-intake-${info.project.name}.csv`;
    await client.locator('#docFile').setInputFiles({name:filename,mimeType:'text/csv',buffer:Buffer.from('sample_id,site,owner,status\nQA-001,Sample site,QA owner,received\n')});
    await client.locator('#docNote').fill('Disposable QA sample. Column meanings: sample_id is the request ID; site is a sample location; owner is the responsible role; status is the intake state.');
    await client.locator('#uploadForm button[type="submit"]').click();
    await expect.poll(()=>client.evaluate(async id=>{const r=await window.NexusPortal.sb.from('nexus_documents').select('id,project_id').eq('task_id',id);if(r.error)throw r.error;return r.data},id),{timeout:60_000}).toEqual([expect.objectContaining({project_id:null})]);
    await openActions(client);await card.locator('[data-action-submit]').click();await expect.poll(()=>status(page,id)).toBe('ready_for_review');
    await page.evaluate(async id=>{const r=await window.NexusPortal.sb.rpc('nexus_request_task_revision',{p_task_id:id,p_note:'Confirm explicitly that every row is a QA sample.'});if(r.error)throw r.error},id);
    await client.reload();await expect(client.locator('[data-client-view="actions"]')).toBeVisible({timeout:30_000});await openActions(client);
    await card.locator('.action-engine-detail-toggle').click();await card.locator('[data-action-note]').fill('Confirmed: every row is a disposable QA sample, not a real customer record.');
    await card.locator('[data-action-submit]').click();await expect.poll(()=>status(page,id)).toBe('ready_for_review');
    await page.evaluate(async id=>{const r=await window.NexusPortal.sb.rpc('nexus_approve_task',{p_task_id:id,p_note:'Verified the attached QA sample and clarification.'});if(r.error)throw r.error},id);
    await expect.poll(()=>status(page,id)).toBe('completed');
    const facts=await page.evaluate(async({company,id})=>{const sb=window.NexusPortal.sb;const [p,t]=await Promise.all([sb.from('nexus_projects').select('id').eq('company_id',company),sb.from('nexus_tasks').select('response_data,source_finding_refs').eq('id',id).single()]);if(p.error||t.error)throw p.error||t.error;return {projects:p.data.length,task:t.data}},{company,id});
    expect(facts.projects).toBe(0);expect(facts.task.source_finding_refs).toHaveLength(1);expect(facts.task.response_data.client_note).toContain('disposable QA sample');
    const dims=await client.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));expect(dims.scroll).toBeLessThanOrEqual(dims.width+1);
  }finally{await context.close()}
});
