function check(error:any,stage:string){if(error)throw new Error(stage);}
export async function revokeQaUser(admin:any,id:string|null){
  if(!id)return false;
  const {data,error}=await admin.auth.admin.getUserById(id);if(error?.status===404)return false;check(error,'auth_qa_identity');
  if(data.user?.app_metadata?.nexus_qa!==true||data.user?.app_metadata?.disposable!==true)throw new Error('auth_qa_identity');
  for(const table of ['nexus_platform_members','nexus_company_members']){const {error}=await admin.from(table).update({active:false}).eq('user_id',id);check(error,'auth_qa_revoke');}
  const banned=await admin.auth.admin.updateUserById(id,{ban_duration:'876000h'});check(banned.error,'auth_qa_ban');return true;
}
export async function deleteUser(admin:any,id:string|null){
  if(!await revokeQaUser(admin,id))return;
  const {error}=await admin.auth.admin.deleteUser(id,false);
  // Real acceptance records retain their author FK. Disable and soft-delete the identity without erasing that history.
  if(error){const soft=await admin.auth.admin.deleteUser(id,true);check(soft.error,'auth_delete_user');}
}
