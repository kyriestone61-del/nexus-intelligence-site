import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {onRequest} from '../../functions/api/basic-report.js';
const request=(body={},origin='https://nexusintelligence.live')=>new Request('https://nexusintelligence.live/api/basic-report',{method:'POST',headers:{origin},body:JSON.stringify(body)});
test('Basic Report relay rejects cross-origin writes and never follows upstream redirects',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://untrusted.test'}})});
 assert.equal((await onRequest({request:request({},'https://untrusted.test')})).status,403);assert.equal(calls,0);
 assert.equal((await onRequest({request:request()})).status,502);assert.equal(calls,1);
 assert.equal((await onRequest({request:request({token:'x'.repeat(3000)})})).status,413);
});
test('current public and compatible service routes show first Build and included diagnosis without stale templates',async()=>{
 const slugs=['ai-enablement-training','ai-opportunity-assessment','business-transformation','fractional-ai-director','implementation-sprint','managed-ai-operations'];
 for(const path of ['services.html',...slugs.map(s=>`services/${s}/index.html`)]){
  const html=await fs.readFile(path,'utf8');assert.match(html,/Full Diagnosis/);assert.match(html,/commercial-offers.js/);assert.doesNotMatch(html,/<template|src="\/service-route.js"/);
 }
 const middleware=await fs.readFile('functions/_middleware.js','utf8');assert.doesNotMatch(middleware,/AI & Automation Services|AI opportunity assessment, implementation/);
});
