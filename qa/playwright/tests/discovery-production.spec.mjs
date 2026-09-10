import {test,expect} from '@playwright/test';
const ae=process.env.NEXUS_QA_ADMIN_EMAIL,ap=process.env.NEXUS_QA_ADMIN_PASSWORD,ce=process.env.NEXUS_QA_CLIENT_EMAIL,cp=process.env.NEXUS_QA_CLIENT_PASSWORD,companyName=process.env.NEXUS_QA_COMPANY_NAME;
const enabled=process.env.NEXUS_QA_DISCOVERY_RELEASE==='1';
async function login(page,email,password){await page.goto('/portal');await page.locator('#signInEmail').fill(email);await page.locator('#signInPassword').fill(password);await page.locator('#signInBtn').click();await expect(page.locator('#portalApp')).toBeVisible({timeout:45000});await expect.poll(()=>page.evaluate(()=>!!window.NexusPortal?.state?.user&&!window.__nexusPortalBooting),{timeout:45000}).toBe(true)}
async function open(page,company){await expect.poll(()=>page.evaluate(()=>!!window.NexusPortal?.state?.user&&!window.__nexusPortalBooting),{timeout:45000}).toBe(true);await page.evaluate(async company=>{await window.NexusPortal.workspace(company,{reason:'discovery-acceptance'});if(window.NexusAdminJourney){await window.NexusAdminJourney.refresh();await window.NexusAdminJourney.navigate('discovery')}else await window.NexusClientShell.activateView('transcript')},company);await expect(page.getByRole('heading',{name:'Upload Discovery Material',exact:true})).toBeVisible();}
async function snapshot(page,company){return page.evaluate(async company=>{const r=await window.NexusPortal.sb.rpc('relystra_discovery_workspace',{p_company_id:company,p_project_id:null});if(r.error)throw Error(r.error.message);return r.data},company)}
async function processed(page){await expect.poll(async()=>{const status=await page.locator('[data-discovery-status]').textContent();const error=await page.locator('[data-discovery-message]').locator('..').getByRole('alert').allTextContents();if(error.length)throw Error(error.join('; '));return await page.locator('[data-free-generate]').isEnabled()},{timeout:300000}).toBe(true)}
async function waitForDiagnosis(page){await expect.poll(async()=>{const status=await page.locator('[data-discovery-status]').textContent();if(status==='Diagnosis generation failed'){const errors=await page.getByRole('alert').allTextContents();throw Error(errors.join('; ')||status)}return status},{timeout:720000}).toBe('Free Diagnosis complete');}
async function generate(page){await page.locator('[data-free-generate]').click();await waitForDiagnosis(page);}
const textFile=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
test('hosted evidence-first discovery and three-source regeneration preserve real records',async({page,browser},info)=>{
 test.skip(!enabled||!ae||!ap||process.env.NEXUS_QA_MOON_WAX_ONLY==='1','Protected synthetic discovery acceptance only');test.setTimeout(1500000);
 await login(page,ae,ap);const company=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(o=>o.textContent.trim()===name)?.value,companyName);expect(company).toBeTruthy();await open(page,company);
 // Each device uses its own active source set while retaining the fixture's prior report versions.
 const existing=await snapshot(page,company);
 for(const doc of existing.documents.filter(d=>d.state!=='removed'))await page.evaluate(async({company,id})=>{const r=await window.NexusPortal.sb.rpc('relystra_discovery_workspace',{p_company_id:company,p_project_id:null,p_action:'remove',p_document_id:id});if(r.error)throw Error(r.error.message)},{company,id:doc.id});
 await open(page,company);
 const prefix=info.project.name;
 await page.locator('[data-discovery-upload] input').setInputFiles(textFile(prefix+'-intake.txt','SYNTHETIC QA DISCOVERY. The owner says estimate requests arrive by email. The owner copies each request into a spreadsheet. Sometimes the estimator receives a request directly and the owner cannot see it. They want consistent intake ownership. No measured time savings are known.'));
 await page.getByRole('button',{name:'Upload & process documents',exact:true}).click();await processed(page);await generate(page);
 const one=await snapshot(page,company);expect(one.reports[0].report.coverage.documents).toBeGreaterThanOrEqual(1);expect(one.reports[0].report.qa.pass).toBe(true);
 await page.locator('[data-discovery-upload] input').setInputFiles([
  textFile(prefix+'-followup.txt','SYNTHETIC QA FOLLOW-UP. The coordinator says request ownership is checked each Friday, but the estimator says the check occurs only when the owner asks. This disagreement needs confirmation. The coordinator uses email and a shared spreadsheet; no dedicated CRM was identified.'),
  textFile(prefix+'-site-notes.txt','SYNTHETIC QA SITE MEETING. Site leads send change requests in text messages, separately from estimate requests. The owner re-enters approved changes into a job log. Approval responsibility is unclear when the owner is absent. The desired goal is an explicit backup approver; budget and transaction counts are unknown.')]);
 await page.getByRole('button',{name:'Upload & process documents',exact:true}).click();await expect(page.locator('[data-discovery-status]')).toHaveText(/Outdated/,{timeout:300000});await processed(page);await generate(page);
 let s=await snapshot(page,company);const r=s.reports[0];expect(r.status).toBe('complete');expect(r.report.coverage.documents).toBe(s.documents.filter(d=>d.state==='parsed').length);expect(r.report.evidence_ledger.length).toBe(r.source_ids.length);expect(s.reports.some(r=>r.id===one.reports[0].id)).toBe(true);
 for(const key of ['business_context','current_processes','observed_problems','key_findings','opportunity_areas','missing_information','evidence_confidence'])expect(r.report[key].length).toBeGreaterThan(0);
 const cited=new Set(Object.values(r.report).filter(Array.isArray).flatMap(a=>a.flatMap(x=>x.source_refs||[])).map(id=>id.split(':')[0]));
 for(const doc of s.documents.filter(d=>d.file_name.startsWith(prefix)))expect(cited.has(doc.id),doc.file_name+' contributes to findings').toBe(true);
 await page.reload();await open(page,company);await expect(page.locator('[data-free-report]')).toHaveAttribute('data-free-report',r.id);
 const context=await browser.newContext({...info.project.use}),client=await context.newPage();try{await login(client,ce,cp);await open(client,company);await expect(client.locator('[data-free-report]')).toHaveAttribute('data-free-report',r.id);const forbidden=await client.evaluate(async()=>{const r=await window.NexusPortal.sb.rpc('relystra_discovery_workspace',{p_company_id:'948c366e-4deb-4389-a5b1-013098213dd8',p_project_id:null});return r.error?.message});expect(forbidden).toMatch(/Company access/);await client.screenshot({path:info.outputPath('discovery-client.png'),fullPage:true});}finally{await context.close()}
 await page.locator('[data-discovery-upload] input').setInputFiles({name:prefix+'-broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('Invalid PDF - synthetic failure test')});await page.getByRole('button',{name:'Upload & process documents',exact:true}).click();await expect(page.locator('[data-discovery-document]').filter({hasText:prefix+'-broken.pdf'}).getByRole('alert')).toBeVisible({timeout:120000});
 await page.locator('[data-discovery-document]').filter({hasText:prefix+'-broken.pdf'}).getByRole('button',{name:'Remove from evidence'}).click();
 const size=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));expect(size.s).toBeLessThanOrEqual(size.w+1);
 console.log('DISCOVERY_ACCEPTANCE',JSON.stringify({company,device:prefix,run:r.id,documents:r.document_ids.length,chunks:r.source_ids.length,qa:r.report.qa,priorVersion:one.reports[0].id,persistence:true,tenantIsolation:true}));
});
test('recover Moon Wax retained discovery documents without fabricated evidence or commercial changes',async({page,browser},info)=>{
 test.skip(!enabled||!ae||!ap,'Explicit protected Moon Wax recovery only');test.setTimeout(1200000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const company='948c366e-4deb-4389-a5b1-013098213dd8';await login(page,ae,ap);await open(page,company);
 let before=await snapshot(page,company);expect(before.documents.length).toBeGreaterThanOrEqual(2);expect(before.documents.every(d=>d.file_name.toLowerCase().includes('moon'))).toBe(true);
 for(const doc of before.documents.filter(d=>d.state==='failed'&&d.error?.startsWith('EXTRACTION_OUTPUT_LIMIT'))){await page.locator('[data-discovery-document="'+doc.id+'"]').getByRole('button',{name:'Reprocess document'}).click();await expect(page.locator('[data-discovery-document="'+doc.id+'"]').getByText('parsed',{exact:false})).toBeVisible({timeout:300000});}
 const download=page.waitForEvent('download',{timeout:30000});
 await page.locator('[data-doc-open]').first().click();
 expect(await (await download).failure()).toBeNull();
 before=await snapshot(page,company);
 if(before.documents.some(d=>['uploaded','parsing'].includes(d.state))){await page.getByRole('button',{name:'Process remaining documents'}).click();await processed(page);}
 if(before.documents.some(d=>d.state==='failed'))throw Error('Retained Moon Wax file processing failed; inspect the genuine error before retrying.');
 const needsGeneration=!before.reports.some(r=>r.status==='complete'&&r.evidence_revision===before.revision);
 const alreadyRunning=before.reports.some(r=>r.status==='generating'&&r.evidence_revision===before.revision);
 if(alreadyRunning)await waitForDiagnosis(page);
 else if(needsGeneration){expect(info.project.name,'only one device initiates the production revision').toBe('desktop-chrome');await generate(page);}
 const s=await snapshot(page,company),r=s.reports.find(r=>r.status==='complete');expect(r.report.qa.pass).toBe(true);expect(r.document_ids.sort()).toEqual(s.documents.filter(d=>d.state==='parsed').map(d=>d.id).sort());
 for(const key of ['business_context','current_processes','observed_problems','key_findings','opportunity_areas','missing_information','evidence_confidence'])expect(r.report[key].length).toBeGreaterThan(0);
 await page.reload();await open(page,company);await expect(page.locator('[data-free-report]')).toHaveAttribute('data-free-report',r.id);
 expect(r.source_ids.length).toBe(3);expect(s.documents.filter(d=>d.duplicate_of).length).toBe(1);
 expect(s.reports.length).toBe(before.reports.length+(needsGeneration&&!alreadyRunning?1:0));
 const saved=await page.evaluate(async company=>(await window.NexusPortal.sb.rpc('relystra_workspace_snapshot',{p_company_id:company,p_project_id:null})).data,company);
 expect(saved.diagnosis.access).toBe(false);expect(saved.workflow.current_step).toBe(s.reviews.some(v=>v.run_id===r.id&&v.decision==='verified')?4:3);
 await page.screenshot({path:info.outputPath('moon-wax-workflow.png'),fullPage:false});
 await page.locator('[data-free-report] h2').first().scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath('moon-wax-discovery.png'),fullPage:false});
 if(info.project.name==='desktop-chrome'){
  await page.locator('[data-discovery-full]').click();await expect(page.locator('#runGapAnalysisBtn')).toBeVisible();
  const existingCoverage=await page.evaluate(()=>window.NexusAdminIntake.latestGapAnalysis());
  if(!existingCoverage?.result?.requirements?.length){
  const response=page.waitForResponse(res=>res.url().includes('/nexus-diagnosis-execute')&&res.request().postDataJSON()?.operation==='gap_analysis',{timeout:150000});
  await page.locator('#runGapAnalysisBtn').click();const coverage=await response;const result=await coverage.json();expect(coverage.ok(),JSON.stringify({status:coverage.status(),error_code:result.error_code,request_id:result.request_id})).toBe(true);expect(Array.isArray(result.result?.gaps)).toBe(true);
  await expect(page.locator('#runGapAnalysisBtn')).toBeEnabled({timeout:30000});
  }
  const coverageSaved=await page.evaluate(()=>window.NexusAdminIntake.latestGapAnalysis());expect(coverageSaved.result.requirements).toHaveLength(30);expect(Array.isArray(coverageSaved.result.gaps)).toBe(true);
  await open(page,company);if(!s.reviews.some(v=>v.run_id===r.id&&v.decision==='verified'))await page.getByRole('button',{name:'Verify these findings',exact:true}).click();
  await expect.poll(async()=>{const current=await snapshot(page,company);return current.reviews.some(v=>v.run_id===r.id&&v.decision==='verified')}).toBe(true);
 }
 const second=await browser.newContext({...info.project.use}),fresh=await second.newPage();try{await login(fresh,ae,ap);await open(fresh,company);await expect(fresh.locator('[data-free-report]')).toHaveAttribute('data-free-report',r.id);await expect(fresh.getByText('Step 4 of 11: Full Diagnosis & approval',{exact:true})).toBeVisible();}finally{await second.close()}
 await page.locator('[data-discovery-full]').click();await expect(page.getByRole('button',{name:'Review scope & payment',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'+ Add Evidence',exact:true}).click();await expect(page.locator('#adminEvidenceFile')).toBeVisible();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('#adminEvidenceFile')).toBeHidden();
 const brief=await page.locator('#adminContextText').inputValue();
 if(info.project.name==='desktop-chrome'){
  if(brief.trim()){
   const save=page.waitForResponse(res=>res.url().includes('/rpc/nexus_save_discovery_admin_context'));
   await page.getByRole('button',{name:'Save Brief',exact:true}).click();expect((await save).ok()).toBe(true);
   await expect(page.locator('#saveAdminContextBtn')).toBeEnabled();await expect(page.locator('#adminContextText')).toHaveValue(brief);
  }else{await page.getByRole('button',{name:'Save Brief',exact:true}).click();await expect(page.getByText('Add context before saving.',{exact:true})).toBeVisible();}
 }
 const menu=page.getByRole('button',{name:'Workspace menu',exact:true});
 if(await menu.isVisible()){await menu.click();await expect(menu).toHaveAttribute('aria-expanded','true');await menu.click();await expect(menu).toHaveAttribute('aria-expanded','false');}
 await page.getByRole('button',{name:'Open Free Diagnosis',exact:true}).click();await expect(page.locator('[data-free-report]')).toHaveAttribute('data-free-report',r.id);
 await page.locator('[data-discovery-full]').click();

 await expect(page.locator('#queueDiagnosisBtn')).toHaveCount(0);
 const size=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));expect(size.s).toBeLessThanOrEqual(size.w+1);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'Review scope & payment',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath('moon-wax-full-diagnosis-gate.png'),fullPage:false});
 // No synthetic uploads, Full Diagnosis approval, purchases, invitations or Build changes for Moon Wax.
 console.log('MOON_WAX_DISCOVERY_RECOVERY',JSON.stringify({company,engagement:s.id,run:r.id,documents:r.document_ids,version:r.version,coverage:r.report.coverage,qa:r.report.qa,persisted:true}));
});
