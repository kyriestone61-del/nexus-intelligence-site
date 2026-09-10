import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteUser,revokeQaUser} from '../../supabase/functions/_shared/relystra-qa-identity.ts';
function fixture({metadata={nexus_qa:true,disposable:true},missing=false,referenced=false,revokeFails=false}={}){
 const calls=[];return {calls,auth:{admin:{
  async getUserById(){return missing?{error:{status:404}}:{data:{user:{app_metadata:metadata}}}},
  async updateUserById(id,attrs){calls.push(['ban',id,attrs]);return {}},
  async deleteUser(id,soft){calls.push(['delete',id,soft]);return referenced&&!soft?{error:{status:500}}:{}},
 }},from(table){return {update(values){return {async eq(key,id){calls.push(['revoke',table,id,values]);return revokeFails?{error:{message:'unavailable'}}:{}}}}}}};
}
test('QA cleanup revokes privileges and bans before deletion; referenced authors are soft-deleted',async()=>{
 const db=fixture({referenced:true});await deleteUser(db,'qa-author');
 assert.deepEqual(db.calls.map(x=>x[0]),['revoke','revoke','ban','delete','delete']);
 assert.deepEqual(db.calls.slice(-2),[['delete','qa-author',false],['delete','qa-author',true]]);
 assert.ok(db.calls.slice(0,2).every(x=>x[3].active===false));
});
test('cleanup cannot disable a real account and cannot continue after privilege revocation fails',async()=>{
 const real=fixture({metadata:{}});await assert.rejects(deleteUser(real,'real-user'),/auth_qa_identity/);assert.equal(real.calls.length,0);
 const failed=fixture({revokeFails:true});await assert.rejects(deleteUser(failed,'qa-user'),/auth_qa_revoke/);assert.equal(failed.calls.filter(x=>x[0]==='delete').length,0);
});
test('cleanup is idempotent for absent identities; revocation can precede fixture deletion',async()=>{
 const absent=fixture({missing:true});await deleteUser(absent,'removed');assert.equal(absent.calls.length,0);
 const db=fixture();await revokeQaUser(db,'qa-user');assert.deepEqual(db.calls.map(x=>x[0]),['revoke','revoke','ban']);
});
