import { handleStripeWebhook } from '../_shared/relystra-webhook-handler.ts';
Deno.serve(handleStripeWebhook);
