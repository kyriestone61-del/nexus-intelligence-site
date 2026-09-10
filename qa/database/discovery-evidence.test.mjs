import test from 'node:test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {database,asUser} from './fixture.mjs';
import {chunkDiscoveryText,validateExtraction,validateFreeDiagnosis,discoverySections} from '../../supabase/functions/_shared/relystra-discovery-evidence.ts';
import {discoveryState} from '../../portal-discovery-evidence.js';
const migrations=(await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(n=>/^202609(?:0[789]|10)/.test(n)&&!n.includes('000100_')&&!n.includes('000200_')&&!n.includes('launch_security_controls')&&!n.includes('retire_unsafe_snapshot')).sort();
const admin='00000000-0000-4000-8000-000000000001',co='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004',doc='00000000-0000-4000-8000-000000000005',client='00000000-0000-4000-8000-000000000006';
test('discovery evidence processes retained uploads, gates free diagnosis, preserves versions and isolates companies',async()=>{
 const db=await database(migrations);
 try{
  await db.exec(`insert into auth.users values('${admin}'),('${client}'); insert into nexus_platform_admins(user_id) values('${admin}'); insert into nexus_companies(id,name,created_by) values('${co}','Synthetic discovery','${admin}'),('${other}','Other company','${admin}'); insert into nexus_documents(id,company_id,storage_path,file_name,mime_type,category,uploaded_by) values('${doc}','${co}','${co}/meeting.txt','meeting.txt','text/plain','Discovery Transcript','${admin}');`);
  const rpc=async(action='view',document=null,run=null,note='')=>(await db.query('select relystra_discovery_workspace($1,null,$2,$3,$4,$5) s',[co,action,document,run,note])).rows[0].s;
  let state;await asUser(db,admin,async()=>{state=await rpc();assert.equal(state.documents.length,1);assert.equal(state.documents[0].state,'uploaded');await assert.rejects(rpc('generate'),/process discovery/);await rpc('process');});
  const claim=async()=>(await db.query('select relystra_claim_discovery_work($1) s',[state.id])).rows[0].s;
  const commit=async(lease,action,payload)=>(await db.query('select relystra_commit_discovery_work($1,$2,$3,$4,$5) s',[state.id,lease.lease_id,lease.revision,action,payload])).rows[0].s;
  let lease=await claim();assert.ok(lease);assert.equal(await claim(),null);
  const text='The owner manually enters estimates into a spreadsheet.';const chunks=chunkDiscoveryText(text,doc);
  assert.equal(await commit(lease,'parse',{document_id:doc,chunks,parser:'text',text_chars:text.length,hash:'synthetic'}),true);
  lease=await claim();await commit(lease,'extract',{document_id:doc,chunk_id:chunks[0].id,extraction:validateExtraction({observations:[{statement:'Manual estimate entry',excerpt:'manually enters estimates',kind:'client_statement'}],missing_information:[],contradictions:[]},{id:chunks[0].id,text})});
  await asUser(db,admin,async()=>{state=await rpc('generate');assert.equal(state.documents[0].state,'parsed');assert.equal(state.reports[0].status,'generating');await rpc('generate');assert.equal((await rpc()).reports.length,1);});
  const run=state.reports[0].id;lease=await claim();const report=Object.fromEntries(discoverySections.map(k=>[k,[{text:'Owner describes manual entry.',confidence:'strongly_indicated',source_refs:[chunks[0].id]}]]));
  await commit(lease,'complete',{run_id:run,report:{...report,contradictions:[]}});
  await asUser(db,client,async()=>{await assert.rejects(rpc(),/Company access/);await assert.rejects(db.query('select * from relystra_discovery_chunks'),/permission denied/);await assert.rejects(db.query('select relystra_claim_discovery_work($1)',[state.id]),/permission denied/);});
  await asUser(db,admin,async()=>{state=await rpc();assert.equal(state.reports[0].status,'complete');assert.equal(state.reports[0].report.evidence_ledger[0].extraction.observations[0].excerpt,'manually enters estimates');state=await rpc('reprocess',doc);assert.equal(discoveryState(state).state,'outdated');assert.equal(state.reports[0].report.business_context.length,1);});
  lease=await claim();await asUser(db,admin,()=>rpc('remove',doc));assert.equal(await commit(lease,'parse',{document_id:doc,chunks,parser:'text',text_chars:1,hash:'x'}),false);
  await asUser(db,admin,async()=>{await assert.rejects(rpc('generate'),/process discovery/);assert.equal((await rpc()).documents[0].state,'removed');});
 }finally{await db.close()}
});
test('failed regeneration remains explicit while the older report is retained',()=>{
 const old={id:'old',status:'complete',evidence_revision:1};
 const s=discoveryState({revision:2,documents:[],reports:[{status:'failed',evidence_revision:2},old]});
 assert.equal(s.state,'failed');assert.equal(s.complete,old);
});
test('large evidence is fully segmented without truncation and report provenance rejects invented sources',()=>{
 const text=('Owner describes intake and scheduling.\n').repeat(18000)+'TAIL EVIDENCE';const chunks=chunkDiscoveryText(text,doc);
 assert.ok(chunks.length>50);assert.equal(chunks.map(c=>c.text).join(''),text);assert.match(chunks.at(-1).text,/TAIL EVIDENCE$/);assert.ok(chunks.every(c=>c.text.length<=6000));
 assert.throws(()=>chunkDiscoveryText('x'.repeat(4*1024*1024+1),doc),/No text was discarded/);
 assert.throws(()=>validateExtraction({observations:[{statement:'Invented',excerpt:'not in text',kind:'documented_fact'}],missing_information:[],contradictions:[]},{id:'s',text:'Actual source'}),/UNSUPPORTED/);
 const report={...Object.fromEntries(discoverySections.map(k=>[k,[{text:'Unknown',confidence:'insufficient_information',source_refs:[]}]])),contradictions:[]};assert.equal(validateFreeDiagnosis(report,['s']).source_ids[0],'s');
 report.key_findings=[{text:'Fake claim',confidence:'confirmed',source_refs:['foreign']}];assert.throws(()=>validateFreeDiagnosis(report,['s']),/INVALID/);
});

import {discoveryWork} from '../../supabase/functions/_shared/relystra-discovery-handler.ts';
import {serviceAdapter,deterministicDiscoveryModel} from './discovery-model-fixture.mjs';
test('complete hierarchical state machine covers three documents plus > single-prompt evidence and revisions',async()=>{
 const db=await database(migrations);
 try{
  await db.exec(`insert into auth.users values('${admin}');insert into nexus_platform_admins(user_id) values('${admin}');insert into nexus_companies(id,name,created_by) values('${co}','Synthetic hierarchy','${admin}');`);
  const sources=new Map();const insert=async(text,name)=>{const id=crypto.randomUUID();sources.set(id,text);await db.query("insert into nexus_documents(id,company_id,storage_path,file_name,mime_type,category,uploaded_by) values($1,$2,$3,$4,'text/plain','Discovery Transcript',$5)",[id,co,co+'/'+name,name,admin]);return id;};
  for(const [i,t] of ['Owner: intake arrives by email.','Coordinator: intake also arrives by phone.','Estimator: responsibility is not consistent.'].entries())await insert(t,'source'+i+'.txt');
  const large=await insert(('SYNTHETIC process evidence with manual handoff.\n').repeat(13000)+'Unique final evidence.','large.txt');
  const workspace=async(action='view')=>asUser(db,admin,()=>db.query('select relystra_discovery_workspace($1,null,$2) s',[co,action]).then(r=>r.rows[0].s));
  let s=await workspace('process');let extracts=0,qaChecks=0;const deps={db:serviceAdapter(db),config:async()=>({}),hash:async text=> (await import('node:crypto')).createHash('sha256').update(text).digest('hex'),parse:async d=>({text:sources.get(d.id),parser:'text',parsed:true}),call:async(...args)=>{if(args[1]==='Document evidence extractor')extracts++;const result=await deterministicDiscoveryModel(...args);if(args[1].startsWith('Independent')&&++qaChecks===1)return {...result,qa:{pass:false,issues:['Clarify the attribution of the synthetic finding.']}};return result}};
  for(let i=0;i<200;i++){const result=await discoveryWork(deps,s.id);assert.equal(result.ok,true,JSON.stringify(result));if(result.action==='idle')break;}
  s=await workspace('generate');assert.ok(s.documents.every(d=>d.state==='parsed'));assert.ok(extracts>40);
  for(let i=0;i<100;i++){const result=await discoveryWork(deps,s.id);assert.equal(result.ok,true,JSON.stringify(result));if(result.action==='complete')break;}
  s=await workspace();const first=s.reports[0];assert.equal(first.status,'complete');assert.equal(qaChecks,2,'A corrected report passes a separate second QA check');assert.equal(first.report.coverage.documents,4);assert.equal(first.report.coverage.chunks,extracts);assert.equal(first.report.evidence_ledger.length,extracts);
  const exact=await db.query('select string_agg(source_text,\'\' order by ordinal) text from relystra_discovery_chunks where document_id=$1',[large]);assert.equal(exact.rows[0].text,sources.get(large));
  await insert('Owner follow-up: assign the estimator to each intake.','followup.txt');s=await workspace('process');assert.equal(discoveryState(s).state,'outdated');
  for(let i=0;i<10;i++){if((await discoveryWork(deps,s.id)).action==='idle')break;}
  s=await workspace('generate');for(let i=0;i<100;i++){if((await discoveryWork(deps,s.id)).action==='complete')break;}
  s=await workspace();assert.equal(s.reports.length,2);assert.equal(s.reports[0].report.coverage.documents,5);assert.equal(s.reports[1].id,first.id);assert.deepEqual(s.reports[1].report,first.report);
 }finally{await db.close()}
});

test('two retained projects and preparation in one company keep separate evidence and active membership is enforced',async()=>{
 const db=await database();try{
  await db.exec(`insert into auth.users values('${admin}'),('${client}');insert into nexus_platform_admins(user_id) values('${admin}');insert into nexus_companies(id,name,created_by) values('${co}','Synthetic isolation','${admin}'),('${other}','Other company','${admin}');insert into nexus_company_members(company_id,user_id,member_role,active) values('${co}','${client}','owner',true);`);
  const projects=[];for(const [name,company] of [['A',co],['B',co],['Foreign',other]])projects.push((await db.query('insert into nexus_projects(company_id,name,created_by) values($1,$2,$3) returning id',[company,name,admin])).rows[0].id);
  const docs=[];for(const [i,project] of [null,...projects.slice(0,2)].entries())docs.push((await db.query("insert into nexus_documents(company_id,project_id,storage_path,file_name,category,uploaded_by) values($1,$2,$3,$4,'Discovery Transcript',$5) returning id",[co,project,co+'/doc'+i,'doc'+i+'.txt',client])).rows[0].id);
  for(const m of migrations)await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+m,import.meta.url),'utf8'));
  const snap=async project=>(await db.query('select relystra_discovery_workspace($1,$2) s',[co,project])).rows[0].s;
  await asUser(db,client,async()=>{
   for(const [i,project] of [null,...projects.slice(0,2)].entries()){const s=await snap(project);assert.deepEqual(s.documents.map(d=>d.id),[docs[i]]);}
   await assert.rejects(snap(projects[2]),/Engagement.company mismatch/);
   await assert.rejects(db.query("select relystra_discovery_workspace($1,$2,'attach',$3)",[co,projects[0],docs[2]]),/Document.engagement mismatch/);
  });
  await assert.rejects(db.query('update nexus_documents set project_id=$1 where id=$2',[projects[1],docs[1]]),/context is immutable/);
  await db.query('update nexus_company_members set active=false where company_id=$1 and user_id=$2',[co,client]);
  await asUser(db,client,()=>assert.rejects(snap(null),/Company access required/));
 }finally{await db.close()}
});
