import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RequiredModuleLoadError,buildAdminModulePlan,buildSharedModulePlan,
  loadModulePlan,requiredModuleIds,assertWorkspaceReady
} from './module-loader.mjs';

test('core admin modules are explicitly required',()=>{
  const required=requiredModuleIds(buildAdminModulePlan({providerConfigured:true}));
  for(const id of ['admin-intake','diagnosis-view','admin-journey','journey-router','diagnosis-controller','journey-task-guard']){
    assert.ok(required.includes(id),`${id} must be required`);
  }
});

test('manual diagnosis fallback becomes required when automated provider is unavailable',()=>{
  assert.equal(requiredModuleIds(buildAdminModulePlan({providerConfigured:false})).includes('diagnosis-manual-fallback'),true);
  assert.equal(requiredModuleIds(buildAdminModulePlan({providerConfigured:true})).includes('diagnosis-manual-fallback'),false);
});

test('required module failure blocks workspace readiness',async()=>{
  await assert.rejects(
    loadModulePlan(buildSharedModulePlan(),{importer:async url=>{if(url==='portal-action-execution-v2.js')throw new Error('404');return {ok:true}}}),
    error=>error instanceof RequiredModuleLoadError&&error.moduleId==='action-execution'
  );
});

test('optional module failure is recorded without hiding required modules',async()=>{
  const plan=buildAdminModulePlan({providerConfigured:true});
  const result=await loadModulePlan(plan,{importer:async(_url,item)=>{
    if(item.id==='diagnosis-review-ux')throw new Error('optional failed');
    return {id:item.id};
  }});
  assert.equal(result.optionalFailures.length,1);
  assert.equal(result.optionalFailures[0].id,'diagnosis-review-ux');
  assert.equal(assertWorkspaceReady({plan,result}),true);
});

test('workspace readiness refuses a result with a missing required module',()=>{
  const plan=buildAdminModulePlan();
  const loaded=new Map(plan.map(x=>[x.id,x.id==='admin-journey'?null:{}]));
  assert.throws(()=>assertWorkspaceReady({plan,result:{loaded}}),/admin-journey/);
});
