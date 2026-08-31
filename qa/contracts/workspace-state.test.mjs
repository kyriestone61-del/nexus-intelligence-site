import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkspaceLoadError,createWorkspaceLoadController,collectWorkspaceQueries,
  loadWorkspaceSnapshot,describeWorkspaceLoadError
} from './workspace-state.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('failed query is an explicit load error, never a false empty list',async()=>{
  await assert.rejects(
    collectWorkspaceQueries({
      projects:Promise.resolve({data:[{id:'p1'}],error:null}),
      tasks:Promise.resolve({data:null,error:new Error('network down')})
    }),
    error=>error instanceof WorkspaceLoadError&&error.failures.some(x=>x.label==='tasks')
  );
});

test('older company response becomes stale after a newer company load begins',async()=>{
  const controller=createWorkspaceLoadController();
  const oldLoad=loadWorkspaceSnapshot({
    controller,
    companyId:'company-a',
    queries:()=>({
      projects:(async()=>{await wait(40);return {data:[{id:'a'}],error:null}})(),
      tasks:(async()=>{await wait(40);return {data:[],error:null}})()
    })
  });
  await wait(5);
  const currentLoad=loadWorkspaceSnapshot({
    controller,
    companyId:'company-b',
    queries:()=>({
      projects:Promise.resolve({data:[{id:'b'}],error:null}),
      tasks:Promise.resolve({data:[],error:null})
    })
  });
  const current=await currentLoad;
  const old=await oldLoad;
  assert.equal(current.applied,true);
  assert.equal(current.data.projects[0].id,'b');
  assert.equal(old.applied,false);
  assert.equal(old.stale,true);
  assert.equal(old.data,null);
});

test('same company generation remains current',async()=>{
  const controller=createWorkspaceLoadController();
  const result=await loadWorkspaceSnapshot({
    controller,
    companyId:'company-a',
    queries:()=>({projects:Promise.resolve({data:[],error:null})})
  });
  assert.equal(result.applied,true);
  assert.equal(result.stale,false);
});

test('error copy states that failed data was not treated as empty',()=>{
  const message=describeWorkspaceLoadError(new WorkspaceLoadError([{label:'metrics',error:new Error('x')}]))
  assert.match(message,/not treated as empty/i);
  assert.match(message,/metrics/i);
});
