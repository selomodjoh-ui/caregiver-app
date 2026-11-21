// Stripe calls this address whenever a subscription starts, renews, changes or
// ends. It is the only thing that switches a home's paid package on or off.
// Needs the secrets STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.

const env = (name: string) => Deno.env.get(name) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
// The key is accepted under either name, since it was first saved as STRIPE_SECRET.
const STRIPE_KEY = env('STRIPE_SECRET_KEY') || env('STRIPE_SECRET');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');

/** Extra days a home keeps its package after a period ends, while Stripe retries a failed card. */
const GRACE_DAYS = 3;

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Database said ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Stripe said ${res.status}`);
  return body;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Proves the message really came from Stripe, using the shared signing secret. */
async function genuine(body: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sent = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || sent.length === 0 || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  return sent.some((s) => {
    if (s.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

// deno-lint-ignore no-explicit-any
async function applySubscription(sub: any) {
  let owner: string | undefined = sub.metadata?.owner_id;
  if (!owner) {
    const known = await db(`billing?stripe_customer_id=eq.${encodeURIComponent(sub.customer)}&select=owner_id`);
    owner = known[0]?.owner_id;
  }
  if (!owner) {
    console.warn('subscription with no known home', sub.id);
    return;
  }

  const item = sub.items?.data?.[0];
  const priceId: string | undefined = item?.price?.id;
  // Newer Stripe versions put the period on the item, older ones on the subscription.
  const periodEnd: number | undefined = item?.current_period_end ?? sub.current_period_end;
  const plans = priceId ? await db(`plans?stripe_price_id=eq.${encodeURIComponent(priceId)}&select=id`) : [];
  const plan: string | undefined = plans[0]?.id ?? sub.metadata?.plan;

  await db('billing?on_conflict=owner_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      owner_id: owner,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      plan: plan ?? null,
      status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }),
  });

  const paying = ['active', 'trialing', 'past_due'].includes(sub.status);
  if (paying && plan && periodEnd) {
    await db(`homes?owner_id=eq.${owner}`, {
      method: 'PATCH',
      body: JSON.stringify({ plan, plan_until: day(periodEnd + GRACE_DAYS * 86400), requested_plan: null }),
    });
  } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
    // Ended. The package stops yesterday, unless an administrator has since set a different one by hand.
    const yesterday = day(Date.now() / 1000 - 86400);
    await db(`homes?owner_id=eq.${owner}${plan ? `&plan=eq.${plan}` : ''}`, {
      method: 'PATCH',
      body: JSON.stringify({ plan_until: yesterday }),
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 });
  const body = await req.text();
  if (!(await genuine(body, req.headers.get('stripe-signature') ?? '', env('STRIPE_WEBHOOK_SECRET')))) {
    return new Response('Signature check failed.', { status: 400 });
  }

  try {
    const event = JSON.parse(body);
    const object = event.data?.object ?? {};
    if (String(event.type).startsWith('customer.subscription.')) {
      // Read the subscription fresh, so events that arrive out of order cannot leave old data behind.
      await applySubscription(await stripeGet(`subscriptions/${object.id}`));
    } else if (event.type === 'checkout.session.completed' && object.subscription) {
      await applySubscription(await stripeGet(`subscriptions/${object.subscription}`));
    } else if ((event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') && (object.subscription ?? object.parent?.subscription_details?.subscription)) {
      await applySubscription(await stripeGet(`subscriptions/${object.subscription ?? object.parent.subscription_details.subscription}`));
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('webhook error', e);
    // A failure tells Stripe to send the event again later.
    return new Response('Could not process this event.', { status: 500 });
  }
});
