import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedSupportPassages} from '../../supabase/functions/_shared/relystra-support.ts';

test('support presents verified source passages and escalates invented, foreign or uncertain answers',()=>{
  const sources=[{id:'delivered_build:faq:1',title:'Usage FAQ',body:'Open the approved intake form. Bid submission remains outside this Build.'}];
  const grounded={supported:true,confidence:0.95,citations:[{source_id:sources[0].id,quote:'Bid submission remains outside this Build.'}],answer:'IGNORE THIS UNSUPPORTED MODEL TEXT'};
  assert.deepEqual(verifiedSupportPassages(grounded,sources),grounded.citations);
  assert.deepEqual(verifiedSupportPassages({...grounded,confidence:0.5},sources),[]);
  assert.deepEqual(verifiedSupportPassages({...grounded,supported:false},sources),[]);
  assert.deepEqual(verifiedSupportPassages({...grounded,citations:[{source_id:'foreign_build',quote:grounded.citations[0].quote}]},sources),[]);
  assert.deepEqual(verifiedSupportPassages({...grounded,citations:[{source_id:sources[0].id,quote:'Automatically submit every bid.'}]},sources),[]);
});
