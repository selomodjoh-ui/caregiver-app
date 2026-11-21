// Starts a Stripe payment page for a home, or opens Stripe's page for managing
// an existing subscription. Called by the app with the signed-in user's token.
// Needs the secret STRIPE_SECRET_KEY. Optional: SITE_URL.

const env = (name: string) => Deno.env.get(name) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
// The key is accepted under either name, since it was first saved as STRIPE_SECRET.
const STRIPE_KEY = env('STRIPE_SECRET_KEY') || env('STRIPE_SECRET');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
const SITE_URL = env('SITE_URL') || 'https://getshiftkind.com';
const ALLOWED_ORIGINS = [SITE_URL, 'https://www.getshiftkind.com', 'https://caregiver-app.selomodjoh.workers.dev'];

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : SITE_URL,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

/** Reads or writes our own database as the server. */
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
  // Inserts and updates answer with an empty body unless rows are asked for.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Stripe said ${res.status}`);
  return body;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Use POST.' });
  if (!STRIPE_KEY) {
    // Names only, never values: helps spot a secret saved under a slightly different name.
    const found = Object.keys(Deno.env.toObject()).filter((k) => /stripe|whsec|sk_/i.test(k));
    return reply(req, 503, { error: 'Card payments are not switched on yet.', secret_names_found: found });
  }

  try {
    // Who is asking? Supabase checks the token for us.
    const auth = req.headers.get('authorization') ?? '';
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: auth } });
    if (!who.ok) return reply(req, 401, { error: 'Please sign in again.' });
    const user = (await who.json()) as { id: string; email?: string };

    const { action, plan } = (await req.json().catch(() => ({}))) as { action?: string; plan?: string };
    const origin = ALLOWED_ORIGINS.includes(req.headers.get('origin') ?? '') ? req.headers.get('origin')! : SITE_URL;

    const homes = await db(`homes?owner_id=eq.${user.id}&select=owner_id,name`);
    if (homes.length === 0) return reply(req, 400, { error: 'Add your home details before choosing a package.' });

    const rows = await db(`billing?owner_id=eq.${user.id}&select=stripe_customer_id,stripe_subscription_id,status`);
    let customer: string | null = rows[0]?.stripe_customer_id ?? null;
    const live = ['active', 'trialing', 'past_due'].includes(rows[0]?.status ?? '');

    // Already subscribed, or asked for it: Stripe's own page for changing card, package or cancelling.
    if (action === 'portal' || (action === 'checkout' && live)) {
      if (!customer) return reply(req, 400, { error: 'There is no subscription to manage yet.' });
      const portal = await stripe('billing_portal/sessions', { customer, return_url: `${origin}/?billing=back` });
      return reply(req, 200, { url: portal.url });
    }

    if (action !== 'checkout') return reply(req, 400, { error: 'Unknown request.' });

    const plans = await db(`plans?id=eq.${encodeURIComponent(plan ?? '')}&select=id,name,stripe_price_id`);
    const price = plans[0]?.stripe_price_id;
    if (!price) return reply(req, 400, { error: 'That package cannot be bought by card yet.' });

    if (!customer) {
      const created = await stripe('customers', {
        ...(user.email ? { email: user.email } : {}),
        name: homes[0].name ?? '',
        'metadata[owner_id]': user.id,
      });
      customer = created.id as string;
      await db('billing?on_conflict=owner_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ owner_id: user.id, stripe_customer_id: customer }),
      });
    }

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][owner_id]': user.id,
      'subscription_data[metadata][plan]': plans[0].id,
      'metadata[owner_id]': user.id,
      'metadata[plan]': plans[0].id,
      allow_promotion_codes: 'true',
      success_url: `${origin}/?billing=paid`,
      cancel_url: `${origin}/?billing=cancelled`,
    });
    return reply(req, 200, { url: session.url });
  } catch (e) {
    console.error('billing error', e);
    return reply(req, 500, { error: 'We could not reach the payment service. Please try again in a moment.' });
  }
});
