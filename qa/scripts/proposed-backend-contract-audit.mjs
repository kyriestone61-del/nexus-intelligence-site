import fs from 'node:fs';

const file='qa/proposed-migrations/post_reset_foundation.sql';
const sql=fs.readFileSync(file,'utf8');
const failures=[];
const requireText=(needle,message)=>{if(!sql.includes(needle))failures.push(message)};
const forbid=(pattern,message)=>{if(pattern.test(sql))failures.push(message)};

requireText('PROPOSAL ONLY — DO NOT APPLY TO PRODUCTION DURING THE ACTIVE RESET','proposal safety banner missing');
requireText('create table public.nexus_active_engagements','explicit active-engagement table missing');
requireText('foreign key (company_id,project_id)','active engagement lacks composite company/project foreign key');
requireText('references public.nexus_projects(company_id,id)','active engagement does not enforce project/company ownership');
requireText('alter table public.nexus_active_engagements enable row level security','active engagement RLS missing');
requireText("public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id)",'active engagement member read boundary missing');
requireText('create or replace function public.nexus_set_active_engagement','active engagement setter RPC missing');
requireText("p.status not in ('complete','cancelled')",'active engagement setter does not reject terminal projects');

requireText('drop policy if exists "nexus members view company memory"','raw member Company Memory policy is not removed in proposal');
requireText('create policy "nexus admins view company memory"','admin-only raw Company Memory read policy missing');
requireText('create or replace function public.nexus_get_company_memory_client','client-safe Company Memory RPC missing');
requireText('select m.company_id,m.goals,m.systems,m.terminology,m.updated_at','client-safe memory projection is not explicit');
const clientFunction=sql.split('create or replace function public.nexus_get_company_memory_client')[1]?.split('-- Required frontend contract')[0]||'';
if(/operating_context|decision_notes|updated_by/.test(clientFunction))failures.push('client-safe Company Memory function leaks internal-only fields');

requireText('create or replace function public.nexus_onboard_company_atomic','atomic onboarding RPC missing');
requireText("values(v_company,v_user,'owner',true,v_user)",'onboarding does not create owner membership');
requireText("'ai-opportunity-assessment'",'initial opportunity assessment service slug missing');
requireText("'discovery'",'initial project type is not explicit');
requireText("'created',false",'idempotent existing-workspace response missing');
requireText("'created',true",'new-workspace response missing');
requireText('Existing workspace has multiple active projects; Nexus must select the active engagement.','onboarding does not refuse ambiguous active engagement');

forbid(/grant\s+execute\s+on\s+function[^;]+\s+to\s+anon/i,'proposed privileged function grants execute to anon');
forbid(/service_role_key|SUPABASE_SERVICE|RESEND_API_KEY|AI_GATEWAY_API_KEY/i,'secret/credential identifier unexpectedly embedded in proposal');

console.log('# Proposed Nexus backend contract audit');
if(failures.length){
  failures.forEach(x=>console.error(`FAIL: ${x}`));
  process.exit(1);
}
console.log('PASS: proposal preserves explicit engagement identity, tenant integrity, client-safe memory, and atomic onboarding contracts.');
