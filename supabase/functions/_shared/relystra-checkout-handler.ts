import {createClient} from 'jsr:@supabase/supabase-js@2';
import {checkoutParameters,validateSession,type BuildPlan} from './relystra-payments.ts';
import {stripeForMode} from './relystra-stripe.ts';

const origin = Deno.env.get('RELYSTRA_PORTAL_ORIGIN') || 'https://nexusintelligence.live';
const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const json = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers});

export async function handleCheckout(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (req.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  if (req.headers.get('origin') && req.headers.get('origin') !== origin) return json({error:'ORIGIN_NOT_ALLOWED'},403);
  try {
    const body = await req.json();
    if (typeof body.plan_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.plan_id) || !['checkout','cancel'].includes(body.operation || 'checkout')) return json({error:'INVALID_REQUEST'},400);
    const url = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    let visible:any,user:{id:string};
    if(typeof body.report_token==='string'){
      const {data:report,error}=await db.rpc('relystra_basic_report_access',{p_token:body.report_token,p_operation:'checkout'});
      if(error||!report?.plan_id||report.plan_id!==body.plan_id)return json({error:'REPORT_UNAVAILABLE'},404);
      const result=await db.from('nexus_build_plans').select('*').eq('id',report.plan_id).eq('source_discovery_id',report.id).eq('company_id',report.company_id).single();
      if(result.error||!result.data)return json({error:'REPORT_UNAVAILABLE'},404);
      visible=result.data;user={id:report.actor_id};
    }else{
      const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'');
      if (!bearer) return json({error:'AUTH_REQUIRED'},401);
      const actor = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${bearer}`}},auth:{persistSession:false}});
      const {data:authData,error:authError} = await actor.auth.getUser(bearer);
      if(authError||!authData.user)return json({error:'AUTH_REQUIRED'},401);
      user=authData.user;
      // RLS resolves membership before any privileged commercial action.
      const result=await actor.from('nexus_build_plans').select('*').eq('id',body.plan_id).maybeSingle();
      if(result.error||!result.data)return json({error:'PLAN_NOT_FOUND'},404);
      visible=result.data;
    }
    if (visible.status !== 'awaiting_payment') return json({status:visible.status});
    const cancel = body.operation === 'cancel';
    const cancelPlan = async (sessionId: string | null) => {
      const {error} = await db.rpc('relystra_cancel_verified_plan',{p_plan_id:body.plan_id,p_user_id:user.id,p_expired_session_id:sessionId});
      if (error) throw new Error('PLAN_CANCEL_FAILED');
      return json({status:'cancelled'});
    };
    // An unbound attempt has never exposed a URL. If binding wins the race, the locked cancellation RPC refuses it.
    if (cancel && !visible.checkout_session_id) return await cancelPlan(null);
    if (!visible.checkout_session_id && visible.checkout_expires_at && Date.parse(visible.checkout_expires_at) <= Date.now()) return await cancelPlan(null);
    let plan = visible as BuildPlan;
    if (!plan.checkout_started_at) {
      const {data,error} = await db.rpc('relystra_claim_checkout',{p_plan_id:plan.id,p_user_id:user.id});
      if (error) return json({error:'CHECKOUT_UNAVAILABLE',message:'Checkout is not available for this plan yet.'},409);
      plan = data;
    }
    // Test checkout may activate real database access, so only explicitly designated
    // disposable companies may use it. Live mode retains the normal company RLS boundary.
    const testCompanies=(Deno.env.get('RELYSTRA_STRIPE_TEST_COMPANY_IDS')||'').split(',').map(id=>id.trim());
    if (!plan.checkout_livemode && !testCompanies.includes(plan.company_id)) {
      // Only the existing main-branch OIDC bootstrap may register ephemeral QA companies.
      // The registry has no anonymous or authenticated table grants.
      const fixture=await db.from('nexus_qa_fixture_runs').select('company_id').eq('company_id',plan.company_id).gt('created_at',new Date(Date.now()-86400000).toISOString()).not('admin_user_id','is',null).not('client_user_id','is',null).maybeSingle();
      if(fixture.error||!fixture.data)return json({error:'TEST_WORKSPACE_REQUIRED',message:'Test checkout is available only in the designated QA workspace.'},403);
    }
    const stripe = await stripeForMode(plan.checkout_livemode!,plan.checkout_account_id!);
    const session = plan.checkout_session_id
      ? await stripe.checkout.sessions.retrieve(plan.checkout_session_id)
      : await stripe.checkout.sessions.create(checkoutParameters(plan,origin),{idempotencyKey:`relystra-checkout-${plan.id}`});
    validateSession(session,plan,plan.checkout_account_id!);
    if (!plan.checkout_session_id) {
      const {error} = await db.rpc('relystra_bind_checkout',{p_plan_id:plan.id,p_session_id:session.id,p_url:session.url,
        p_account_id:plan.checkout_account_id,p_livemode:session.livemode,p_expires_at:new Date(session.expires_at*1000).toISOString()});
      if (error) throw new Error('CHECKOUT_BIND_FAILED');
    }
    if (cancel || session.status === 'expired') {
      if (session.status === 'complete') return json({status:'processing',message:'Payment is being verified. This plan cannot be cancelled.'},409);
      const expired = session.status === 'expired' ? session : await stripe.checkout.sessions.expire(session.id);
      if (expired.status !== 'expired') throw new Error('CHECKOUT_EXPIRE_FAILED');
      return await cancelPlan(session.id);
    }
    // Fulfillment is exclusively webhook-driven, including when Stripe reports a complete session here.
    return json({status:session.status === 'open' ? 'awaiting_payment' : 'processing',
      url:session.status === 'open' ? session.url : null,livemode:session.livemode});
  } catch {
    return json({error:'CHECKOUT_RETRY',message:'Checkout could not be updated. Your plan is saved; retry from the same plan.'},503);
  }
}
