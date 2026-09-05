import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME;
const fullBaseline=process.env.NEXUS_QA_FULL_BASELINE==='1';
const terminal=new Set(['completed','approved','done','not_applicable']);

async function waitForSettledPortal(page,timeout=45_000){
  await expect(page.locator('#portalApp')).toBeVisible({timeout});
  await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/,{timeout});
  await expect(page.locator('#nexusPortalBootOverlay')).toHaveCount(0,{timeout});
  await expect.poll(()=>page.evaluate(()=>{
    const state=window.NexusPortal?.state;
    return window.__nexusPortalBooting===false&&!!state?.user&&
      (state.viewMode==='admin'||state.viewMode==='client');
  }),{timeout,message:'Authenticated role shell must finish loading'}).toBe(true);
}
async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await page.locator('#signInEmail').fill(email);
  await page.locator('#signInPassword').fill(password);
  await page.locator('#signInBtn').click();
  await waitForSettledPortal(page);
}
async function signOut(page){
  const button=page.locator('#signOutBtn');
  if(await button.isVisible().catch(()=>false)){await button.click();await expect(page.locator('#signInForm')).toBeVisible({timeout:25_000});}
}
async function selectQaCompany(page){
  const target=await page.locator('#companySelect option').evaluateAll((options,companyName)=>options.find(item=>item.textContent?.trim()===companyName)?.value||null,qaCompany);
  if(!target)throw new Error(`Disposable QA company not found: ${qaCompany}`);
  const current=new URL(page.url()).searchParams.get('company');
  if(current!==target){await page.goto(`/portal?view_mode=admin&company=${encodeURIComponent(target)}`,{waitUntil:'domcontentloaded'});await waitForSettledPortal(page)}
  await expect(page.locator('#companySelect')).toHaveValue(target,{timeout:20_000});
  return target;
}
async function adminLogin(page){await signIn(page,adminEmail,adminPassword);return selectQaCompany(page)}
async function clientLogin(page){await signIn(page,clientEmail,clientPassword);await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:30_000})}
async function openAdminActions(page){
  await page.evaluate(()=>document.querySelector('.side-nav button[data-section="tasks"]')?.click());
  await expect(page.locator('#section-tasks')).toHaveClass(/active/,{timeout:15_000});
}
async function openClientActions(page){
  const button=page.locator('#nexusClientActionsButton');await expect(button).toBeVisible({timeout:20_000});await button.click();await expect(page.locator('#nexus-client-actions')).toHaveClass(/active/);
}
async function waitForTaskStatus(page,id,status,timeout=25_000){
  await expect.poll(async()=>page.evaluate(async({id})=>{const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('status').eq('id',id).single();if(error)throw new Error(error.message);return data.status},{id}),{timeout}).toBe(status);
}
async function generatedTasks(page,runId){
  return page.evaluate(async({runId})=>{const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('id,title,status,assignee,owner_scope,task_type,notify_client,dependency_task_id,sort_order,required_evidence,completion_criteria,submitted_at,completed_at,archived_at').eq('source_diagnosis_run_id',runId).order('sort_order');if(error)throw new Error(error.message);return data||[]},{runId});
}
async function taskRecord(page,id){return page.evaluate(async({id})=>{const {data,error}=await window.NexusPortal.sb.from('nexus_tasks').select('*').eq('id',id).single();if(error)throw new Error(error.message);return data},{id})}
async function fillRequiredActionFields(card){
  const controls=card.locator('[data-action-field][data-required="true"]');
  for(let i=0;i<await controls.count();i+=1){const control=controls.nth(i),tag=await control.evaluate(el=>el.tagName),type=await control.getAttribute('type');if(tag==='SELECT'){const options=await control.locator('option').count();if(options>0)await control.selectOption({index:Math.min(1,options-1)})}else if(type==='date'){await control.fill('2026-09-30')}else await control.fill('QA response — verified by automated baseline workflow test')}
}
async function uploadForAction(page,taskId,fileName='qa-financial-transactions.csv'){
  await openClientActions(page);
  const card=page.locator(`[data-action-engine-task="${taskId}"]`);await expect(card).toBeVisible({timeout:20_000});
  await card.locator('[data-action-upload]').click();
  await expect(page.locator('#uploadForm')).toBeVisible({timeout:15_000});
  await expect(page.locator('#uploadContext')).toContainText('Upload for:',{timeout:10_000});
  await page.locator('#docFile').setInputFiles({name:fileName,mimeType:'text/csv',buffer:Buffer.from('date,description,amount\n2026-08-01,QA Sale,1500\n2026-08-02,QA Expense,-225\n')});
  await page.locator('#uploadForm button[type="submit"]').click();
  await expect.poll(async()=>page.evaluate(async({taskId,fileName})=>{const {count,error}=await window.NexusPortal.sb.from('nexus_documents').select('id',{count:'exact',head:true}).eq('task_id',taskId).eq('file_name',fileName);if(error)throw new Error(error.message);return count||0},{taskId,fileName}),{timeout:30_000}).toBeGreaterThan(0);
}
async function processClientSubmission(page,task,{exerciseHelp=false,exerciseRevision=false}={}){
  await clientLogin(page);await openClientActions(page);
  let card=page.locator(`[data-action-engine-task="${task.id}"]`);await expect(card).toBeVisible({timeout:20_000});
  const start=card.locator('[data-action-start]');if(await start.isVisible().catch(()=>false))await start.click();
  await waitForTaskStatus(page,task.id,'in_progress');
  card=page.locator(`[data-action-engine-task="${task.id}"]`);
  const details=card.locator('.action-engine-detail-toggle');if(await details.isVisible().catch(()=>false))await details.click();await fillRequiredActionFields(card);
  if(exerciseHelp){
    await card.locator('[data-action-comment]').click();await card.locator('[data-comment-box] textarea').fill('QA client comment: confirming this action is understood.');await card.locator('[data-send-comment]').click();
    card=page.locator(`[data-action-engine-task="${task.id}"]`);await card.locator('[data-action-help]').click();await card.locator('[data-help-box] textarea').fill('QA help request: verify the required handoff.');await card.locator('[data-send-help]').click();
    card=page.locator(`[data-action-engine-task="${task.id}"]`);await card.locator('[data-action-history]').click();await expect(card.locator('[data-history-panel]')).toBeVisible();
  }
  if(task.task_type==='upload'||task.task_type==='workflow_evidence')await uploadForAction(page,task.id,`qa-action-${task.id.slice(0,8)}.csv`);
  await openClientActions(page);card=page.locator(`[data-action-engine-task="${task.id}"]`);await expect(card).toBeVisible();
  const detailsAgain=card.locator('.action-engine-detail-toggle');if(await detailsAgain.isVisible().catch(()=>false)){const hidden=await card.locator('.action-engine-details').getAttribute('hidden');if(hidden!==null)await detailsAgain.click();await fillRequiredActionFields(card)}
  await card.locator('[data-action-submit]').click();await waitForTaskStatus(page,task.id,'ready_for_review');
  await signOut(page);

  await adminLogin(page);await openAdminActions(page);
  let adminCard=page.locator(`.action-v2-card[data-task-id="${task.id}"],.operational-action-card[data-task-id="${task.id}"]`).first();await expect(adminCard).toBeVisible({timeout:20_000});
  if(exerciseRevision){
    page.once('dialog',dialog=>dialog.accept('QA revision: add the missing verification detail.'));
    await adminCard.locator('.admin-revise-task').click();await waitForTaskStatus(page,task.id,'needs_revision');await signOut(page);
    await clientLogin(page);await openClientActions(page);card=page.locator(`[data-action-engine-task="${task.id}"]`);await expect(card).toBeVisible();
    const restart=card.locator('[data-action-start]');if(await restart.isVisible().catch(()=>false))await restart.click();
    card=page.locator(`[data-action-engine-task="${task.id}"]`);const d=card.locator('.action-engine-detail-toggle');if(await d.isVisible().catch(()=>false))await d.click();await fillRequiredActionFields(card);
    await card.locator('[data-action-submit]').click();await waitForTaskStatus(page,task.id,'ready_for_review');await signOut(page);
    await adminLogin(page);await openAdminActions(page);adminCard=page.locator(`.action-v2-card[data-task-id="${task.id}"],.operational-action-card[data-task-id="${task.id}"]`).first();await expect(adminCard).toBeVisible({timeout:20_000});
  }
  await adminCard.locator('.admin-approve-task').click();await waitForTaskStatus(page,task.id,'completed');
}
async function processNexusTask(page,task){
  await openAdminActions(page);const card=page.locator(`.action-v2-card[data-task-id="${task.id}"],.operational-action-card[data-task-id="${task.id}"]`).first();await expect(card).toBeVisible({timeout:20_000});
  const start=card.locator('.admin-start-task');if(await start.isVisible().catch(()=>false)){await start.click();await waitForTaskStatus(page,task.id,'in_progress')}
  const refreshed=page.locator(`.action-v2-card[data-task-id="${task.id}"],.operational-action-card[data-task-id="${task.id}"]`).first();await expect(refreshed).toBeVisible();await refreshed.locator('.admin-complete-task').click();await waitForTaskStatus(page,task.id,'completed');
}

test.describe('full governed Nexus baseline workflow',()=>{
  test.skip(!fullBaseline,'Run only from the protected production workflow_dispatch full-baseline gate.');
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword||!qaCompany,'Disposable authenticated QA identities are required.');

  test('call evidence → diagnosis → founder selection → routed actions → revision → completion → file upload',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop-chrome','The live AI baseline path runs once on desktop Chrome; mobile/browser shells are covered separately.');
    test.setTimeout(420_000);
    const errors=[];page.on('console',message=>{if(message.type()==='error'&&!/favicon|cloudflareinsights|analytics|ResizeObserver loop/i.test(message.text()))errors.push(message.text())});

    const companyId=await adminLogin(page);
    const setup=await page.evaluate(async({companyId})=>{
      const portal=window.NexusPortal,sb=portal.sb,userId=portal.state.user.id;
      const created=await sb.from('nexus_projects').insert({company_id:companyId,name:`QA Baseline Engagement ${Date.now()}`,service_type:'Implementation Sprint',status:'planning',summary:'Disposable full baseline workflow QA',created_by:userId,project_type:'diagnosis_pilot',engagement_stage:'diagnosis',owner_scope:'nexus'}).select('id').single();if(created.error)throw new Error(created.error.message);
      const active=await sb.from('nexus_active_engagements').upsert({company_id:companyId,project_id:created.data.id,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'company_id'});if(active.error)throw new Error(active.error.message);
      await portal.workspace?.();return {projectId:created.data.id};
    },{companyId});

    await page.evaluate(()=>document.querySelector('.side-nav button[data-section="intake"]')?.click());await expect(page.locator('#section-intake')).toHaveClass(/active/,{timeout:15_000});
    await page.locator('#toggleEvidenceUploadBtn').click();
    await page.locator('#adminEvidenceFile').setInputFiles({name:'qa-baseline-transcript.txt',mimeType:'text/plain',buffer:Buffer.from('Discovery call transcript. Client says monthly financial transactions are exported manually and reporting is delayed. The client wants clear visibility into money coming in and going out, wants a repeatable monthly reporting process, and can provide a CSV export when requested. Existing workflow requires a human owner to approve system permissions and any production launch. Nexus should recommend the smallest controlled improvement and preserve human approval.')});
    await page.locator('#adminEvidenceCategory').selectOption({label:'Client Source'});await page.locator('#adminEvidenceNote').fill('Disposable baseline QA transcript.');await page.locator('#adminEvidenceForm button[type="submit"]').click();
    await expect(page.locator('#section-intake')).toContainText('qa-baseline-transcript.txt',{timeout:90_000});

    await page.locator('#queueDiagnosisBtn').click();
    await expect(page.locator('#diagnosisReviewModal')).toHaveClass(/open/,{timeout:210_000});await expect(page.locator('[data-diagnosis-action="approve"]')).toBeVisible({timeout:20_000});
    const runId=await page.locator('[data-diagnosis-action="approve"]').getAttribute('data-id');expect(runId).toBeTruthy();
    await page.locator('[data-diagnosis-action="approve"]').click();
    await expect(page.locator('#nexusResolutionPlanModal')).toHaveClass(/open/,{timeout:35_000});await expect(page.locator('.resolution-proposal')).toHaveCountGreaterThan?.(0);
    const proposals=page.locator('.resolution-proposal');expect(await proposals.count()).toBeGreaterThan(0);await expect(proposals.first().locator('.resolution-step')).not.toHaveCount(0);
    await proposals.first().locator('[data-resolution-status="selected"]').click();await expect(page.locator('[data-resolution-confirm]')).toBeEnabled({timeout:15_000});await page.locator('[data-resolution-confirm]').click();
    const openActions=page.locator('[data-resolution-open-actions]');
    await expect(openActions).toBeVisible({timeout:30_000});await openActions.click();
    await expect(page.locator('#nexusResolutionPlanModal')).not.toHaveClass(/\b(?:open|show)\b/);
    await expect(page.locator('#section-tasks')).toHaveClass(/active/);

    let tasks=await generatedTasks(page,runId);expect(tasks.length).toBeGreaterThan(0);expect(tasks.every(task=>Array.isArray(task.required_evidence)&&task.required_evidence.length>0)).toBeTruthy();expect(tasks.every(task=>Array.isArray(task.completion_criteria)&&task.completion_criteria.length>0)).toBeTruthy();
    let exercisedHelp=false,exercisedRevision=false;
    for(let guard=0;guard<30;guard+=1){
      tasks=await generatedTasks(page,runId);const unfinished=tasks.filter(task=>!terminal.has(String(task.status||'').toLowerCase()));if(!unfinished.length)break;
      const ready=unfinished.find(task=>!task.dependency_task_id||tasks.some(dep=>dep.id===task.dependency_task_id&&terminal.has(String(dep.status||'').toLowerCase())));if(!ready)throw new Error('Workflow deadlocked: no unfinished action has a satisfied prerequisite.');
      if(ready.assignee==='client'){
        await signOut(page);await processClientSubmission(page,ready,{exerciseHelp:!exercisedHelp,exerciseRevision:!exercisedRevision});exercisedHelp=true;exercisedRevision=true;
      }else await processNexusTask(page,ready);
    }
    tasks=await generatedTasks(page,runId);expect(tasks.length).toBeGreaterThan(0);expect(tasks.every(task=>terminal.has(String(task.status||'').toLowerCase()))).toBeTruthy();expect(exercisedHelp).toBeTruthy();expect(exercisedRevision).toBeTruthy();

    const uploadTaskId=await page.evaluate(async({companyId,projectId})=>{
      const sb=window.NexusPortal.sb;
      const assigned=await sb.rpc('nexus_assign_action_template',{p_company_id:companyId,p_project_id:projectId,p_template_code:'discovery_kpi_reports',p_due_date:null,p_priority:'high'});if(assigned.error)throw new Error(assigned.error.message);const id=assigned.data;
      const update=await sb.from('nexus_tasks').update({title:'Upload last 30 days of financial transactions (CSV)',description:'Provide the most recent 30 days of financial transactions as CSV or spreadsheet evidence for QA.',required_evidence:[{label:'CSV or spreadsheet containing the last 30 days of transactions',required:true,kind:'file'}],completion_criteria:['File is attached directly to this action','Nexus can review the transaction rows without a separate email'],updated_at:new Date().toISOString()}).eq('id',id);if(update.error)throw new Error(update.error.message);await window.NexusPortal.workspace?.();return id;
    },{companyId,projectId:setup.projectId});
    await signOut(page);await clientLogin(page);await openClientActions(page);let uploadCard=page.locator(`[data-action-engine-task="${uploadTaskId}"]`);await expect(uploadCard).toBeVisible({timeout:20_000});const uploadStart=uploadCard.locator('[data-action-start]');if(await uploadStart.isVisible().catch(()=>false))await uploadStart.click();await uploadForAction(page,uploadTaskId,'qa-financial-transactions.csv');
    await openClientActions(page);uploadCard=page.locator(`[data-action-engine-task="${uploadTaskId}"]`);await expect(uploadCard).toContainText('Evidence attached');await uploadCard.locator('[data-action-submit]').click();await waitForTaskStatus(page,uploadTaskId,'ready_for_review');await signOut(page);
    await adminLogin(page);await openAdminActions(page);let uploadAdminCard=page.locator(`.action-v2-card[data-task-id="${uploadTaskId}"],.operational-action-card[data-task-id="${uploadTaskId}"]`).first();await expect(uploadAdminCard).toBeVisible();await uploadAdminCard.locator('.admin-approve-task').click();await waitForTaskStatus(page,uploadTaskId,'completed');

    const opsTaskId=await page.evaluate(async({companyId,projectId})=>{const sb=window.NexusPortal.sb;const assigned=await sb.rpc('nexus_assign_action_template',{p_company_id:companyId,p_project_id:projectId,p_template_code:'diagnosis_review_transcript',p_due_date:null,p_priority:'normal'});if(assigned.error)throw new Error(assigned.error.message);await window.NexusPortal.workspace?.();return assigned.data},{companyId,projectId:setup.projectId});
    await openAdminActions(page);let opsCard=page.locator(`.action-v2-card[data-task-id="${opsTaskId}"],.operational-action-card[data-task-id="${opsTaskId}"]`).first();await expect(opsCard).toBeVisible();await expect(opsCard.locator('[data-engine-edit]')).toBeVisible({timeout:15_000});await opsCard.locator('[data-engine-edit]').click();await expect(page.locator('#actionEngineAdminModal')).toHaveClass(/show/);await page.locator('#actionEnginePriority').selectOption('high');await page.locator('#actionEngineEvidence').fill('QA workflow evidence');await page.locator('#actionEngineCriteria').fill('QA workflow definition saved');await page.locator('#actionEngineAdminForm button[type="submit"]').click();await expect.poll(async()=>String((await taskRecord(page,opsTaskId)).priority)).toBe('high');
    await openAdminActions(page);opsCard=page.locator(`.action-v2-card[data-task-id="${opsTaskId}"],.operational-action-card[data-task-id="${opsTaskId}"]`).first();await opsCard.locator('[data-engine-project]').click();await expect.poll(async()=>Boolean((await taskRecord(page,opsTaskId)).converted_to_project_id),{timeout:20_000}).toBeTruthy();
    await openAdminActions(page);opsCard=page.locator(`.action-v2-card[data-task-id="${opsTaskId}"],.operational-action-card[data-task-id="${opsTaskId}"]`).first();await opsCard.locator('[data-engine-history]').click();await expect(opsCard.locator('.action-engine-admin-history')).toBeVisible();await opsCard.locator('[data-engine-archive]').click();await expect.poll(async()=>Boolean((await taskRecord(page,opsTaskId)).archived_at),{timeout:20_000}).toBeTruthy();

    const audit=await page.evaluate(async({runId,uploadTaskId})=>{const sb=window.NexusPortal.sb;const ids=await sb.from('nexus_tasks').select('id').eq('source_diagnosis_run_id',runId);if(ids.error)throw new Error(ids.error.message);const taskIds=(ids.data||[]).map(x=>x.id).concat(uploadTaskId);const events=await sb.from('nexus_task_events').select('event_type,task_id').in('task_id',taskIds);if(events.error)throw new Error(events.error.message);const comments=await sb.from('nexus_task_comments').select('id,task_id').in('task_id',taskIds);if(comments.error)throw new Error(comments.error.message);const docs=await sb.from('nexus_documents').select('id,file_name,task_id').eq('task_id',uploadTaskId);if(docs.error)throw new Error(docs.error.message);return {events:events.data||[],comments:comments.data||[],docs:docs.data||[]}}, {runId,uploadTaskId});
    expect(audit.events.some(event=>event.event_type==='submitted')).toBeTruthy();expect(audit.events.some(event=>event.event_type==='approved'||event.event_type==='completed')).toBeTruthy();expect(audit.comments.length).toBeGreaterThan(0);expect(audit.docs.some(doc=>doc.file_name==='qa-financial-transactions.csv')).toBeTruthy();
    expect(errors).toEqual([]);
  });
});
