import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;

async function waitForSettledPortal(page,timeout=45_000){
  await expect(page.locator('#portalApp')).toBeVisible({timeout});
  await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/,{timeout});
  await expect(page.locator('#nexusPortalBootOverlay')).toHaveCount(0,{timeout});
  await expect.poll(()=>page.evaluate(()=>{
    const state=window.NexusPortal?.state;
    const shell=state?.admin&&state.viewMode!=='client'?document.querySelector('.nexus-production-primary-nav'):document.getElementById('nexusClientPrimaryNav');
    return window.__nexusPortalBooting===false&&!!state?.user&&!!shell&&!document.body.classList.contains('nexus-runtime-degraded');
  }),{timeout,message:'Authenticated Relystra workspace must finish loading'}).toBe(true);
}
async function signIn(page,email,password){
  const already=await page.evaluate(email=>window.NexusPortal?.state?.user?.email===email,email).catch(()=>false);
  if(!already){await page.goto('/portal',{waitUntil:'domcontentloaded'});await page.locator('#signInEmail').fill(email);await page.locator('#signInPassword').fill(password);await page.locator('#signInBtn').click()}
  else await page.evaluate(()=>window.NexusPortal.workspace?.());
  await waitForSettledPortal(page);
}
async function selectQaCompany(page){
  const id=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(option=>option.textContent?.trim()===name)?.value||null,qaCompany);
  if(!id)throw new Error(`Disposable QA company not found: ${qaCompany}`);
  const current=new URL(page.url()).searchParams.get('company');
  if(current!==id){await page.goto(`/portal?view_mode=admin&company=${encodeURIComponent(id)}`,{waitUntil:'domcontentloaded'});await waitForSettledPortal(page)}
  await expect(page.locator('#companySelect')).toHaveValue(id,{timeout:20_000});return id;
}
async function adminLogin(page){await signIn(page,adminEmail,adminPassword);return selectQaCompany(page)}
async function clientLogin(page){await signIn(page,clientEmail,clientPassword);await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:30_000})}
async function waitForTaskStatus(page,id,status,timeout=35_000){
  await expect.poll(()=>page.evaluate(async({id})=>{const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('status').eq('id',id).single();if(error)throw new Error(error.message);return data.status},{id}),{timeout,message:`Task ${id} must reach ${status}`}).toBe(status);
}
async function openAdminActions(page,view='my_work'){
  await page.evaluate(async()=>{await window.NexusPortal.workspace?.()});
  await page.evaluate(()=>document.querySelector('.side-nav button[data-section="tasks"]')?.click());
  await expect(page.locator('#section-tasks')).toHaveClass(/active/,{timeout:15_000});
  const filters=page.locator('#actionExecutionFilters');
  if(await filters.isVisible().catch(()=>false)){
    const filter=page.locator(`#actionExecutionFilters button[data-view="${view}"]`);
    await expect(filter).toBeVisible({timeout:15_000});await filter.click();await expect(filter).toHaveClass(/active/);
  }else{
    await expect(page.locator('#taskList')).toBeVisible({timeout:15_000});
  }
}
async function openClientActions(page){const button=page.locator('#nexusClientActionsButton');await expect(button).toBeVisible({timeout:20_000});await button.click();await expect(page.locator('#nexus-client-actions')).toHaveClass(/active/,{timeout:15_000})}
async function ensureDetails(card){const details=card.locator('.action-engine-details');if(await details.getAttribute('hidden')!==null)await card.locator('.action-engine-detail-toggle').click();await expect(details).toBeVisible()}
async function fillRequiredFields(card,preferred={}){
  const controls=card.locator('[data-action-field][data-required="true"]');
  for(let i=0;i<await controls.count();i+=1){const control=controls.nth(i),key=await control.getAttribute('data-action-field'),tag=await control.evaluate(el=>el.tagName),type=await control.getAttribute('type');
    if(preferred[key]!==undefined){if(tag==='SELECT')await control.selectOption({label:preferred[key]}).catch(()=>control.selectOption({value:preferred[key]}));else await control.fill(preferred[key]);continue}
    if(tag==='SELECT'){const options=await control.locator('option').count();if(options>0)await control.selectOption({index:0})}
    else if(type==='date')await control.fill('2026-09-30');else await control.fill('Operational release QA response');
  }
}
function inheritedClientContextOptions(testInfo){const use=testInfo.project.use||{};const options={baseURL:use.baseURL};for(const key of ['viewport','userAgent','deviceScaleFactor','isMobile','hasTouch','locale','colorScheme'])if(use[key]!==undefined)options[key]=use[key];return options}

async function completeClientStep(clientPage,adminPage,taskId,preferred={}){
  await clientLogin(clientPage);await openClientActions(clientPage);
  let card=clientPage.locator(`[data-action-engine-task="${taskId}"]`);await expect(card).toBeVisible({timeout:25_000});
  const start=card.locator('[data-action-start]');if(await start.isVisible().catch(()=>false))await start.click();
  await waitForTaskStatus(clientPage,taskId,'in_progress');
  card=clientPage.locator(`[data-action-engine-task="${taskId}"]`);await ensureDetails(card);await fillRequiredFields(card,preferred);await card.locator('[data-action-submit]').click();await waitForTaskStatus(clientPage,taskId,'ready_for_review');
  await openAdminActions(adminPage,'ready_review');const adminCard=adminPage.locator(`.action-v2-card[data-task-id="${taskId}"],.operational-action-card[data-task-id="${taskId}"]`).first();await expect(adminCard).toBeVisible({timeout:25_000});await adminCard.locator('.admin-approve-task').click();await waitForTaskStatus(adminPage,taskId,'completed');
}
async function completeRelystraStep(adminPage,taskId){
  await openAdminActions(adminPage,'my_work');const card=adminPage.locator(`.action-v2-card[data-task-id="${taskId}"],.operational-action-card[data-task-id="${taskId}"]`).first();await expect(card).toBeVisible({timeout:25_000});
  if(await card.locator('.admin-start-task').isVisible().catch(()=>false))await card.locator('.admin-start-task').click();
  await waitForTaskStatus(adminPage,taskId,'in_progress');await openAdminActions(adminPage,'my_work');const refreshed=adminPage.locator(`.action-v2-card[data-task-id="${taskId}"],.operational-action-card[data-task-id="${taskId}"]`).first();await refreshed.locator('.admin-complete-task').click();await waitForTaskStatus(adminPage,taskId,'completed');
}

test.describe('RELYSTRA Operational Release 1',()=>{
  test.describe.configure({retries:0});
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword||!qaCompany,'Disposable authenticated QA identities are required.');

  test('one diagnosis-led workflow completes end to end',async({page,browser},testInfo)=>{
    test.setTimeout(480_000);
    const companyId=await adminLogin(page);
    const setup=await page.evaluate(async({companyId})=>{
      const portal=window.NexusPortal,sb=portal.sb,userId=portal.state.user.id;
      const prior=await sb.from('nexus_projects').select('id,status,name').eq('company_id',companyId).like('name','QA Operational Release%');if(prior.error)throw new Error(prior.error.message);
      for(const project of prior.data||[])if(!['complete','cancelled'].includes(String(project.status||'').toLowerCase())){const closed=await sb.from('nexus_projects').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',project.id);if(closed.error)throw new Error(closed.error.message)}
      const cleared=await sb.from('nexus_active_engagements').delete().eq('company_id',companyId);if(cleared.error)throw new Error(cleared.error.message);
      const created=await sb.from('nexus_projects').insert({company_id:companyId,name:`QA Operational Release ${Date.now()}`,service_type:'AI Opportunity Assessment',status:'planning',summary:'Disposable RELYSTRA single-workflow certification',created_by:userId,project_type:'diagnosis_pilot',engagement_stage:'diagnosis',owner_scope:'nexus'}).select('*').single();if(created.error)throw new Error(created.error.message);
      const active=await sb.from('nexus_active_engagements').upsert({company_id:companyId,project_id:created.data.id,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'company_id'});if(active.error)throw new Error(active.error.message);
      await portal.workspace?.();await portal.syncActiveEngagement?.();return {projectId:created.data.id};
    },{companyId});

    await expect.poll(()=>page.evaluate(()=>window.NexusFoundationHardening?.activeProject?.()?.id||null),{timeout:25_000,message:'Fresh engagement must be canonical'}).toBe(setup.projectId);
    await page.evaluate(async()=>{await window.NexusPortal.workspace();window.NexusDiagnosisController?.invalidateLatest?.()});await page.evaluate(()=>document.querySelector('.side-nav button[data-section="intake"]')?.click());await expect(page.locator('#section-intake')).toHaveClass(/active/,{timeout:15_000});
    await page.locator('#toggleEvidenceUploadBtn').click();await page.locator('#adminEvidenceFile').setInputFiles({name:'relystra-operational-release-transcript.txt',mimeType:'text/plain',buffer:Buffer.from('Discovery call transcript. The client manually exports monthly financial transactions and reporting is delayed. The client wants one repeatable monthly reporting workflow with clear visibility into money coming in and going out. Human approval must remain in place. Relystra should recommend one smallest responsible first intervention.')});await page.locator('#adminEvidenceCategory').selectOption({label:'Client Source'});await page.locator('#adminEvidenceNote').fill('Operational Release single-workflow diagnosis evidence.');await page.locator('#adminEvidenceForm button[type="submit"]').click();
    await expect.poll(()=>page.evaluate(async({companyId,projectId})=>{const {count,error}=await window.NexusPortal.sb.from('nexus_documents').select('id',{count:'exact',head:true}).eq('company_id',companyId).eq('project_id',projectId).eq('file_name','relystra-operational-release-transcript.txt');if(error)throw new Error(error.message);return count||0},{companyId,projectId:setup.projectId}),{timeout:90_000,message:'Discovery evidence must persist'}).toBeGreaterThan(0);

    await expect(page.locator('#queueDiagnosisBtn')).toBeEnabled({timeout:90_000});await page.locator('#queueDiagnosisBtn').click();await expect(page.locator('#diagnosisReviewModal')).toHaveClass(/open/,{timeout:210_000});const approve=page.locator('[data-diagnosis-action="approve"]');await expect(approve).toBeVisible({timeout:20_000});const runId=await approve.getAttribute('data-id');expect(runId).toBeTruthy();await approve.click();

    await expect(page.locator('#nexusResolutionPlanModal')).toHaveClass(/open/,{timeout:35_000});await expect(page.locator('.simple-plan-summary')).toBeVisible();await expect(page.locator('.simple-plan-step')).toHaveCount(4);await expect(page.locator('[data-resolution-status]')).toHaveCount(0);await expect(page.locator('[data-resolution-confirm]')).toBeEnabled({timeout:15_000});await page.locator('[data-resolution-confirm]').click();await expect(page.locator('[data-resolution-open-actions]')).toBeVisible({timeout:30_000});

    const plan=await page.evaluate(async({runId})=>{const sb=window.NexusPortal.sb;const diagnosis=await sb.from('nexus_diagnosis_runs').select('project_id,orchestration_summary,status').eq('id',runId).single();if(diagnosis.error)throw new Error(diagnosis.error.message);const tasks=await sb.from('nexus_tasks').select('id,title,status,assignee,dependency_task_id,sort_order,template_code').eq('source_diagnosis_run_id',runId).order('sort_order');if(tasks.error)throw new Error(tasks.error.message);return {projectId:diagnosis.data.project_id,summary:diagnosis.data.orchestration_summary,status:diagnosis.data.status,tasks:tasks.data||[]}}, {runId});
    expect(plan.status).toBe('approved');expect(plan.summary.one_workflow).toBe(true);expect(plan.tasks.map(t=>t.title)).toEqual(['Prepare for the build','Build and test the solution','Review the result','Finish and measure']);expect(plan.tasks).toHaveLength(4);expect(plan.tasks[0].dependency_task_id).toBeNull();expect(plan.tasks[1].dependency_task_id).toBe(plan.tasks[0].id);expect(plan.tasks[2].dependency_task_id).toBe(plan.tasks[1].id);expect(plan.tasks[3].dependency_task_id).toBe(plan.tasks[2].id);

    await page.evaluate(async({projectId})=>{for(const [gate,evidence] of [['scope_signed','qa://scope'],['payment_confirmed','qa://payment'],['onboarding_complete','qa://kickoff']]){const {error}=await window.NexusPortal.sb.rpc('nexus_admin_record_engagement_gate',{p_project_id:projectId,p_gate_code:gate,p_status:'passed',p_evidence_ref:evidence,p_note:'Operational release QA'});if(error)throw new Error(error.message)}},{projectId:plan.projectId});
    await waitForTaskStatus(page,plan.tasks[0].id,'waiting_on_client');

    const clientContext=await browser.newContext(inheritedClientContextOptions(testInfo));const clientPage=await clientContext.newPage();
    try{
      await completeClientStep(clientPage,page,plan.tasks[0].id,{plan_decision:'Approved',prep_note:'QA plan approved; no additional access is required for this test.'});
      await completeRelystraStep(page,plan.tasks[1].id);
      await waitForTaskStatus(clientPage,plan.tasks[2].id,'waiting_on_client');
      await completeClientStep(clientPage,page,plan.tasks[2].id,{review_decision:'Approved'});
      await completeRelystraStep(page,plan.tasks[3].id);

      await page.evaluate(async({projectId,runId})=>{
        const sb=window.NexusPortal.sb;
        let metric=await sb.from('nexus_metrics').select('id,baseline_value').eq('project_id',projectId).limit(1).maybeSingle();if(metric.error)throw new Error(metric.error.message);
        if(!metric.data){const created=await sb.from('nexus_metrics').insert({company_id:window.NexusPortal.state.companyId,project_id:projectId,name:'QA completion metric',unit:'count',baseline_value:1,current_value:1,measurement_method:'Operational release QA',measured_at:new Date().toISOString(),created_by:window.NexusPortal.state.user.id,confidence:'verified',metric_type:'baseline',source_diagnosis_run_id:runId}).select('id').single();if(created.error)throw new Error(created.error.message)}
        else{const updated=await sb.from('nexus_metrics').update({current_value:metric.data.baseline_value??1,measured_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',metric.data.id);if(updated.error)throw new Error(updated.error.message)}
        for(const [gate,evidence,note] of [['implementation_complete','qa://implementation','All four ordered tasks completed'],['qa_passed','qa://qaqc','QA passed'],['measurement_complete','qa://measurement','Measurement recorded'],['handoff_complete','qa://handoff','Handoff complete']]){const {error}=await sb.rpc('nexus_admin_record_engagement_gate',{p_project_id:projectId,p_gate_code:gate,p_status:'passed',p_evidence_ref:evidence,p_note:note});if(error)throw new Error(error.message)}
      },{projectId:plan.projectId,runId});

      await clientLogin(clientPage);const acceptance=await clientPage.evaluate(async({projectId})=>{const {data,error}=await window.NexusPortal.sb.rpc('nexus_client_accept_engagement',{p_project_id:projectId,p_decision:'accepted',p_note:'Operational release QA acceptance'});if(error)throw new Error(error.message);return data},{projectId:plan.projectId});expect(acceptance).toBeTruthy();

      const audit=await page.evaluate(async({projectId,runId,companyId})=>{const sb=window.NexusPortal.sb;const project=await sb.from('nexus_projects').select('status,engagement_stage').eq('id',projectId).single();if(project.error)throw new Error(project.error.message);const tasks=await sb.from('nexus_tasks').select('title,status,dependency_task_id,submitted_at,completed_at').eq('source_diagnosis_run_id',runId).order('sort_order');if(tasks.error)throw new Error(tasks.error.message);const proposals=await sb.from('nexus_resolution_proposals').select('id,status').eq('diagnosis_run_id',runId);if(proposals.error)throw new Error(proposals.error.message);const active=await sb.from('nexus_active_engagements').select('project_id').eq('company_id',companyId).maybeSingle();if(active.error)throw new Error(active.error.message);return {project:project.data,tasks:tasks.data||[],proposals:proposals.data||[],activeProjectId:active.data?.project_id||null}},{projectId:plan.projectId,runId,companyId});
      expect(audit.tasks).toHaveLength(4);expect(audit.tasks.every(t=>t.status==='completed')).toBeTruthy();expect(audit.proposals).toHaveLength(1);expect(audit.proposals[0].status).toBe('confirmed');expect(audit.project.status).toBe('complete');expect(audit.project.engagement_stage).toBe('complete');
    }finally{await clientContext.close()}
  });
});