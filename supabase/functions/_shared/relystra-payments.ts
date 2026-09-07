// Pure rules shared by the Edge handlers and executable payment tests. No secrets or I/O.
export type BuildPlan = {
  id: string; company_id: string; purchase_kind: 'diagnosis' | 'build_package'; name: string;
  items: Array<{name: string; price_cents: number; currency: string}>;
  total_cents: number; currency: string; snapshot_digest: string; status: string;
  created_by: string; checkout_session_id: string | null; checkout_url: string | null;
  checkout_started_at: string | null; checkout_expires_at: string | null;
  checkout_account_id: string | null; checkout_livemode: boolean | null; checkout_integration_id: string | null;
};
export type CheckoutSession = {
  id: string; mode: string | null; livemode: boolean; status: string | null; payment_status: string;
  amount_total: number | null; currency: string | null; client_reference_id: string | null;
  payment_intent: string | {id: string} | null; metadata: Record<string,string> | null;
  url: string | null; expires_at: number;
};
export type PaymentEvent = {id: string; type: string; livemode: boolean; account?: string; data: {object: {id: string}}};

export function checkoutParameters(plan: BuildPlan, portalOrigin: string) {
  const origin = new URL(portalOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== portalOrigin) throw new Error('PORTAL_ORIGIN_INVALID');
  if (!plan.checkout_expires_at || !plan.checkout_integration_id || !plan.checkout_account_id || typeof plan.checkout_livemode !== 'boolean') throw new Error('CHECKOUT_NOT_CLAIMED');
  if (!plan.items.length || plan.items.length > 25 || plan.items.some(i => !i.name || !Number.isSafeInteger(i.price_cents) || i.price_cents <= 0 || i.currency !== plan.currency)
    || plan.items.reduce((n,i) => n+i.price_cents,0) !== plan.total_cents) throw new Error('PLAN_TOTAL_INVALID');
  const metadata = {application:'relystra',plan_id:plan.id,company_id:plan.company_id,purchase_kind:plan.purchase_kind,
    scope_digest:plan.snapshot_digest,account_id:plan.checkout_account_id};
  const route = `${portalOrigin}/portal?company=${encodeURIComponent(plan.company_id)}&plan=${encodeURIComponent(plan.id)}`;
  return {
    mode:'payment' as const,ui_mode:'hosted' as const,client_reference_id:plan.id,
    integration_identifier:plan.checkout_integration_id,metadata,payment_intent_data:{metadata},
    expires_at:Math.floor(Date.parse(plan.checkout_expires_at)/1000),
    success_url:`${route}&payment=return`,cancel_url:`${route}&payment=cancelled`,
    adaptive_pricing:{enabled:false},
    line_items:plan.items.map(item => ({quantity:1,price_data:{currency:plan.currency,unit_amount:item.price_cents,
      product_data:{name:item.name.slice(0,250)}}})),
  };
}

export function validateSession(session: CheckoutSession, plan: BuildPlan, accountId: string) {
  const metadata = session.metadata || {};
  if (metadata.application !== 'relystra' || metadata.plan_id !== plan.id || metadata.company_id !== plan.company_id
    || metadata.purchase_kind !== plan.purchase_kind || metadata.scope_digest !== plan.snapshot_digest
    || metadata.account_id !== accountId || plan.checkout_account_id !== accountId || session.client_reference_id !== plan.id
    || session.mode !== 'payment' || session.livemode !== plan.checkout_livemode
    || session.amount_total !== plan.total_cents || session.currency !== plan.currency
    || session.expires_at !== Math.floor(Date.parse(plan.checkout_expires_at || '')/1000)
    || (plan.checkout_session_id && session.id !== plan.checkout_session_id)) throw new Error('CHECKOUT_MISMATCH');
}

export function verifiedPayment(event: PaymentEvent, session: CheckoutSession, plan: BuildPlan, accountId: string) {
  if (!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) return null;
  validateSession(session,plan,accountId);
  if (!event.id || event.data.object.id !== session.id || event.livemode !== plan.checkout_livemode
    || (event.account && event.account !== accountId) || !plan.checkout_session_id) throw new Error('PAYMENT_EVENT_MISMATCH');
  // A completed Checkout can still await settlement from an asynchronous payment method.
  if (session.payment_status !== 'paid') return null;
  if (session.status !== 'complete') throw new Error('PAYMENT_NOT_COMPLETE');
  const reference = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!reference) throw new Error('PAYMENT_REFERENCE_MISSING');
  return {p_plan_id:plan.id,p_event_id:event.id,p_session_id:session.id,p_payment_reference:reference,
    p_amount_cents:plan.total_cents,p_currency:plan.currency,p_livemode:session.livemode,
    p_snapshot_digest:plan.snapshot_digest,p_account_id:accountId};
}
