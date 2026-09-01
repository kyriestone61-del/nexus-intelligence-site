import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeSourceResult,sourcesVerified,rankClientActions} from './client-guide-truth-priority.mjs';

const source=fs.readFileSync('portal-client-guide.js','utf8');

test('failed reads remain unverified',()=>{
  const result=normalizeSourceResult(null,{error:new Error('network down')});
  assert.equal(result.verified,false);
  assert.equal(result.data,null);
});

test('verified empty differs from read failure',()=>{
  const result=normalizeSourceResult([]);
  assert.equal(result.verified,true);
  assert.deepEqual(result.data,[]);
});

test('all required sources must verify before clear-state claims',()=>{
  assert.equal(sourcesVerified({sourceState:{approvals:{verified:true},docRequests:{verified:false}}},['approvals','docRequests']),false);
});

test('overdue evidence survives the three-item cap',()=>{
  const now=Date.parse('2026-09-01T12:00:00Z');
  const ranked=rankClientActions([
    {kind:'task',title:'Normal A',status:'open'},
    {kind:'task',title:'Normal B',status:'open'},
    {kind:'task',title:'Normal C',status:'open'},
    {kind:'file',title:'Overdue evidence',status:'waiting_on_client',due:'2026-08-31T12:00:00Z'}
  ],{now,limit:3});
  assert.equal(ranked[0].title,'Overdue evidence');
  assert.equal(ranked.length,3);
});

test('approval outranks high-priority undated work',()=>{
  const ranked=rankClientActions([
    {kind:'task',title:'High task',status:'open',priority:'high'},
    {kind:'approval',title:'Decision',status:'ready_for_review'},
    {kind:'task',title:'Normal task',status:'open'}
  ],{now:Date.parse('2026-09-01T12:00:00Z')});
  assert.equal(ranked[0].title,'Decision');
});

test('runtime source does not collapse read errors to empty arrays',()=>{
  assert.doesNotMatch(source,/catch\(error\)\{[^}]*return \[\]/s);
  assert.match(source,/sourceState/);
  assert.match(source,/rankClientActions/);
  assert.match(source,/Live action state could not be verified/);
  assert.match(source,/Report availability could not be verified/);
});
