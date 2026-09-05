import {test,expect} from '@playwright/test';

const adminEmail=process.env.NEXUS_QA_ADMIN_EMAIL;
const adminPassword=process.env.NEXUS_QA_ADMIN_PASSWORD;
const clientEmail=process.env.NEXUS_QA_CLIENT_EMAIL;
const clientPassword=process.env.NEXUS_QA_CLIENT_PASSWORD;
const qaCompany=process.env.NEXUS_QA_COMPANY_NAME||'';

const technicalJargon=/\b(?:RPC|RLS|Supabase|Postgres|PostgreSQL|schema cache|SECURITY DEFINER|service role|edge function|workflow metadata|JSONB?|payload|cron job|database trigger|canonical state|orchestration engine|dependency-blocked|governed action(?:s| plan| chain)?|commercial gate|resolution proposals?|root record|gap analysis|bounded diagnosis|material (?:information|discovery) gaps|authorized evidence|structured findings|recommended intervention|optimization\s*\/?\s*closeout|unblocked action|baseline measurement|decision record|documented resolution)\b/i;
const allowedLegacy=/formerly Nexus Intelligence/i;

function cleanText(text=''){
  return String(text)
    .replaceAll(qaCompany,'')
    .replace(/Relystra, formerly Nexus Intelligence\. Same team\. Same practical, measurable approach\./gi,'')
    .replace(/Nexus QA\s+[\w-]+/gi,'')
    .replace(/\s+/g,' ')
    .trim();
}

async function waitForPortal(page,timeout=45_000){
  await expect(page.locator('#portalApp')).toBeVisible({timeout});
  await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-booting/,{timeout});
  await expect(page.locator('#nexusPortalBootOverlay')).toHaveCount(0,{timeout});
  await expect.poll(()=>page.evaluate(()=>window.__nexusPortalBooting===false&&!!window.NexusPortal?.state?.user&&!document.body.classList.contains('nexus-runtime-degraded')),{timeout}).toBe(true);
}

async function signIn(page,email,password){
  await page.goto('/portal',{waitUntil:'domcontentloaded'});
  await page.locator('#signInEmail').fill(email);
  await page.locator('#signInPassword').fill(password);
  await page.locator('#signInBtn').click();
  await waitForPortal(page);
}

async function selectQaCompany(page,{admin=false}={}){
  if(!qaCompany)return null;
  const target=await page.locator('#companySelect option').evaluateAll((options,name)=>options.find(option=>option.textContent?.trim()===name)?.value||null,qaCompany);
  if(!target)throw new Error(`Disposable QA company not found: ${qaCompany}`);
  if(admin){
    const current=new URL(page.url()).searchParams.get('company');
    if(current!==target){await page.goto(`/portal?view_mode=admin&company=${encodeURIComponent(target)}`,{waitUntil:'domcontentloaded'});await waitForPortal(page)}
  }
  await expect(page.locator('#companySelect')).toHaveValue(target,{timeout:20_000});
  return target;
}

async function visibleCopy(page){
  return page.locator('button:visible,a:visible,p:visible,small:visible,label:visible,summary:visible,h1:visible,h2:visible,h3:visible,.note:visible,.kicker:visible,.eyebrow:visible').evaluateAll(nodes=>nodes.map(node=>({
    tag:node.tagName.toLowerCase(),
    text:(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim(),
    aria:node.getAttribute('aria-label')||'',
    title:node.getAttribute('title')||''
  })).filter(item=>item.text||item.aria||item.title));
}

async function assertPlainLanguage(page,{client=false}={}){
  const rows=await visibleCopy(page);
  const jargon=[];const longBlocks=[];const longControls=[];const staleBrand=[];
  for(const row of rows){
    const text=cleanText(row.text);
    if(!text)continue;
    if(technicalJargon.test(text))jargon.push({tag:row.tag,text:text.slice(0,220)});
    if(['p','small'].includes(row.tag)&&text.length>300)longBlocks.push({tag:row.tag,length:text.length,text:text.slice(0,220)});
    if(['button','a','summary'].includes(row.tag)&&text.length>48)longControls.push({tag:row.tag,length:text.length,text:text.slice(0,180)});
    if(client&&/\bNexus\b/i.test(text)&&!allowedLegacy.test(text))staleBrand.push({tag:row.tag,text:text.slice(0,220)});
  }
  expect(jargon,'Visible product copy must not expose backend/operator jargon').toEqual([]);
  expect(longBlocks,'User instructions should be brief and scannable').toEqual([]);
  expect(longControls,'Interactive labels must stay concise').toEqual([]);
  if(client)expect(staleBrand,'Client-facing copy must use RELYSTRA branding').toEqual([]);
}

async function assertNoDeadControls(page){
  const unnamed=await page.locator('button:visible,a:visible').evaluateAll(nodes=>nodes.map(node=>({text:(node.textContent||'').trim(),aria:node.getAttribute('aria-label'),title:node.getAttribute('title'),href:node.getAttribute('href')})).filter(item=>!(item.text||item.aria||item.title)));
  expect(unnamed,'No visible control may be unnamed').toEqual([]);
  const badLinks=await page.locator('a:visible[href]').evaluateAll(nodes=>nodes.map(node=>({text:(node.textContent||'').trim(),href:node.getAttribute('href')})).filter(item=>!String(item.href||'').trim()||/^javascript:/i.test(item.href||'')));
  expect(badLinks,'Visible links need real destinations').toEqual([]);
}

async function assertMobileUsability(page){
  const dims=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(dims.scrollWidth,`Horizontal overflow: ${JSON.stringify(dims)}`).toBeLessThanOrEqual(dims.clientWidth+1);
  const tiny=await page.locator('button:visible,a:visible,input:visible,select:visible,textarea:visible').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {name:(node.textContent||node.getAttribute('aria-label')||node.getAttribute('placeholder')||'').trim().slice(0,90),w:Math.round(r.width),h:Math.round(r.height)}}).filter(item=>item.w>0&&item.h>0&&item.w<32&&item.h<32));
  expect(tiny,'Visible mobile controls must be comfortably tappable').toEqual([]);
}

async function openAdminRecords(page){
  const records=page.locator('details.nexus-production-records');await expect(records).toBeVisible({timeout:20_000});
  if(!await records.evaluate(node=>node.open))await records.locator('summary').click();
  await expect(records).toHaveAttribute('open','');return records;
}

function meaningful(errors){return errors.filter(text=>!/favicon|analytics|third-party cookie|ResizeObserver loop|cloudflareinsights/i.test(text));}

test.describe('RELYSTRA full app UX QAQC',()=>{
  test.skip(!adminEmail||!adminPassword||!clientEmail||!clientPassword,'Disposable authenticated QA identities are required.');

  test('public portal entry is concise, clear and non-technical',async({page})=>{
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await page.goto('/portal',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#signInForm')).toBeVisible();
    await expect(page.getByRole('button',{name:/sign in/i})).toBeVisible();
    await expect(page.getByRole('button',{name:/create account/i})).toBeVisible();
    await assertPlainLanguage(page,{client:true});await assertNoDeadControls(page);
    expect(meaningful(errors)).toEqual([]);
  });

  test('admin navigation and diagnosis workspace are coherent and simple',async({page})=>{
    const consoleErrors=[];const pageErrors=[];
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
    page.on('pageerror',error=>pageErrors.push(String(error?.message||error)));
    await signIn(page,adminEmail,adminPassword);await selectQaCompany(page,{admin:true});
    await expect(page.locator('#adminJourneyRoot')).toBeVisible({timeout:20_000});
    for(const label of ['Home','Clients','Decisions','Sales'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
    await assertPlainLanguage(page);await assertNoDeadControls(page);

    const records=await openAdminRecords(page);
    const diagnosis=records.locator('button').filter({hasText:/Diagnosis|Discovery/i}).first();
    await expect(diagnosis).toBeVisible();await diagnosis.click();
    await expect(page.locator('#section-intake')).toHaveClass(/active/,{timeout:15_000});
    const saveNotes=page.locator('#captureDiscoveryContextBtn');if(await saveNotes.count())await expect(saveNotes).toBeVisible();
    await expect(page.locator('#toggleEvidenceUploadBtn')).toBeVisible();
    await expect(page.locator('#queueDiagnosisBtn')).toBeVisible();
    await assertPlainLanguage(page);await assertNoDeadControls(page);

    for(const label of ['Home','Clients','Decisions','Sales']){
      const button=page.getByRole('button',{name:label,exact:true});await button.click();
      await expect(page.locator('body')).not.toHaveClass(/nexus-runtime-degraded/);
    }
    expect(meaningful(consoleErrors)).toEqual([]);expect(pageErrors).toEqual([]);
  });

  test('client workspace is dummy-proof across every primary view and utility',async({page})=>{
    const consoleErrors=[];const pageErrors=[];
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
    page.on('pageerror',error=>pageErrors.push(String(error?.message||error)));
    await signIn(page,clientEmail,clientPassword);await selectQaCompany(page);
    await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:30_000});

    const nav=page.locator('#nexusClientPrimaryNav [data-client-view]:visible');
    expect(await nav.count()).toBeGreaterThanOrEqual(3);const seen=[];
    for(let i=0;i<await nav.count();i+=1){
      const button=nav.nth(i),view=await button.getAttribute('data-client-view'),label=cleanText(await button.innerText());
      seen.push(view);expect(label.length,`Client nav label too long: ${label}`).toBeLessThanOrEqual(32);
      await button.click();await expect(page.locator(`#nexus-client-${view}`)).toHaveClass(/active/,{timeout:10_000});
      await assertPlainLanguage(page,{client:true});await assertNoDeadControls(page);
    }
    expect(seen).toContain('today');expect(seen).toContain('files');expect(seen).toContain('improvement');

    const help=page.locator('#nexusClientHelpButton');
    if(await help.isVisible().catch(()=>false)){
      await help.click();const drawer=page.locator('#nexusClientGuideDrawer');await expect(drawer).toHaveClass(/show/,{timeout:10_000});
      await drawer.locator('[data-modal-close]').click();await expect(drawer).not.toHaveClass(/show/);
    }
    const inbox=page.locator('#nexusClientInboxButton');
    if(await inbox.isVisible().catch(()=>false)){
      await inbox.click();const drawer=page.locator('#nexusClientInboxDrawer');await expect(drawer).toHaveClass(/show/,{timeout:10_000});
      await drawer.locator('[data-modal-close]').click();await expect(drawer).not.toHaveClass(/show/);
    }
    expect(meaningful(consoleErrors)).toEqual([]);expect(pageErrors).toEqual([]);
  });

  test('client workspace remains simple and usable at phone width',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await signIn(page,clientEmail,clientPassword);await selectQaCompany(page);
    await expect(page.locator('#nexusClientPrimaryNav')).toBeVisible({timeout:30_000});
    await assertMobileUsability(page);await assertPlainLanguage(page,{client:true});
    const nav=page.locator('#nexusClientPrimaryNav [data-client-view]:visible');
    for(let i=0;i<await nav.count();i+=1){const button=nav.nth(i),view=await button.getAttribute('data-client-view');await button.click();await expect(page.locator(`#nexus-client-${view}`)).toHaveClass(/active/,{timeout:10_000});await assertMobileUsability(page)}
  });
});
