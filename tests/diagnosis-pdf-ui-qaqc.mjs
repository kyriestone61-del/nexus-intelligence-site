import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const ui=fs.readFileSync('portal-diagnosis-pdf-ui.js','utf8');
const shell=fs.readFileSync('portal-client-shell-v2.js','utf8');
const backendSource=fs.readFileSync('functions/api/diagnosis-report-pdf.js','utf8');
const edge=fs.readFileSync('supabase/functions/nexus-diagnosis-report-pdf/index.ts','utf8');

const sliceFrom=(src,start,end,label)=>{const i=src.indexOf(start);assert.ok(i>=0,`missing ${label}`);const j=src.indexOf(end,i+start.length);assert.ok(j>i,`unterminated ${label}`);return src.slice(i,j+end.length)};
const lineFrom=(src,start)=>sliceFrom(src,start,'\n',start);

// --- Loading order -------------------------------------------------------------------------
const loaderMatches=app.match(/portal-diagnosis-pdf-ui\.js/g)||[];
assert.equal(loaderMatches.length,2,'diagnosis PDF UI must load in both client and admin shells');
assert.ok(app.indexOf('portal-client-shell-v2.js')<app.indexOf('portal-diagnosis-pdf-ui.js'),'client report UI must exist before PDF controls mount');
assert.ok(app.lastIndexOf('portal-diagnosis-review-ux.js')<app.lastIndexOf('portal-diagnosis-pdf-ui.js'),'admin diagnosis review UI must exist before PDF controls mount');

// --- portal-diagnosis-pdf-ui.js owns the PDF action ----------------------------------------
assert.match(ui,/sb\.auth\.getSession\(\)/,'downloads must use the signed-in user session');
assert.match(ui,/Authorization':`Bearer \$\{token\}`/,'PDF request must use bearer authentication');
assert.match(ui,/fetch\('\/api\/diagnosis-report-pdf'/,'UI must call the authenticated report endpoint');
assert.match(ui,/JSON\.stringify\(payload\)/,'request payload must stay explicit and server-authorized');
assert.match(ui,/\{run_id:id\}/,'admin download must request the internal diagnosis by run id');
assert.match(ui,/content-disposition/,'download must honor the server-provided attachment filename');
assert.match(ui,/application\/pdf/,'download must reject unexpected response types');
assert.match(ui,/URL\.revokeObjectURL/,'temporary blob URLs must be released');
assert.match(ui,/Download full PDF/,'founder diagnosis review must expose the full PDF action');
assert.match(ui,/Download PDF/,'client report view must expose the client-safe PDF action');
assert.equal(/service[_-]?role|SUPABASE_SERVICE|RESEND_API_KEY|TWILIO_AUTH_TOKEN/.test(ui),false,'browser PDF controls must not contain privileged credentials');
// The PDF UI binds only to cards the client shell rendered; it must not run its own release query.
for(const forbidden of [/\bsb\.from\(/,/nexus_diagnosis_report_releases/])
  assert.doesNotMatch(ui,forbidden,`PDF UI must not query releases itself (${forbidden})`);

// Behavioral card identity: run the real mountClientDownloads against a minimal fake DOM.
function fakeDom(cardDatasets){
  const el=tag=>{const node={tag,dataset:{},children:[],handlers:{},textContent:'',parent:null,
    addEventListener:(type,fn)=>{node.handlers[type]=fn},
    appendChild:child=>{child.parent=node;node.children.push(child);return child},
    remove:()=>{if(node.parent)node.parent.children=node.parent.children.filter(c=>c!==node)},
    querySelector:sel=>sel==='[data-diagnosis-pdf-release]'?node.children.find(c=>'diagnosisPdfRelease' in c.dataset)||null:null};return node};
  const cards=cardDatasets.map(dataset=>Object.assign(el('article'),{dataset:{...dataset}}));
  const root={querySelectorAll:sel=>sel==='.nexus-client-report'?cards:[]};
  return {cards,document:{createElement:el,getElementById:id=>id==='nexus-client-reports'?root:null}};
}
{
  const calls=[];
  const {cards,document}=fakeDom([
    {diagnosisReleaseId:'rel-a',diagnosisCompanyId:'co-a'},
    {diagnosisReleaseId:'rel-b',diagnosisCompanyId:'co-a'},
    {diagnosisReleaseId:'rel-foreign',diagnosisCompanyId:'co-b'},
    {diagnosisCompanyId:'co-a'},
  ]);
  const mount=new Function('document','state','downloadDiagnosisPdf','toast','console',
    `${sliceFrom(ui,'function mountClientDownloads(){','\n}\n','mountClientDownloads')};return mountClientDownloads;`
  )(document,{companyId:'co-a'},async payload=>{calls.push(payload)},()=>{},console);
  const button=card=>card.children.find(c=>'diagnosisPdfRelease' in c.dataset);
  mount();
  assert.equal(button(cards[0])?.dataset.diagnosisPdfRelease,'rel-a','each rendered card gets a download bound to its own release id');
  assert.equal(button(cards[1])?.dataset.diagnosisPdfRelease,'rel-b','a second card keeps its own release id');
  assert.equal(button(cards[2]),undefined,'a card for another company gets no download');
  assert.equal(button(cards[3]),undefined,'a card without release identity gets no download');
  mount();
  assert.equal(cards[0].children.length,1,'remounting does not duplicate download controls');
  await button(cards[1]).handlers.click();
  assert.deepEqual(calls,[{release_id:'rel-b'}],'download requests exactly the release of the clicked card');
  cards[0].dataset.diagnosisReleaseId='rel-a2';mount();
  assert.equal(button(cards[0]).dataset.diagnosisPdfRelease,'rel-a2','remount follows the re-rendered card identity');
  button(cards[0]).dataset.diagnosisPdfRelease='rel-stale';await button(cards[0]).handlers.click();
  assert.equal(calls.length,1,'a download whose id no longer matches its card does nothing');
  cards[0].dataset.diagnosisCompanyId='co-b';mount();
  assert.equal(button(cards[0]),undefined,'a card that moves to another company loses its download');
}

// --- portal-client-shell-v2.js owns released-report filtering and card identity -----------
{
  const load=lineFrom(shell,'async function loadShellData(');
  const releaseQuery=sliceFrom(load,".from('nexus_diagnosis_report_releases')",'.order(','client shell release query');
  for(const [filter,label] of [
    [".eq('company_id',companyId)",'current company'],
    [".eq('status','released')",'released status'],
    [".is('revoked_at',null)",'non-revoked'],
  ])assert.ok(releaseQuery.includes(filter),`client shell release query must filter ${label}: ${filter}`);

  const matches=new Function('state',`${lineFrom(shell,'function releaseMatchesSnapshot(')};return releaseMatchesSnapshot;`)({companyId:'co-a'});
  const base={id:'rel-ok',company_id:'co-a',project_id:'proj-1',diagnosis_run_id:'run-1',status:'released',revoked_at:null};
  const snapshot={project_id:'proj-1',diagnosis:{id:'run-1'}};
  for(const [release,expected,label] of [
    [base,true,'current released row'],
    [{...base,status:'draft'},false,'draft row'],
    [{...base,status:'revoked'},false,'revoked status'],
    [{...base,revoked_at:'2026-11-01T00:00:00Z'},false,'released row with revoked_at set'],
    [{...base,company_id:'co-b'},false,'other company'],
    [{...base,project_id:'proj-2'},false,'other project'],
    [{...base,diagnosis_run_id:'run-2'},false,'other diagnosis run'],
  ])assert.equal(matches(release,snapshot),expected,`releaseMatchesSnapshot: ${label}`);

  const render=lineFrom(shell,'function renderReports(');
  assert.match(render,/releases\.filter\(release=>releaseMatchesSnapshot\(release,snapshot\)\)/,'client shell must render only releases that pass releaseMatchesSnapshot');
  assert.match(render,/class="nexus-client-report"[^>]*data-diagnosis-release-id="\$\{esc\(report\.id\)\}"/,'each rendered card must carry its release id');
  assert.match(render,/class="nexus-client-report"[^>]*data-diagnosis-company-id="\$\{esc\(state\.companyId\)\}"/,'each rendered card must carry its company id');
}

// --- Cloudflare Pages handler: behavioral check against a fake PostgREST -------------------
// The fake honors only the filters present in each request URL, so a missing filter in the
// handler surfaces as a leaked row. global fetch is replaced for the whole block, so nothing leaves the process.
{
  const ids={live:'11111111-1111-4111-8111-111111111111',revoked:'22222222-2222-4222-8222-222222222222',draft:'33333333-3333-4333-8333-333333333333',foreign:'44444444-4444-4444-8444-444444444444',run:'55555555-5555-4555-8555-555555555555'};
  const report={executive_summary:'Client-safe summary.'};
  const tables={
    nexus_platform_admins:[{user_id:'admin-1'}],
    nexus_company_members:[{company_id:'co-a',user_id:'user-1',active:true},{company_id:'co-a',user_id:'admin-1',active:true}],
    nexus_companies:[{id:'co-a',name:'Acme'},{id:'co-b',name:'Other'}],
    nexus_diagnosis_runs:[{id:ids.run,company_id:'co-a',status:'complete',analysis_result:{executive_summary:'Internal.'}}],
    nexus_diagnosis_report_releases:[
      {id:ids.live,company_id:'co-a',status:'released',revoked_at:null,client_report:report},
      {id:ids.revoked,company_id:'co-a',status:'released',revoked_at:'2026-11-20T00:00:00Z',client_report:report},
      {id:ids.draft,company_id:'co-a',status:'draft',revoked_at:null,client_report:report},
      {id:ids.foreign,company_id:'co-b',status:'released',revoked_at:null,client_report:report},
    ],
  };
  const releaseUrls=[];
  const fakeFetch=async(input,init={})=>{
    const url=new URL(String(input));
    const token=String(init.headers?.authorization||'').replace(/^Bearer\s+/,'');
    const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
    if(url.pathname==='/auth/v1/user')return token?json(200,{id:token}):json(401,{});
    const table=url.pathname.replace('/rest/v1/','');
    if(!(table in tables))return json(404,{});
    if(table==='nexus_diagnosis_report_releases')releaseUrls.push(url);
    let rows=tables[table];
    for(const [key,value] of url.searchParams){
      if(key==='select'||key==='limit')continue;
      if(value==='is.null')rows=rows.filter(r=>r[key]==null);
      else if(value.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===value.slice(3));
      else throw new Error(`fake PostgREST does not support ${key}=${value}`);
    }
    return json(200,rows.slice(0,Number(url.searchParams.get('limit')||rows.length)));
  };
  const realFetch=globalThis.fetch;
  globalThis.fetch=fakeFetch;
  try{
    const {onRequestPost}=await import(`data:text/javascript;base64,${Buffer.from(backendSource).toString('base64')}`);
    const call=async(user,body)=>{
      const headers={'content-type':'application/json'};if(user)headers.authorization=`Bearer ${user}`;
      const response=await onRequestPost({request:new Request('https://portal.test/api/diagnosis-report-pdf',{method:'POST',headers,body:JSON.stringify(body)})});
      const type=response.headers.get('content-type')||'';
      return {status:response.status,type,cache:response.headers.get('cache-control'),disposition:response.headers.get('content-disposition')||'',error:type.includes('json')?(await response.json()).error:null,bytes:type.includes('pdf')?new Uint8Array(await response.arrayBuffer()):null};
    };

    const ok=await call('user-1',{release_id:ids.live});
    assert.equal(ok.status,200,'active member can download a released, non-revoked report');
    assert.equal(ok.type,'application/pdf','released report download is a PDF');
    assert.equal(ok.cache,'no-store','diagnosis PDFs must not be cached');
    assert.match(ok.disposition,/^attachment; filename="Acme-Relystra-Client-Report\.pdf"$/,'released report uses the client-safe attachment filename');
    assert.equal(new TextDecoder().decode(ok.bytes.slice(0,5)),'%PDF-','response body is a PDF document');
    const okText=new TextDecoder().decode(ok.bytes);
    assert.match(okText,/Client-safe summary\./,'released PDF renders the client_report projection');
    assert.doesNotMatch(okText,/Internal\./,'released PDF must not render the internal analysis');

    for(const [user,id,label] of [['user-1',ids.revoked,'member, revoked release'],['admin-1',ids.revoked,'admin, revoked release'],['user-1',ids.draft,'member, unreleased release']]){
      const res=await call(user,{release_id:id});
      assert.equal(res.status,404,`${label} must not be downloadable`);
      assert.equal(res.error,'REPORT_NOT_FOUND',`${label} must report REPORT_NOT_FOUND`);
      assert.equal(res.cache,'no-store',`${label} error response must not be cached`);
    }
    const foreign=await call('user-1',{release_id:ids.foreign});
    assert.deepEqual([foreign.status,foreign.error],[403,'COMPANY_ACCESS_REQUIRED'],'non-members cannot download another company release');
    const adminForeign=await call('admin-1',{release_id:ids.foreign});
    assert.equal(adminForeign.status,200,'platform admins keep release access across companies');
    const anon=await call(null,{release_id:ids.live});
    assert.deepEqual([anon.status,anon.error],[401,'AUTH_REQUIRED'],'unauthenticated requests are rejected');
    const runAsMember=await call('user-1',{run_id:ids.run});
    assert.deepEqual([runAsMember.status,runAsMember.error],[403,'ADMIN_REQUIRED'],'full run PDF must remain administrator-only');
    const runAsAdmin=await call('admin-1',{run_id:ids.run});
    assert.equal(runAsAdmin.status,200,'administrators can download the full run PDF');
    const missing=await call('user-1',{});
    assert.deepEqual([missing.status,missing.error],[404,'REPORT_ID_REQUIRED'],'requests without a report id are rejected');

    assert.ok(releaseUrls.length>0,'release path must query nexus_diagnosis_report_releases');
    for(const url of releaseUrls){
      assert.equal(url.searchParams.get('status'),'eq.released','Pages release query must filter status=released server-side');
      assert.equal(url.searchParams.get('revoked_at'),'is.null','Pages release query must filter revoked_at IS NULL server-side');
    }
  }finally{
    globalThis.fetch=realFetch;
  }
}

// --- Supabase Edge handler (Deno source; checked structurally, not executed) ---------------
{
  const branch=sliceFrom(edge,'}else if(body?.release_id){','}else throw new Error("REPORT_ID_REQUIRED")','Edge release branch');
  const query=sliceFrom(branch,'db.from("nexus_diagnosis_report_releases")','.single()','Edge release query');
  assert.ok(query.includes('.eq("id",body.release_id)'),'Edge release query must select by the requested release id');
  assert.ok(query.includes('.is("revoked_at",null)'),'Edge release query must filter revoked_at IS NULL server-side');
  assert.match(branch,/if\(error\|\|!release\|\|release\.status!=="released"\)throw new Error\("REPORT_NOT_FOUND"\)/,'Edge release path must reject anything not released (including revoked rows that make single() fail)');
  assert.match(branch,/if\(!isAdmin&&!await isMember\(user\.id,release\.company_id\)\)throw new Error\("COMPANY_ACCESS_REQUIRED"\)/,'Edge release path must verify active company membership for non-admins');
  assert.match(branch,/report=release\.client_report;[^\n]*client=true/,'Edge released PDF must use the client-safe projection');
  const runBranch=sliceFrom(edge,'}else if(body?.run_id){','}else if(body?.release_id){','Edge run branch');
  assert.ok(runBranch.indexOf('if(!isAdmin)throw new Error("ADMIN_REQUIRED")')>=0&&runBranch.indexOf('if(!isAdmin)throw new Error("ADMIN_REQUIRED")')<runBranch.indexOf('db.from('),'Edge full run PDF must stay administrator-only before any data read');
  const pdfResponse=lineFrom(edge,'return new Response(bytes,');
  assert.match(pdfResponse,/"Cache-Control":"no-store"/,'Edge PDF response must send Cache-Control: no-store with a string-quoted header key');
  assert.doesNotMatch(edge,/`Cache-Control`\s*:/,'Edge source must not use a template literal as an object key');
}

console.log('RELYSTRA DIAGNOSIS PDF UI QAQC PASS');
