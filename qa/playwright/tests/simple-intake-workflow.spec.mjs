import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;

async function settled(page,timeout=45_000){
  await expect(page.locator('#portalApp')).toBeVisible({timeout});
  await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/,{timeout});
  await expect.poll(()=>page.evaluate(()=>window.__nexusPortalBooting===false&&!!window.NexusPortal?.state?.user),{timeout}).toBe(true);
}
async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  if(!await page.evaluate(email=>window.NexusPortal?.state?.user?.email===email,email).catch(()=>false)){
    await page.locator('#signInEmail').fill(email);await page.locator('#signInPassword').fill(password);await page.locator('#signInBtn').click();
  }
  await settled(page);
}
async function adminLogin(page){
  await signIn(page,adminEmail,adminPassword);
  const companyId=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(o=>o.textContent?.trim()===name)?.value||null,qaCompany);
  if(!companyId)throw new Error(`Disposable QA company not found: ${qaCompany}`);
  await page.goto(`/portal?view_mode=admin&company=${encodeURIComponent(companyId)}`,{waitUntil:'domcontentloaded'});await settled(page);return companyId;
}
function contextOptions(testInfo){const use=testInfo.project.use||{},out={baseURL:use.baseURL};for(const key of ['viewport','userAgent','deviceScaleFactor','isMobile','hasTouch','locale','colorScheme'])if(use[key]!==undefined)out[key]=use[key];return out}

test.describe('RELYSTRA simplified intake',()=>{
  test.describe.configure({retries:0});
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword||!qaCompany,'Disposable authenticated QA identities are required.');

  test('fresh assessment starts with exactly two ordered client steps',async({page,browser},testInfo)=>{
    test.setTimeout(150_000);
    const companyId=await adminLogin(page);
    const created=await page.evaluate(async({companyId})=>{
      const p=window.NexusPortal,sb=p.sb,userId=p.state.user.id;
      const project=await sb.from('nexus_projects').insert({
        company_id:companyId,name:`QA Simple Intake ${Date.now()}`,service_type:'AI Opportunity Assessment / Intake',service_slug:'ai-opportunity-assessment',
        status:'planning',summary:'Disposable simplified-intake certification',created_by:userId,project_type:'discovery',engagement_stage:'diagnosis',owner_scope:'client'
      }).select('id').single();if(project.error)throw new Error(project.error.message);
      const active=await sb.from('nexus_active_engagements').upsert({company_id:companyId,project_id:project.data.id,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'company_id'});if(active.error)throw new Error(active.error.message);
      await p.workspace?.();
      const tasks=await sb.from('nexus_tasks').select('id,title,status,assignee,notify_client,task_type,template_code,dependency_task_id,sort_order,workflow_metadata').eq('project_id',project.data.id).order('sort_order');if(tasks.error)throw new Error(tasks.error.message);
      return {projectId:project.data.id,tasks:tasks.data||[]};
    },{companyId});

    expect(created.tasks).toHaveLength(2);
    expect(created.tasks.map(t=>t.title)).toEqual(['Tell us about the business','Show us how the work happens today']);
    const [first,second]=created.tasks;
    expect(first.status).toBe('waiting_on_client');expect(first.notify_client).toBe(true);expect(first.task_type).toBe('discovery_information_request');expect(first.dependency_task_id).toBeNull();expect(first.workflow_metadata?.simple_flow).toBe(true);
    expect(second.status).toBe('not_started');expect(second.notify_client).toBe(false);expect(second.dependency_task_id).toBe(first.id);expect(second.workflow_metadata?.simple_flow).toBe(true);

    const early=await page.evaluate(async({id})=>{const {error}=await window.NexusPortal.sb.from('nexus_tasks').update({status:'in_progress'}).eq('id',id);return error?.message||null},{id:second.id});
    expect(early).toMatch(/Finish the previous workflow step/i);

    const clientContext=await browser.newContext(contextOptions(testInfo));const clientPage=await clientContext.newPage();
    try{
      await signIn(clientPage,clientEmail,clientPassword);
      await expect(clientPage.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:30_000});
      const actions=clientPage.locator('#nexusClientActionsButton');await expect(actions).toBeVisible();await actions.click();
      await expect(clientPage.getByText('Tell us about the business',{exact:true}).first()).toBeVisible({timeout:20_000});

      const submitted=await clientPage.evaluate(async({taskId})=>{
        const response={business_summary:'QA service business',workflow_focus:'Monthly reporting workflow',people:'Owner and assistant',systems:'Email and spreadsheets',success:'A repeatable monthly report with less manual handling'};
        const {data,error}=await window.NexusPortal.sb.rpc('nexus_submit_task_for_review',{p_task_id:taskId,p_response_data:response});if(error)throw new Error(error.message);return data;
      },{taskId:first.id});
      expect(submitted).toBe(first.id);
      await expect.poll(()=>clientPage.evaluate(async({id})=>{const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('status,response_data').eq('id',id).single();if(error)throw new Error(error.message);return data.status},{id:first.id}),{timeout:20_000}).toBe('ready_for_review');

      const approved=await page.evaluate(async({taskId})=>{const {data,error}=await window.NexusPortal.sb.rpc('nexus_approve_task',{p_task_id:taskId,p_note:null});if(error)throw new Error(error.message);return data},{taskId:first.id});
      expect(approved).toBe(first.id);

      await expect.poll(()=>page.evaluate(async({id})=>{const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('status,notify_client').eq('id',id).single();if(error)throw new Error(error.message);return `${data.status}:${data.notify_client}`},{id:second.id}),{timeout:25_000,message:'Second intake step must release only after the first is approved'}).toBe('waiting_on_client:true');

      const evidenceReady=await page.evaluate(async({id})=>{const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('task_type,response_data').eq('id',id).single();if(error)throw new Error(error.message);return {taskType:data.task_type,hasBusiness:!!data.response_data?.business_summary,hasWorkflow:!!data.response_data?.workflow_focus}},{id:first.id});
      expect(evidenceReady).toEqual({taskType:'discovery_information_request',hasBusiness:true,hasWorkflow:true});

      await clientPage.reload({waitUntil:'domcontentloaded'});await settled(clientPage);await clientPage.locator('#nexusClientActionsButton').click();
      await expect(clientPage.getByText('Show us how the work happens today',{exact:true}).first()).toBeVisible({timeout:20_000});
    }finally{await clientContext.close()}
  });
});