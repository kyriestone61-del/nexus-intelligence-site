import {test,expect} from '@playwright/test';
const ae=process.env.NEXUS_QA_ADMIN_EMAIL,ap=process.env.NEXUS_QA_ADMIN_PASSWORD,ce=process.env.NEXUS_QA_CLIENT_EMAIL,cp=process.env.NEXUS_QA_CLIENT_PASSWORD,companyName=process.env.NEXUS_QA_COMPANY_NAME;
const enabled=process.env.NEXUS_QA_DISCOVERY_RELEASE==='1';
async function login(page,email,password){await page.goto('/portal');await page.locator('#signInEmail').fill(email);await page.locator('#signInPassword').fill(password);await page.locator('#signInBtn').click();await expect(page.locator('#portalApp')).toBeVisible({timeout:45000});await expect.poll(()=>page.evaluate(()=>!!window.NexusPortal?.state?.user&&!window.__nexusPortalBooting),{timeout:45000}).toBe(true)}
async function open(page,company){await page.evaluate(async company=>{await window.NexusPortal.workspace(company,{reason:'discovery-acceptance'});if(window.NexusAdminJourney){await window.NexusAdminJourney.refresh();await window.NexusAdminJourney.navigate('discovery')}else await window.NexusClientShell.activateView('transcript')},company);await expect(page.getByRole('heading',{name:'Upload Discovery Material',exact:true})).toBeVisible();}
async function snapshot(page,company){return page.evaluate(async company=>{const r=await window.NexusPortal.sb.rpc('relystra_discovery_workspace',{p_company_id:company,p_project_id:null});if(r.error)throw Error(r.error.message);return r.data},company)}
async function processed(page){await expect(page.locator('[data-free-generate]')).toBeEnabled({timeout:300000})}
async function generate(page){await page.locator('[data-free-generate]').click();await expect(page.locator('[data-discovery-status]')).toHaveText('Free Diagnosis complete',{timeout:420000});}
const textFile=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
test('hosted evidence-first discovery and three-source regeneration preserve real records',async({page,browser},info)=>{
 test.skip(!enabled||!ae||!ap,'Protected discovery release acceptance only');test.setTimeout(1500000);
 await login(page,ae,ap);const company=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(o=>o.textContent.trim()===name)?.value,companyName);expect(company).toBeTruthy();await open(page,company);
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
test('recover Moon Wax retained discovery documents without fabricated evidence or commercial changes',async({page},info)=>{
 test.skip(!enabled||info.project.name!=='desktop-chrome'||!ae||!ap,'Explicit protected Moon Wax recovery only');test.setTimeout(1200000);
 const company='948c366e-4deb-4389-a5b1-013098213dd8';await login(page,ae,ap);await open(page,company);
 let before=await snapshot(page,company);expect(before.documents.length).toBeGreaterThanOrEqual(2);expect(before.documents.every(d=>d.file_name.toLowerCase().includes('moon'))).toBe(true);
 if(before.documents.some(d=>['uploaded','parsing'].includes(d.state))){await page.getByRole('button',{name:'Process remaining documents'}).click();await processed(page);}
 if(before.documents.some(d=>d.state==='failed'))throw Error('Retained Moon Wax file processing failed; inspect the genuine error before retrying.');
 if(!before.reports.some(r=>r.status==='complete'&&r.evidence_revision===before.revision))await generate(page);
 const s=await snapshot(page,company),r=s.reports.find(r=>r.status==='complete');expect(r.report.qa.pass).toBe(true);expect(r.document_ids.sort()).toEqual(s.documents.filter(d=>d.state==='parsed').map(d=>d.id).sort());
 for(const key of ['business_context','current_processes','observed_problems','key_findings','opportunity_areas','missing_information','evidence_confidence'])expect(r.report[key].length).toBeGreaterThan(0);
 await page.reload();await open(page,company);await expect(page.locator('[data-free-report]')).toHaveAttribute('data-free-report',r.id);
 // No synthetic uploads, diagnosis approval, purchases, invitations or Build changes for Moon Wax.
 console.log('MOON_WAX_DISCOVERY_RECOVERY',JSON.stringify({company,engagement:s.id,run:r.id,documents:r.document_ids,version:r.version,coverage:r.report.coverage,qa:r.report.qa,persisted:true}));
});
