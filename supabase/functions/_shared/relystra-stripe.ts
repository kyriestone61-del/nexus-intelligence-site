import Stripe from 'npm:stripe@22.6.1';

export {Stripe};
export const apiVersion = '2026-08-26.dahlia';

export async function stripeForMode(livemode: boolean, expectedAccountId: string) {
  const mode = livemode ? 'LIVE' : 'TEST';
  const key = Deno.env.get(`RELYSTRA_STRIPE_${mode}_SECRET_KEY`) || '';
  const configuredAccount = Deno.env.get('RELYSTRA_STRIPE_ACCOUNT_ID');
  if (!configuredAccount || configuredAccount !== expectedAccountId || !new RegExp(`^(sk|rk)_${livemode?'live':'test'}_`).test(key)) throw new Error('STRIPE_CONFIGURATION_MISMATCH');
  const stripe = new Stripe(key,{apiVersion,httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:2,timeout:15000});
  const account = await stripe.accounts.retrieve(null);
  if (account.id !== expectedAccountId) throw new Error('STRIPE_ACCOUNT_MISMATCH');
  return stripe;
}

export async function signedStripeEvent(raw: string, signature: string) {
  // Separate endpoint signing secrets permit in-flight test payments to settle after live checkout is enabled.
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  for (const livemode of [false,true]) {
    const secret = Deno.env.get(`RELYSTRA_STRIPE_${livemode?'LIVE':'TEST'}_WEBHOOK_SECRET`);
    if (!secret) continue;
    const stripe = new Stripe('sk_test_signature_verification_only',{apiVersion,httpClient:Stripe.createFetchHttpClient()});
    try {
      const event = await stripe.webhooks.constructEventAsync(raw,signature,secret,300,cryptoProvider);
      if (event.livemode !== livemode) throw new Error('SIGNATURE_MODE_MISMATCH');
      return event;
    } catch { /* Never include payloads, signatures or secrets in errors. */ }
  }
  throw new Error('INVALID_STRIPE_SIGNATURE');
}
