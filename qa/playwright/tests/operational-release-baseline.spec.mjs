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
    const shell=state?.admin&&state.viewMode!=='client'
      ?document.querySelector('.nexus-production-primary-nav')
      :document.getElementById('nexusClientPrimaryNav');
    return window.__nexusPortalBooting===false&&!!state?.user&&!!shell&&
      !document.body.classList.contains('nexus-runtime-degraded');
  }),{timeout,message:'Authenticated Relystra workspace must finish loading'}).toBe(true);
}

async function signIn(page,email,password){
  const already=await page.evaluate(email=>window.NexusPortal?.state?.user?.email===email,email).catch(()=>false);
  if(!already){
    await page.goto('/portal',{waitUntil:'domcontentloaded'});
    await page.locator('#signInEmail').fill(email);
    await page.locator('#signInPassword').fill(password);
    await page.locator('#signInBtn').click();
  }else{
    await page.evaluate(()=>window.NexusPortal.workspace?.());
  }
  await waitForSettledPortal(page);
}

async function selectQaCompany(page){
  const id=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(option=>option.textContent?.trim()===name)?.value||null,qaCompany);
  if(!id)throw new Error(`Disposable QA company not found: ${qaCompany}`);
  const current=new URL(page.url()).searchParams.get('company');
  if(current!==id){
    await page.goto(`/portal?view_mode=admin&company=${encodeURIComponent(id)}`,{waitUntil:'domcontentloaded'});
    await waitForSettledPortal(page);
  }
  await expect(page.locator('#companySelect')).toHaveValue(id,{timeout:20_000});
  return id;
}

async function adminLogin(page){await signIn(page,adminEmail,adminPassword);return selectQaCompany(page)}
async function clientLogin(page){await signIn(page,clientEmail,clientPassword);await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:30_000})}

async function waitForTaskStatus(page,id,status,timeout=30_000){
  await expect.poll(()=>page.evaluate(async({id})=>{
    const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('status').eq('id',id).single();
    if(error)throw new Error(error.message);
    return data.status;
  },{id}),{timeout,message:`Task ${id} must reach ${status}`}).toBe(status);
}

async function openAdminActions(page,view='my_work'){
  await page.evaluate(async()=>{await window.NexusPortal.workspace?.()});
  await page.evaluate(()=>document.querySelector('.side-nav button[data-section="tasks"]')?.click());
  await expect(page.locator('#section-tasks')).toHaveClass(/active/,{timeout:15_000});
  const filter=page.locator(`#actionExecutionFilters button[data-view="${view}"]`);
  await expect(filter).toBeVisible({timeout:15_000});
  await filter.click();
  await expect(filter).toHaveClass(/active/);
}

async function openClientActions(page){
  const button=page.locator('#nexusClientActionsButton');
  await expect(button).toBeVisible({timeout:20_000});
  await button.click();
  await expect(page.locator('#nexus-client-actions')).toHaveClass(/active/,{timeout:15_000});
}

async function fillRequiredFields(card){
  const controls=card.locator('[data-action-field][data-required="true"]');
  for(let i=0;i<await controls.count();i+=1){
    const control=controls.nth(i),tag=await control.evaluate(el=>el.tagName),type=await control.getAttribute('type');
    if(tag==='SELECT'){
      const options=await control.locator('option').count();
      if(options>1)await control.selectOption({index:1});
    }else if(type==='date')await control.fill('2026-09-30');
    else await control.fill('Operational release QA response');
  }
}

async function ensureDetails(card){
  const details=card.locator('.action-engine-details');
  if(await details.getAttribute('hidden')!==null)await card.locator('.action-engine-detail-toggle').click();
  await expect(details).toBeVisible();
}

test.describe('RELYSTRA Operational Release 1',()=>{
  test.describe.configure({retries:0});
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword||!qaCompany,'Disposable authenticated QA identities are required.');

  test('critical client lifecycle is operational end to end',async({page,browser},testInfo)=>{
    test.setTimeout(420_000);
    const companyId=await adminLogin(page);

    const setup=await page.evaluate(async({companyId})=>{
      const portal=window.NexusPortal,sb=portal.sb,userId=portal.state.user.id;

      const prior=await sb.from('nexus_projects').select('id,status,name').eq('company_id',companyId).like('name','QA Operational Release%');
      if(prior.error)throw new Error(prior.error.message);
      for(const project of prior.data||[]){
        if(!['complete','cancelled'].includes(String(project.status||'').toLowerCase())){
          const closed=await sb.from('nexus_projects').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',project.id);
          if(closed.error)throw new Error(closed.error.message);
        }
      }
      const cleared=await sb.from('nexus_active_engagements').delete().eq('company_id',companyId);
      if(cleared.error)throw new Error(cleared.error.message);

      const created=await sb.from('nexus_projects').insert({
        company_id:companyId,
        name:`QA Operational Release ${Date.now()}`,
        service_type:'AI Opportunity Assessment',
        status:'planning',
        summary:'Disposable RELYSTRA Operational Release 1 certification',
        created_by:userId,
        project_type:'diagnosis_pilot',
        engagement_stage:'diagnosis',
        owner_scope:'nexus'
      }).select('*').single();
      if(created.error)throw new Error(created.error.message);

      const active=await sb.from('nexus_active_engagements').upsert({
        company_id:companyId,
        project_id:created.data.id,
        updated_by:userId,
        updated_at:new Date().toISOString()
      },{onConflict:'company_id'});
      if(active.error)throw new Error(active.error.message);

      await portal.workspace?.();
      await portal.syncActiveEngagement?.();
      return {projectId:created.data.id};
    },{companyId});

    await expect.poll(()=>page.evaluate(()=>window.NexusFoundationHardening?.activeProject?.()?.id||null),{timeout:25_000,message:'Fresh engagement must be canonical'}).toBe(setup.projectId);

    await page.evaluate(async()=>{await window.NexusPortal.workspace();window.NexusDiagnosisController?.invalidateLatest?.()});
    await page.evaluate(()=>document.querySelector('.side-nav button[data-section="intake"]')?.click());
    await expect(page.locator('#section-intake')).toHaveClass(/active/,{timeout:15_000});

    await page.locator('#toggleEvidenceUploadBtn').click();
    await page.locator('#adminEvidenceFile').setInputFiles({
      name:'relystra-operational-release-transcript.txt',
      mimeType:'text/plain',
      buffer:Buffer.from('Discovery call transcript. The client manually exports monthly financial transactions and reporting is delayed. The client wants a repeatable monthly reporting process with clear visibility into money coming in and going out. A human owner must approve system permissions and production launch. Relystra should recommend the smallest controlled improvement and preserve human approval.')
    });
    await page.locator('#adminEvidenceCategory').selectOption({label:'Client Source'});
    await page.locator('#adminEvidenceNote').fill('Operational Release 1 diagnosis evidence.');
    await page.locator('#adminEvidenceForm button[type="submit"]').click();

    await expect.poll(()=>page.evaluate(async({companyId,projectId})=>{
      const {count,error}=await window.NexusPortal.sb.from('nexus_documents').select('id',{count:'exact',head:true})
        .eq('company_id',companyId).eq('project_id',projectId).eq('file_name','relystra-operational-release-transcript.txt');
      if(error)throw new Error(error.message);
      return count||0;
    },{companyId,projectId:setup.projectId}),{timeout:90_000,message:'Discovery evidence must persist'}).toBeGreaterThan(0);

    await expect(page.locator('#queueDiagnosisBtn')).toBeEnabled({timeout:90_000});
    await page.locator('#queueDiagnosisBtn').click();
    await expect(page.locator('#diagnosisReviewModal')).toHaveClass(/open/,{timeout:210_000});
    const approve=page.locator('[data-diagnosis-action="approve"]');
    await expect(approve).toBeVisible({timeout:20_000});
    const runId=await approve.getAttribute('data-id');
    expect(runId).toBeTruthy();
    await approve.click();

    await expect(page.locator('#nexusResolutionPlanModal')).toHaveClass(/open/,{timeout:35_000});
    const proposals=page.locator('.resolution-proposal');
    await expect(proposals.first()).toBeVisible({timeout:35_000});
    expect(await proposals.count()).toBeGreaterThan(0);
    await proposals.first().locator('[data-resolution-status="selected"]').click();
    await expect(page.locator('[data-resolution-confirm]')).toBeEnabled({timeout:15_000});
    await page.locator('[data-resolution-confirm]').click();
    const openActions=page.locator('[data-resolution-open-actions]');
    await expect(openActions).toBeVisible({timeout:30_000});
    await openActions.click();
    await expect(page.locator('#section-tasks')).toHaveClass(/active/,{timeout:15_000});

    const uploadTaskId=await page.evaluate(async({companyId,projectId})=>{
      const sb=window.NexusPortal.sb;
      const assigned=await sb.rpc('nexus_assign_action_template',{
        p_company_id:companyId,p_project_id:projectId,p_template_code:'discovery_kpi_reports',p_due_date:null,p_priority:'high'
      });
      if(assigned.error)throw new Error(assigned.error.message);
      const id=assigned.data;
      const updated=await sb.from('nexus_tasks').update({
        title:'Upload last 30 days of financial transactions (CSV)',
        description:'Provide the most recent 30 days of financial transactions as CSV evidence.',
        required_evidence:[{label:'CSV containing the last 30 days of transactions',required:true,kind:'file'}],
        completion_criteria:['File is attached directly to this action','Relystra can review it without a separate email'],
        updated_at:new Date().toISOString()
      }).eq('id',id);
      if(updated.error)throw new Error(updated.error.message);
      await window.NexusPortal.workspace?.();
      return id;
    },{companyId,projectId:setup.projectId});

    const clientContext=await browser.newContext({baseURL:testInfo.project.use.baseURL});
    const clientPage=await clientContext.newPage();
    try{
      await clientLogin(clientPage);
      await openClientActions(clientPage);
      let card=clientPage.locator(`[data-action-engine-task="${uploadTaskId}"]`);
      await expect(card).toBeVisible({timeout:25_000});

      const start=card.locator('[data-action-start]');
      if(await start.isVisible().catch(()=>false))await start.click();
      await waitForTaskStatus(clientPage,uploadTaskId,'in_progress');

      card=clientPage.locator(`[data-action-engine-task="${uploadTaskId}"]`);
      await card.locator('[data-action-upload]').click();
      await expect(clientPage.locator('#uploadForm')).toBeVisible({timeout:15_000});
      await clientPage.locator('#docFile').setInputFiles({
        name:'qa-financial-transactions.csv',mimeType:'text/csv',
        buffer:Buffer.from('date,description,amount\n2026-08-01,QA Sale,1500\n2026-08-02,QA Expense,-225\n')
      });
      await clientPage.locator('#uploadForm button[type="submit"]').click();
      await expect.poll(()=>clientPage.evaluate(async({taskId})=>{
        const {count,error}=await window.NexusPortal.sb.from('nexus_documents').select('id',{count:'exact',head:true}).eq('task_id',taskId).eq('file_name','qa-financial-transactions.csv');
        if(error)throw new Error(error.message);
        return count||0;
      },{taskId:uploadTaskId}),{timeout:35_000,message:'Client evidence upload must persist'}).toBeGreaterThan(0);

      await openClientActions(clientPage);
      card=clientPage.locator(`[data-action-engine-task="${uploadTaskId}"]`);
      await expect(card).toBeVisible({timeout:20_000});
      await ensureDetails(card);
      await fillRequiredFields(card);
      await card.locator('[data-action-submit]').click();
      await waitForTaskStatus(clientPage,uploadTaskId,'ready_for_review',35_000);

      await openAdminActions(page,'ready_review');
      let adminCard=page.locator(`.action-v2-card[data-task-id="${uploadTaskId}"],.operational-action-card[data-task-id="${uploadTaskId}"]`).first();
      await expect(adminCard).toBeVisible({timeout:25_000});
      page.once('dialog',dialog=>dialog.accept('Operational release QA revision: confirm the evidence is complete.'));
      await adminCard.locator('.admin-revise-task').click();
      await waitForTaskStatus(page,uploadTaskId,'needs_revision');

      await clientLogin(clientPage);
      await openClientActions(clientPage);
      card=clientPage.locator(`[data-action-engine-task="${uploadTaskId}"]`);
      await expect(card).toBeVisible({timeout:20_000});
      const restart=card.locator('[data-action-start]');
      if(await restart.isVisible().catch(()=>false))await restart.click();
      await waitForTaskStatus(clientPage,uploadTaskId,'in_progress');
      card=clientPage.locator(`[data-action-engine-task="${uploadTaskId}"]`);
      await ensureDetails(card);
      await fillRequiredFields(card);
      await card.locator('[data-action-submit]').click();
      await waitForTaskStatus(clientPage,uploadTaskId,'ready_for_review',35_000);

      await openAdminActions(page,'ready_review');
      adminCard=page.locator(`.action-v2-card[data-task-id="${uploadTaskId}"],.operational-action-card[data-task-id="${uploadTaskId}"]`).first();
      await expect(adminCard).toBeVisible({timeout:25_000});
      await adminCard.locator('.admin-approve-task').click();
      await waitForTaskStatus(page,uploadTaskId,'completed',35_000);

      const audit=await page.evaluate(async({taskId,runId,companyId})=>{
        const sb=window.NexusPortal.sb;
        const task=await sb.from('nexus_tasks').select('status,submitted_at,completed_at').eq('id',taskId).single();
        if(task.error)throw new Error(task.error.message);
        const events=await sb.from('nexus_task_events').select('event_type').eq('task_id',taskId);
        if(events.error)throw new Error(events.error.message);
        const docs=await sb.from('nexus_documents').select('file_name').eq('task_id',taskId);
        if(docs.error)throw new Error(docs.error.message);
        const diagnosis=await sb.from('nexus_diagnosis_runs').select('status,approved_at,project_id').eq('id',runId).single();
        if(diagnosis.error)throw new Error(diagnosis.error.message);
        const active=await sb.from('nexus_active_engagements').select('project_id').eq('company_id',companyId).maybeSingle();
        if(active.error)throw new Error(active.error.message);
        return {task:task.data,events:events.data||[],docs:docs.data||[],diagnosis:diagnosis.data,activeProjectId:active.data?.project_id||null};
      },{taskId:uploadTaskId,runId,companyId});

      expect(audit.task.status).toBe('completed');
      expect(audit.task.submitted_at).toBeTruthy();
      expect(audit.task.completed_at).toBeTruthy();
      expect(audit.events.some(event=>event.event_type==='submitted')).toBeTruthy();
      expect(audit.events.some(event=>event.event_type==='revision_requested')).toBeTruthy();
      expect(audit.events.some(event=>['approved','completed'].includes(event.event_type))).toBeTruthy();
      expect(audit.docs.some(doc=>doc.file_name==='qa-financial-transactions.csv')).toBeTruthy();
      expect(audit.diagnosis.status).toBe('approved');
      expect(audit.diagnosis.project_id).toBeTruthy();
      expect(audit.activeProjectId).toBe(audit.diagnosis.project_id);
    }finally{
      await clientContext.close();
    }
  });
});
