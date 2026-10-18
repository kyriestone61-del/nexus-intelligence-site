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
test('Nepsis services presents the agreed free-to-paid bundle without the retired price widget',async()=>{
 const html=await fs.readFile('services.html','utf8');
 assert.match(html,/<title>Services \| Nepsis Intelligence<\/title>/);
 assert.match(html,/Free consultation/);
 assert.match(html,/Basic Diagnosis report/);
 assert.match(html,/Full Diagnosis \+ implementation/);
 assert.match(html,/One paid engagement combines deeper diagnosis with a bounded implementation/);
 assert.match(html,/Scope, price, responsibilities and acceptance criteria are agreed in writing before paid work begins/);
 assert.match(html,/QA and explicitly released/);
 assert.match(html,/client review and acceptance/);
 const bookings=[...html.matchAll(/<a\b[^>]*href="\/book"[^>]*>(.*?)<\/a>/g)];
 assert.ok(bookings.length>0);
 for(const [,label] of bookings)assert.equal(label,'Schedule a free consultation');
 const consultationLinks=[...html.matchAll(/<a\b([^>]*)>Schedule a free consultation<\/a>/g)];
 assert.equal(consultationLinks.length,bookings.length);
 for(const [,attributes] of consultationLinks)assert.match(attributes,/href="\/book"/);
 assert.doesNotMatch(html,/commercial-offers\.js|data-offer-ladder|Book Free Discovery|\$350|<template|src="\/service-route.js"/);
});

test('retired service routes redirect to current services while legacy fallback sources remain intact',async()=>{
 const slugs=['ai-enablement-training','ai-opportunity-assessment','business-transformation','fractional-ai-director','implementation-sprint','managed-ai-operations'];
 const middleware=await fs.readFile('functions/_middleware.js','utf8');
 const {onRequest:routeRequest}=await import('data:text/javascript;base64,'+Buffer.from(middleware).toString('base64'));
 const redirects=await fs.readFile('_redirects','utf8');
 assert.match(redirects,/^\/services\/\* \/services 301$/m);
 for(const slug of slugs){
  const html=await fs.readFile(`services/${slug}/index.html`,'utf8');
  assert.match(html,/Full Diagnosis/);assert.match(html,/commercial-offers.js/);assert.doesNotMatch(html,/<template|src="\/service-route.js"/);
  for(const suffix of ['', '/', '/index.html']){
   let calls=0;
   const response=await routeRequest({request:new Request(`https://local.test/services/${slug}${suffix}`),next:async()=>{calls++;return new Response('retired source');}});
   assert.equal(response.status,301);assert.equal(response.headers.get('location'),'https://local.test/services');assert.equal(calls,0);
   assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  }
 }
 assert.doesNotMatch(middleware,/AI & Automation Services|AI opportunity assessment, implementation/);
});
