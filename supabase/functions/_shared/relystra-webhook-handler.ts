import {createClient} from 'jsr:@supabase/supabase-js@2';
import {verifiedPayment,type PaymentEvent} from './relystra-payments.ts';
import {signedStripeEvent,stripeForMode} from './relystra-stripe.ts';

export async function handleStripeWebhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed',{status:405});
  // Read the exact body bytes as text once; JSON parsing before signature verification changes signed content.
  const raw = await req.text();
  let event;
  try { event = await signedStripeEvent(raw,req.headers.get('stripe-signature') || ''); }
  catch { return new Response('Invalid signature',{status:400}); }
  if (!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) return new Response('Ignored',{status:200});
  const object = event.data.object as {id:string;metadata?:Record<string,string>};
  if (object.metadata?.application !== 'relystra') return new Response('Ignored',{status:200});
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const {data:plan,error} = await db.from('nexus_build_plans').select('*').eq('id',object.metadata.plan_id).single();
    if (error || !plan?.checkout_account_id) throw new Error('PLAN_NOT_FOUND');
    const stripe = await stripeForMode(event.livemode,plan.checkout_account_id);
    const session = await stripe.checkout.sessions.retrieve(object.id);
    const payment = verifiedPayment(event as PaymentEvent,session,plan,plan.checkout_account_id);
    if (!payment) return new Response('Awaiting settlement',{status:200});
    const {error:recordError} = await db.rpc('relystra_record_verified_payment',payment);
    if (recordError) throw new Error('PAYMENT_RECORD_FAILED');
    return new Response('Recorded',{status:200});
  } catch {
    // Non-2xx causes Stripe to retry; the transaction and provider reference make fulfillment idempotent.
    // Operational logs contain no payment payloads, client evidence, signatures or credentials.
    console.error('relystra_payment_verification_failed',{event_id:event.id});
    return new Response('Payment verification pending',{status:503});
  }
}
