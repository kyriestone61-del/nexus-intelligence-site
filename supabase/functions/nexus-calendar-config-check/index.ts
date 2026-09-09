import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.115.0";
import Stripe from "npm:stripe@22.6.1";

const REPOSITORY='kyriestone61-del/nexus-intelligence-site';
const REPOSITORY_ID='1350685035';
const REPOSITORY_OWNER='kyriestone61-del';
const REPOSITORY_OWNER_ID='322500944';
const WORKFLOW_REF=`${REPOSITORY}/.github/workflows/control-room-browser-qa.yml@refs/heads/main`;
const IMMUTABLE_SUBJECT=`repo:${REPOSITORY_OWNER}@${REPOSITORY_OWNER_ID}/nexus-intelligence-site@${REPOSITORY_ID}:ref:refs/heads/main`;
const LEGACY_SUBJECT=`repo:${REPOSITORY}:ref:refs/heads/main`;
const OIDC_ISSUER='https://token.actions.githubusercontent.com';
const OIDC_AUDIENCE='nexus-qa';
const JWKS_URL='https://token.actions.githubusercontent.com/.well-known/jwks';
const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
const safeRunPart=(value:unknown)=>String(value||'').replace(/[^0-9A-Za-z_-]/g,'').slice(0,80);
const base64UrlBytes=(value:string)=>{const base64=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);const binary=atob(base64);return Uint8Array.from(binary,c=>c.charCodeAt(0));};
const decodePart=(value:string)=>JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
const audIncludes=(aud:unknown,expected:string)=>(Array.isArray(aud)?aud:[aud]).includes(expected);

async function verifyGithubOidc(req:Request){
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))throw new Error('oidc_missing');
  const token=authorization.slice(7).trim(),parts=token.split('.');
  if(parts.length!==3)throw new Error('oidc_malformed');
  const header=decodePart(parts[0]),claims=decodePart(parts[1]);
  if(header.alg!=='RS256'||!header.kid)throw new Error('oidc_algorithm');
  const jwksResponse=await fetch(JWKS_URL,{headers:{accept:'application/json'}});
  if(!jwksResponse.ok)throw new Error('oidc_jwks');
  const jwks=await jwksResponse.json(),jwk=(jwks.keys||[]).find((key:any)=>key.kid===header.kid);
  if(!jwk)throw new Error('oidc_key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64UrlBytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error('oidc_signature');
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==OIDC_ISSUER||!audIncludes(claims.aud,OIDC_AUDIENCE))throw new Error('oidc_identity');
  if(!claims.exp||Number(claims.exp)<now-30||Number(claims.iat||0)>now+60)throw new Error('oidc_time');
  if(claims.repository!==REPOSITORY||claims.repository_owner!==REPOSITORY_OWNER)throw new Error('oidc_repository');
  if(String(claims.repository_id||'')!==REPOSITORY_ID||String(claims.repository_owner_id||'')!==REPOSITORY_OWNER_ID)throw new Error('oidc_repository_ids');
  if(claims.ref!=='refs/heads/main'||!['push','workflow_dispatch'].includes(claims.event_name))throw new Error('oidc_ref');
  if(claims.workflow_ref!==WORKFLOW_REF)throw new Error('oidc_workflow');
  const subject=String(claims.sub||'');
  if(subject!==IMMUTABLE_SUBJECT&&subject!==LEGACY_SUBJECT)throw new Error('oidc_subject');
  if(!safeRunPart(claims.run_id))throw new Error('oidc_run');
  return claims;
}

function adminClient(){
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw new Error('service_role_config');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function check(error:any,stage:string){if(error){console.error('nexus_qa_stage',stage,error?.message||String(error));throw new Error(stage);}}
async function createUser(admin:any,{email,password,fullName,runKey,companyName}:{email:string,password:string,fullName:string,runKey:string,companyName:string}){
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName,nexus_qa:true,nexus_qa_run_key:runKey,nexus_qa_company_name:companyName,disposable:true},app_metadata:{nexus_qa:true,nexus_qa_run_key:runKey,disposable:true}});
  check(error,'auth_create_user');if(!data?.user?.id)throw new Error('auth_create_user_response');return data.user;
}
async function deleteUser(admin:any,id:string|null){if(!id)return;const {error}=await admin.auth.admin.deleteUser(id,false);check(error,'auth_delete_user');}
async function deleteCompany(admin:any,id:string|null,name:string){if(!id)return;const {error}=await admin.from('nexus_companies').delete().eq('id',id).eq('name',name);check(error,'company_delete');}
async function getFixture(admin:any,runKey:string){const {data,error}=await admin.from('nexus_qa_fixture_runs').select('run_key,company_id,admin_user_id,client_user_id,created_at').eq('run_key',runKey).maybeSingle();check(error,'fixture_read');return data;}
async function cleanupFixture(admin:any,runKey:string){
  const fixture=await getFixture(admin,runKey);if(!fixture)return 0;
  if(!fixture.company_id){await deleteUser(admin,fixture.client_user_id);await deleteUser(admin,fixture.admin_user_id);return 2;}
  const expectedName=`Nexus QA ${runKey}`;
  const {data:company,error:companyError}=await admin.from('nexus_companies').select('id').eq('id',fixture.company_id).eq('name',expectedName).maybeSingle();check(companyError,'fixture_company_read');
  if(!company)throw new Error('fixture_company_identity');
  const {data:plans,error:planError}=await admin.from('nexus_build_plans').select('checkout_session_id,checkout_livemode,checkout_account_id').eq('company_id',company.id);check(planError,'fixture_plans_read');
  if((plans||[]).some((p:any)=>p.checkout_livemode===true))throw new Error('fixture_live_payment');
  const {data:events,error:eventError}=await admin.from('nexus_delivery_payment_events').select('livemode,nexus_build_plans!inner(company_id)').eq('nexus_build_plans.company_id',company.id);check(eventError,'fixture_events_read');
  if((events||[]).some((event:any)=>event.livemode))throw new Error('fixture_live_payment');
  const sessions=(plans||[]).filter((p:any)=>p.checkout_session_id);
  if(sessions.length){
    const key=Deno.env.get('RELYSTRA_STRIPE_TEST_SECRET_KEY')||'',account=Deno.env.get('RELYSTRA_STRIPE_ACCOUNT_ID');
    if(!/^(sk|rk)_test_/.test(key)||!account)throw new Error('fixture_stripe_config');
    const stripe=new Stripe(key,{apiVersion:'2026-08-26.dahlia',httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:2,timeout:15000});
    if((await stripe.accounts.retrieve(null)).id!==account)throw new Error('fixture_stripe_account');
    for(const plan of sessions){
      if(plan.checkout_livemode!==false||plan.checkout_account_id!==account||!plan.checkout_session_id.startsWith('cs_test_'))throw new Error('fixture_session_identity');
      const session=await stripe.checkout.sessions.retrieve(plan.checkout_session_id);
      if(session.livemode)throw new Error('fixture_live_session');
      if(session.status==='open')await stripe.checkout.sessions.expire(session.id);
    }
  }
  const {data:documents,error:documentError}=await admin.from('nexus_documents').select('storage_path').eq('company_id',company.id);check(documentError,'fixture_documents_read');
  const paths=(documents||[]).map((d:any)=>d.storage_path).filter(Boolean);
  if(paths.some((path:string)=>!path.startsWith(company.id+'/')))throw new Error('fixture_storage_identity');
  if(paths.length){const {error}=await admin.storage.from('nexus-client-documents').remove(paths);check(error,'fixture_storage_delete');}
  const {error:cleanupError}=await admin.rpc('relystra_cleanup_qa_commerce',{p_run_key:runKey});check(cleanupError,'fixture_commercial_cleanup');
  await deleteUser(admin,fixture.client_user_id);
  await deleteUser(admin,fixture.admin_user_id);
  const {error}=await admin.from('nexus_qa_fixture_runs').delete().eq('run_key',runKey);if(error&&error.code!=='PGRST116')check(error,'fixture_delete');
  return 2;
}
async function cleanupStale(admin:any,currentRunKey:string){
  const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
  const {data,error}=await admin.from('nexus_qa_fixture_runs').select('run_key').lt('created_at',cutoff).neq('run_key',currentRunKey).limit(25);check(error,'fixture_stale_read');
  let cleaned=0;for(const row of data||[]){try{cleaned+=await cleanupFixture(admin,row.run_key)}catch(error){console.warn('nexus_qa_stale_cleanup',row.run_key)}}return cleaned;
}
function randomPassword(){const bytes=crypto.getRandomValues(new Uint8Array(24));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return `Nq!${btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}9a`;}
async function insertQaRows(admin:any,{adminUser,clientUser,companyName,runKey}:{adminUser:any,clientUser:any,companyName:string,runKey:string}){
  const {data:company,error:companyError}=await admin.from('nexus_companies').insert({name:companyName,website:`https://qa.invalid/${encodeURIComponent(runKey)}`,industry:'Nexus QA',created_by:adminUser.id}).select('id,name').single();check(companyError,'company_create');
  const {error:profilesError}=await admin.from('nexus_profiles').insert([{user_id:adminUser.id,full_name:'Nexus QA Administrator',job_title:'Automated QA'},{user_id:clientUser.id,full_name:'Nexus QA Client',job_title:'Automated QA'}]);check(profilesError,'profiles_create');
  const {error:platformError}=await admin.from('nexus_platform_members').insert({user_id:adminUser.id,platform_role:'admin',active:true,added_by:adminUser.id});check(platformError,'platform_admin_membership_create');
  const {error:membersError}=await admin.from('nexus_company_members').insert([{company_id:company.id,user_id:adminUser.id,member_role:'owner',active:true,added_by:adminUser.id},{company_id:company.id,user_id:clientUser.id,member_role:'client',active:true,added_by:adminUser.id}]);check(membersError,'company_memberships_create');
  const {error:fixtureError}=await admin.from('nexus_qa_fixture_runs').insert({run_key:runKey,company_id:company.id,admin_user_id:adminUser.id,client_user_id:clientUser.id});check(fixtureError,'fixture_create');
  return company;
}
async function provision(claims:any){
  const admin=adminClient(),runKey=`${safeRunPart(claims.run_id)}-${safeRunPart(claims.run_attempt||'1')}`,companyName=`Nexus QA ${runKey}`;
  await cleanupFixture(admin,runKey);
  const {data:prior,error:priorError}=await admin.from('nexus_qa_fixture_runs').select('run_key').like('run_key',safeRunPart(claims.run_id)+'-%').neq('run_key',runKey);check(priorError,'fixture_prior_attempts');
  for(const row of prior||[])await cleanupFixture(admin,row.run_key);
  await cleanupStale(admin,runKey);
  const adminPassword=randomPassword(),clientPassword=randomPassword(),adminEmail=`qa-admin+${runKey}@nexusintelligence.live`,clientEmail=`qa-client+${runKey}@nexusintelligence.live`;
  let adminUser:any=null,clientUser:any=null,company:any=null;
  try{
    adminUser=await createUser(admin,{email:adminEmail,password:adminPassword,fullName:'Nexus QA Administrator',runKey,companyName});
    clientUser=await createUser(admin,{email:clientEmail,password:clientPassword,fullName:'Nexus QA Client',runKey,companyName});
    company=await insertQaRows(admin,{adminUser,clientUser,companyName,runKey});
    return {ok:true,run_key:runKey,company_name:company.name,company_id:company.id,admin_email:adminEmail,admin_password:adminPassword,client_email:clientEmail,client_password:clientPassword};
  }catch(error){
    try{if(company?.id)await deleteCompany(admin,company.id,companyName);else{const {data}=await admin.from('nexus_companies').select('id').eq('name',companyName).maybeSingle();if(data?.id)await deleteCompany(admin,data.id,companyName)}}catch{}
    try{if(clientUser?.id)await deleteUser(admin,clientUser.id)}catch{}
    try{if(adminUser?.id)await deleteUser(admin,adminUser.id)}catch{}
    try{await admin.from('nexus_qa_fixture_runs').delete().eq('run_key',runKey)}catch{}
    throw error;
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('Not Found',{status:404});
  const body=await req.json().catch(()=>({}));const action=String(body?.action||'').toLowerCase();
  if(!['provision','cleanup'].includes(action))return new Response('Not Found',{status:404});
  let claims:any;try{claims=await verifyGithubOidc(req)}catch(error){return response(401,{ok:false,error:'Unauthorized QA bootstrap request.',stage:'oidc_verification'});}
  try{
    const admin=adminClient(),runKey=`${safeRunPart(claims.run_id)}-${safeRunPart(claims.run_attempt||'1')}`;
    if(action==='provision')return response(200,await provision(claims));
    return response(200,{ok:true,run_key:runKey,deleted_users:await cleanupFixture(admin,runKey)});
  }catch(error){console.error('nexus_qa_bootstrap',error instanceof Error?error.message:String(error));return response(500,{ok:false,error:'QA bootstrap failed.',stage:error instanceof Error?error.message:'provisioning_unknown'});}
});

