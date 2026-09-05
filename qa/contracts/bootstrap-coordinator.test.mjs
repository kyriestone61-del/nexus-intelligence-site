import test from 'node:test';
import assert from 'node:assert/strict';
import {BootstrapStateError,createBootstrapCoordinator,runBootstrap} from './bootstrap-coordinator.mjs';

test('workspace cannot reveal before required state is ready',()=>{
  const boot=createBootstrapCoordinator();
  assert.throws(()=>boot.reveal(),BootstrapStateError);
});

test('boot phase cannot be skipped',()=>{
  const boot=createBootstrapCoordinator();
  assert.throws(()=>boot.advance('company_resolved'),/Illegal Relystra boot transition/);
});

test('boot refuses to advance when prerequisites are missing',()=>{
  const boot=createBootstrapCoordinator();
  assert.throws(()=>boot.advance('auth_resolved',{requires:['auth']}),/prerequisites missing/);
});

test('deterministic bootstrap reveals only after auth company operations modules data and role navigation',async()=>{
  const calls=[];
  const result=await runBootstrap({
    resolveAuth:async()=>{calls.push('auth');return {userId:'u'}},
    resolveCompany:async()=>{calls.push('company');return {id:'c'}},
    loadOperations:async()=>{calls.push('ops');return {ok:true}},
    loadRoleModules:async()=>{calls.push('modules');return {ok:true}},
    loadWorkspace:async()=>{calls.push('workspace');return {roleNavigationReady:true}},
    onReveal:async()=>{calls.push('reveal')}
  });
  assert.deepEqual(calls,['auth','company','ops','modules','workspace','reveal']);
  assert.equal(result.boot.phase(),'revealed');
});

test('failed required module load prevents workspace load and reveal',async()=>{
  let workspaceCalled=false;
  await assert.rejects(runBootstrap({
    resolveAuth:async()=>({userId:'u'}),
    resolveCompany:async()=>({id:'c'}),
    loadOperations:async()=>({ok:true}),
    loadRoleModules:async()=>{throw new Error('required module failed')},
    loadWorkspace:async()=>{workspaceCalled=true;return {roleNavigationReady:true}},
    onReveal:async()=>{}
  }),/required module failed/);
  assert.equal(workspaceCalled,false);
});

test('workspace without final role navigation cannot reveal',async()=>{
  await assert.rejects(runBootstrap({
    resolveAuth:async()=>({userId:'u'}),
    resolveCompany:async()=>({id:'c'}),
    loadOperations:async()=>({ok:true}),
    loadRoleModules:async()=>({ok:true}),
    loadWorkspace:async()=>({roleNavigationReady:false}),
    onReveal:async()=>{}
  }),/prerequisites missing/);
});
