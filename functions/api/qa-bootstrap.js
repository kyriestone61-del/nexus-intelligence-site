const SUPABASE_URL='https://dmdgkjksouhhsuojthav.supabase.co';
const REPOSITORY='kyriestone61-del/nexus-intelligence-site';
const REPOSITORY_ID='1350685035';
const REPOSITORY_OWNER='kyriestone61-del';
const REPOSITORY_OWNER_ID='322500944';
const WORKFLOW_REF=`${REPOSITORY}/.github/workflows/control-room-browser-qa.yml@refs/heads/main`;
const LEGACY_SUBJECT=`repo:${REPOSITORY}:ref:refs/heads/main`;
const IMMUTABLE_SUBJECT=`repo:${REPOSITORY_OWNER}@${REPOSITORY_OWNER_ID}/nexus-intelligence-site@${REPOSITORY_ID}:ref:refs/heads/main`;
const OIDC_ISSUER='https://token.actions.githubusercontent.com';
const OIDC_AUDIENCE='nexus-qa';
const JWKS_URL='https://token.actions.githubusercontent.com/.well-known/jwks';
const jsonHeaders={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};

const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:jsonHeaders});
const base64UrlBytes=value=>{
  const base64=String(value||'').replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-String(value||'').length%4)%4);
  const binary=atob(base64);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
};
const decodePart=value=>JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
const audIncludes=(aud,expected)=>(Array.isArray(aud)?aud:[aud]).includes(expected);
const safeRunPart=value=>String(value||'').replace(/[^0-9A-Za-z_-]/g,'').slice(0,80);

class QaProvisionError extends Error{
  constructor(stage,status=null){super(`QA provisioning failed at ${stage}.`);this.qaStage=stage;this.qaStatus=status;}
}
function provisioningStage(path,method){
  if(path.startsWith('/auth/v1/admin/users'))return method==='POST'?'auth_create_user':method==='DELETE'?'auth_delete_user':'auth_list_users';
  if(path.startsWith('/rest/v1/nexus_companies'))return method==='POST'?'company_create':'company_delete';
  if(path.startsWith('/rest/v1/nexus_profiles'))return'profiles_create';
  if(path.startsWith('/rest/v1/nexus_platform_members'))return'platform_admin_membership_create';
  if(path.startsWith('/rest/v1/nexus_company_members'))return'company_memberships_create';
  return'supabase_request';
}

async function verifyGithubOidc(request){
  const authorization=request.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))throw new Error('Missing GitHub OIDC token.');
  const token=authorization.slice(7).trim(),parts=token.split('.');
  if(parts.length!==3)throw new Error('Malformed GitHub OIDC token.');
  const header=decodePart(parts[0]),claims=decodePart(parts[1]);
  if(header.alg!=='RS256'||!header.kid)throw new Error('Unsupported GitHub OIDC token.');
  const jwksResponse=await fetch(JWKS_URL,{headers:{accept:'application/json'}});
  if(!jwksResponse.ok)throw new Error('GitHub OIDC key set is unavailable.');
  const jwks=await jwksResponse.json(),jwk=(jwks.keys||[]).find(key=>key.kid===header.kid);
  if(!jwk)throw new Error('GitHub OIDC signing key was not found.');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64UrlBytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error('Invalid GitHub OIDC signature.');
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==OIDC_ISSUER||!audIncludes(claims.aud,OIDC_AUDIENCE))throw new Error('GitHub OIDC issuer or audience is invalid.');
  if(!claims.exp||Number(claims.exp)<now-30||Number(claims.iat||0)>now+60)throw new Error('GitHub OIDC token is expired or not yet valid.');
  if(claims.repository!==REPOSITORY||claims.repository_owner!==REPOSITORY_OWNER)throw new Error('GitHub OIDC repository is not authorized.');
  if(String(claims.repository_id||'')!==REPOSITORY_ID||String(claims.repository_owner_id||'')!==REPOSITORY_OWNER_ID)throw new Error('GitHub OIDC immutable repository identity is not authorized.');
  if(claims.ref!=='refs/heads/main'||!['push','workflow_dispatch'].includes(claims.event_name))throw new Error('Only main-branch production QA may provision identities.');
  if(claims.workflow_ref!==WORKFLOW_REF)throw new Error('GitHub OIDC workflow is not authorized.');
  const subject=String(claims.sub||'');
  if(subject!==IMMUTABLE_SUBJECT&&subject!==LEGACY_SUBJECT)throw new Error('GitHub OIDC subject is not authorized.');
  if(!safeRunPart(claims.run_id))throw new Error('GitHub OIDC run identifier is missing.');
  return claims;
}

function serviceHeaders(env,extra={}){
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new QaProvisionError('service_role_config');
  return {'content-type':'application/json','apikey':key,'authorization':`Bearer ${key}`,...extra};
}

async function serviceFetch(env,path,{method='GET',body,headers={}}={}){
  const stage=provisioningStage(path,method);
  let requestHeaders;try{requestHeaders=serviceHeaders(env,headers)}catch(error){throw error}
  const result=await fetch(`${SUPABASE_URL}${path}`,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await result.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!result.ok)throw new QaProvisionError(stage,result.status);
  return data;
}

async function listUsers(env){
  const data=await serviceFetch(env,'/auth/v1/admin/users?page=1&per_page=1000');
  return Array.isArray(data?.users)?data.users:[];
}
async function createUser(env,{email,password,fullName,runKey,companyName}){
  const data=await serviceFetch(env,'/auth/v1/admin/users',{method:'POST',body:{
    email,password,email_confirm:true,
    user_metadata:{full_name:fullName,nexus_qa:true,nexus_qa_run_key:runKey,nexus_qa_company_name:companyName,disposable:true},
    app_metadata:{nexus_qa:true,nexus_qa_run_key:runKey,disposable:true}
  }});
  const user=data?.user||data;
  if(!user?.id)throw new QaProvisionError('auth_create_user_response');
  return user;
}
async function deleteUser(env,id){
  if(!id)return;
  await serviceFetch(env,`/auth/v1/admin/users/${encodeURIComponent(id)}`,{method:'DELETE',body:{should_soft_delete:false}});
}
async function deleteCompanyByName(env,name){
  if(!name)return;
  await serviceFetch(env,`/rest/v1/nexus_companies?name=eq.${encodeURIComponent(name)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
}
async function cleanupUsers(env,users){
  const companyNames=[...new Set(users.map(user=>user?.user_metadata?.nexus_qa_company_name).filter(Boolean))];
  for(const name of companyNames){try{await deleteCompanyByName(env,name)}catch(error){console.warn('QA company cleanup failed',name,error.message)}}
  for(const user of users){try{await deleteUser(env,user.id)}catch(error){console.warn('QA user cleanup failed',user.id,error.message)}}
}
async function cleanupRun(env,runKey){
  const users=(await listUsers(env)).filter(user=>user?.user_metadata?.nexus_qa===true&&user?.user_metadata?.nexus_qa_run_key===runKey);
  await cleanupUsers(env,users);
  return users.length;
}
async function cleanupStale(env,currentRunKey){
  const cutoff=Date.now()-24*60*60*1000;
  const users=(await listUsers(env)).filter(user=>{
    if(user?.user_metadata?.nexus_qa!==true||user?.user_metadata?.nexus_qa_run_key===currentRunKey)return false;
    const created=Date.parse(user.created_at||'');return Number.isFinite(created)&&created<cutoff;
  }).slice(0,50);
  if(users.length)await cleanupUsers(env,users);
  return users.length;
}
function randomPassword(){
  const bytes=crypto.getRandomValues(new Uint8Array(24));
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return `Nq!${btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}9a`;
}
async function insertQaRows(env,{admin,client,companyName,runKey}){
  const companyRows=await serviceFetch(env,'/rest/v1/nexus_companies?select=id,name',{method:'POST',headers:{Prefer:'return=representation'},body:{
    name:companyName,website:`https://qa.invalid/${encodeURIComponent(runKey)}`,industry:'Relystra QA',created_by:admin.id
  }});
  const company=Array.isArray(companyRows)?companyRows[0]:companyRows;
  if(!company?.id)throw new QaProvisionError('company_create_response');
  await serviceFetch(env,'/rest/v1/nexus_profiles',{method:'POST',headers:{Prefer:'return=minimal'},body:[
    {user_id:admin.id,full_name:'Relystra QA Administrator',job_title:'Automated QA'},
    {user_id:client.id,full_name:'Relystra QA Client',job_title:'Automated QA'}
  ]});
  await serviceFetch(env,'/rest/v1/nexus_platform_members',{method:'POST',headers:{Prefer:'return=minimal'},body:{user_id:admin.id,platform_role:'admin',active:true,added_by:admin.id}});
  await serviceFetch(env,'/rest/v1/nexus_company_members',{method:'POST',headers:{Prefer:'return=minimal'},body:[
    {company_id:company.id,user_id:admin.id,member_role:'owner',active:true,added_by:admin.id},
    {company_id:company.id,user_id:client.id,member_role:'client',active:true,added_by:admin.id}
  ]});
  return company;
}

async function provision(env,claims){
  const runKey=`${safeRunPart(claims.run_id)}-${safeRunPart(claims.run_attempt||'1')}`;
  const companyName=`Relystra QA ${runKey}`;
  await cleanupRun(env,runKey);
  await cleanupStale(env,runKey);
  const adminPassword=randomPassword(),clientPassword=randomPassword();
  const adminEmail=`qa-admin+${runKey}@nexusintelligence.live`,clientEmail=`qa-client+${runKey}@nexusintelligence.live`;
  let admin=null,client=null;
  try{
    admin=await createUser(env,{email:adminEmail,password:adminPassword,fullName:'Relystra QA Administrator',runKey,companyName});
    client=await createUser(env,{email:clientEmail,password:clientPassword,fullName:'Relystra QA Client',runKey,companyName});
    const company=await insertQaRows(env,{admin,client,companyName,runKey});
    return {ok:true,run_key:runKey,company_name:company.name,company_id:company.id,admin_email:adminEmail,admin_password:adminPassword,client_email:clientEmail,client_password:clientPassword};
  }catch(error){
    try{await deleteCompanyByName(env,companyName)}catch{}
    for(const user of [client,admin]){if(user?.id)try{await deleteUser(env,user.id)}catch{}}
    throw error;
  }
}

export async function onRequestPost(context){
  let claims;
  try{claims=await verifyGithubOidc(context.request)}catch(error){
    console.error('Relystra QA bootstrap OIDC verification',error);
    return response(401,{ok:false,error:'Unauthorized QA bootstrap request.',stage:'oidc_verification'});
  }
  try{
    const body=await context.request.json().catch(()=>({}));
    const action=String(body?.action||'').toLowerCase();
    const runKey=`${safeRunPart(claims.run_id)}-${safeRunPart(claims.run_attempt||'1')}`;
    if(action==='provision')return response(200,await provision(context.env,claims));
    if(action==='cleanup')return response(200,{ok:true,run_key:runKey,deleted_users:await cleanupRun(context.env,runKey)});
    return response(400,{ok:false,error:'Unsupported QA bootstrap action.',stage:'request_validation'});
  }catch(error){
    console.error('Relystra QA bootstrap provisioning',error);
    return response(500,{ok:false,error:'QA bootstrap failed.',stage:error?.qaStage||'provisioning_unknown',upstream_status:error?.qaStatus||null});
  }
}
