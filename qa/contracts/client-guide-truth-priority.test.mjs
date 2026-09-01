import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSourceResult,
  sourcesVerified,
  rankClientActions,
  actionStateMessage,
  reportAvailabilityMessage
} from './client-guide-truth-priority.mjs';

test('failed live read remains unverified instead of becoming an empty list',()=>{
  const source=normalizeSourceResult(null,{error:new Error('network down')});
  assert.equal(source.verified,false);
  assert.equal(source.data,null);
  assert.match(source.error,/network down/);
});

test('verified empty read remains distinguishable from failed read',()=>{
  const source=normalizeSourceResult([]);
  assert.equal(source.verified,true);
  assert.deepEqual(source.data,[]);
});

test('action-critical sources must all be verified before claiming the client is clear',()=>{
  const snapshot={sourceState:{approvals:{verified:true},docRequests:{verified:false}}};
  assert.equal(sourcesVerified(snapshot,['approvals','docRequests']),false);
  assert.match(actionStateMessage({verified:false,items:[]}),/could not be verified/i);
  assert.equal(actionStateMessage({verified:true,items:[]}), 'You are clear right now');
});

test('overdue evidence request survives the three-item cap even with three open tasks',()=>{
  const now=Date.parse('2026-09-01T12:00:00Z');
  const ranked=rankClientActions([
    {kind:'task',title:'Normal task A',status:'open',priority:'normal'},
    {kind:'task',title:'Normal task B',status:'open',priority:'normal'},
    {kind:'task',title:'Normal task C',status:'open',priority:'normal'},
    {kind:'file',title:'Overdue evidence',status:'waiting_on_client',due:'2026-08-31T12:00:00Z'}
  ],{now,limit:3});
  assert.equal(ranked.length,3);
  assert.equal(ranked[0].title,'Overdue evidence');
  assert.ok(!ranked.some(x=>x.title==='Normal task C'));
});

test('ready-for-review decision outranks high-priority undated work',()=>{
  const ranked=rankClientActions([
    {kind:'task',title:'High task',status:'open',priority:'high'},
    {kind:'approval',title:'Decision',status:'ready_for_review'},
    {kind:'task',title:'Normal task',status:'open',priority:'normal'}
  ],{now:Date.parse('2026-09-01T12:00:00Z')});
  assert.equal(ranked[0].title,'Decision');
  assert.equal(ranked[1].title,'High task');
});

test('report lookup error cannot be translated into no-report language',()=>{
  assert.match(reportAvailabilityMessage({verified:false,releases:[]}),/could not be verified/i);
  assert.equal(reportAvailabilityMessage({verified:true,releases:[]}),'No released report is visible yet.');
});
