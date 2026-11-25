// Deletes the signed-in person's ShiftKind account for good.
// In order: stop any card subscription, remove their uploaded credential files,
// then delete the login. Deleting the login removes everything else that
// belongs to them (profile, home, shifts, applications, messages, ratings).
// Called by the app with the signed-in user's token and { confirm: "DELETE" }.

const env = (name: string) => Deno.env.get(name) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const STRIPE_KEY = env('STRIPE_SECRET_KEY') || env('STRIPE_SECRET');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
const SITE_URL = env('SITE_URL') || 'https://getshiftkind.com';
// The last two are the Android and iPhone apps, which load from the phone itself.
const ALLOWED_ORIGINS = [
  SITE_URL,
  'https://www.getshiftkind.com',
  'https://caregiver-app.selomodjoh.workers.dev',
  'https://localhost',
  'capacitor://localhost',
];

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

const asServer = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

async function db(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: asServer });
  if (!res.ok) throw new Error(`Database said ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Use POST.' });

  try {
    const auth = req.headers.get('authorization') ?? '';
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: auth } });
    if (!who.ok) return reply(req, 401, { error: 'Please sign in again.' });
    const user = (await who.json()) as { id: string };
    if (!user?.id) return reply(req, 401, { error: 'Please sign in again.' });

    const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (confirm !== 'DELETE') return reply(req, 400, { error: 'Type DELETE to confirm.' });

    // The person who runs ShiftKind cannot remove themselves by accident.
    const admins = await db(`admins?user_id=eq.${user.id}&select=user_id`);
    if (admins.length > 0) {
      return reply(req, 403, { error: 'An admin account cannot be deleted here. Email support@getshiftkind.com.' });
    }

    // 1. Stop a card subscription so the home is not charged again.
    const bills = await db(`billing?owner_id=eq.${user.id}&select=stripe_subscription_id,status`);
    const sub = bills[0]?.stripe_subscription_id as string | undefined;
    if (sub && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(bills[0]?.status ?? '')) {
      if (!STRIPE_KEY) return reply(req, 503, { error: 'We could not stop your subscription. Email support@getshiftkind.com.' });
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${STRIPE_KEY}` },
      });
      // 404 means Stripe has already ended it.
      if (!res.ok && res.status !== 404) {
        return reply(req, 502, { error: 'We could not stop your subscription, so nothing was deleted. Email support@getshiftkind.com.' });
      }
    }

    // 2. Remove uploaded credential files.
    const creds = await db(`credentials?user_id=eq.${user.id}&select=file_path`);
    const paths = creds.map((c: { file_path: string | null }) => c.file_path).filter(Boolean);
    if (paths.length > 0) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/credentials`, {
        method: 'DELETE',
        headers: asServer,
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw new Error(`Storage said ${res.status}: ${await res.text()}`);
    }

    // Remove the profile picture, if there is one.
    const pic = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars`, {
      method: 'DELETE',
      headers: asServer,
      body: JSON.stringify({ prefixes: [`${user.id}/photo.jpg`] }),
    });
    if (!pic.ok) throw new Error(`Storage said ${pic.status}: ${await pic.text()}`);

    // 3. Delete the login. Everything else that belongs to this person goes with it.
    const gone = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: asServer });
    if (!gone.ok) throw new Error(`Auth said ${gone.status}: ${await gone.text()}`);

    return reply(req, 200, { deleted: true });
  } catch (err) {
    console.error('delete-account failed', err);
    return reply(req, 500, { error: 'Something went wrong and your account was not fully deleted. Email support@getshiftkind.com.' });
  }
});
