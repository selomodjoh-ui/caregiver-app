// Tells the other person about a new message: a phone notification on every
// device they turned notifications on for, and an email (one per conversation
// every 15 minutes, so a busy chat does not flood an inbox).
// The app calls this right after it saves a message, with { message_id }.
// { action: "key" } returns the public key a phone needs to subscribe.
import webpush from 'npm:web-push@3.6.7';

const env = (name: string) => Deno.env.get(name) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
const RESEND_KEY = env('RESEND_API_KEY');
const SITE_URL = env('SITE_URL') || 'https://getshiftkind.com';
const FROM = env('NOTIFY_FROM') || 'ShiftKind <support@getshiftkind.com>';
const ALLOWED_ORIGINS = [SITE_URL, 'https://www.getshiftkind.com', 'https://caregiver-app.selomodjoh.workers.dev'];
const EMAIL_GAP_MINUTES = 15;

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

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...asServer, ...((init.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) throw new Error(`Database said ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

/** The key pair that signs phone notifications. Made once, then kept in the database. */
async function pushKeys(): Promise<{ public_key: string; private_key: string }> {
  let rows = await db('push_config?id=eq.1&select=public_key,private_key');
  if (rows.length === 0) {
    const made = webpush.generateVAPIDKeys();
    await db('push_config?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ id: 1, public_key: made.publicKey, private_key: made.privateKey }),
    });
    rows = await db('push_config?id=eq.1&select=public_key,private_key');
  }
  return rows[0];
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Use POST.' });

  try {
    const auth = req.headers.get('authorization') ?? '';
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: auth } });
    if (!who.ok) return reply(req, 401, { error: 'Please sign in again.' });
    const user = (await who.json()) as { id: string };
    if (!user?.id) return reply(req, 401, { error: 'Please sign in again.' });

    const body = (await req.json().catch(() => ({}))) as { action?: string; message_id?: string };

    if (body.action === 'key') {
      const keys = await pushKeys();
      return reply(req, 200, { publicKey: keys.public_key });
    }

    const id = String(body.message_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(req, 400, { error: 'Which message?' });

    const messages = await db(`messages?id=eq.${id}&select=id,shift_id,home_id,caregiver_id,sender_id,read_at`);
    const message = messages[0];
    // Only the person who wrote a message can announce it.
    if (!message || message.sender_id !== user.id) return reply(req, 403, { error: 'That is not your message.' });
    if (message.read_at) return reply(req, 200, { pushed: 0, emailed: false, note: 'already read' });

    let homeOwner = message.home_id as string | null;
    if (message.shift_id) {
      const shifts = await db(`shifts?id=eq.${message.shift_id}&select=home_id`);
      homeOwner = shifts[0]?.home_id ?? null;
    }
    const fromCaregiver = user.id === message.caregiver_id;
    const recipient = fromCaregiver ? homeOwner : (message.caregiver_id as string);
    if (!recipient || recipient === user.id) return reply(req, 200, { pushed: 0, emailed: false });

    let senderName = 'ShiftKind';
    if (fromCaregiver) {
      const p = await db(`profiles?id=eq.${user.id}&select=first_name,surname`);
      if (p[0]) senderName = `${p[0].first_name} ${String(p[0].surname ?? '').slice(0, 1)}.`.trim();
    } else {
      const h = await db(`homes?owner_id=eq.${user.id}&select=name`);
      if (h[0]?.name) senderName = h[0].name;
    }
    const link = `${SITE_URL}/?open=messages`;

    // 1. Phone notifications.
    let pushed = 0;
    const subs = await db(`push_subscriptions?user_id=eq.${recipient}&select=id,endpoint,p256dh,auth`);
    if (subs.length > 0) {
      const keys = await pushKeys();
      webpush.setVapidDetails('mailto:support@getshiftkind.com', keys.public_key, keys.private_key);
      const payload = JSON.stringify({
        title: `New message from ${senderName}`,
        body: 'Open ShiftKind to read and reply.',
        url: '/?open=messages',
      });
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 60 * 60 * 12 },
          );
          pushed += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The phone has turned notifications off or removed the app: forget the device.
          if (status === 404 || status === 410) await db(`push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' });
          else console.error('push failed', status, (err as Error).message);
        }
      }
    }

    // 2. Email, at most one per conversation every 15 minutes.
    let emailed = false;
    if (RESEND_KEY) {
      const threadKey = message.shift_id ? `shift:${message.shift_id}:${message.caregiver_id}` : `direct:${homeOwner}:${message.caregiver_id}`;
      const logs = await db(`notify_log?recipient_id=eq.${recipient}&thread_key=eq.${encodeURIComponent(threadKey)}&select=emailed_at`);
      const last = logs[0] ? new Date(logs[0].emailed_at).getTime() : 0;
      if (Date.now() - last > EMAIL_GAP_MINUTES * 60 * 1000) {
        const got = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${recipient}`, { headers: asServer });
        const to = got.ok ? ((await got.json()) as { email?: string }).email : undefined;
        if (to) {
          const name = escapeHtml(senderName);
          const sent = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: FROM,
              to: [to],
              subject: `New message from ${senderName} on ShiftKind`,
              text: `${senderName} sent you a message on ShiftKind.\n\nRead and reply here: ${link}\n\nYou are getting this because you have a ShiftKind account. Questions? support@getshiftkind.com`,
              html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#14213d;max-width:480px"><p style="font-size:20px;font-weight:bold;color:#1d3a6e;margin:0 0 12px">ShiftKind</p><p><strong>${name}</strong> sent you a message.</p><p style="margin:24px 0"><a href="${link}" style="background:#1d3a6e;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:bold;display:inline-block">Read and reply</a></p><p style="font-size:13px;color:#4d5a73">You are getting this because you have a ShiftKind account. Questions? support@getshiftkind.com</p></div>`,
            }),
          });
          if (sent.ok) {
            emailed = true;
            await db('notify_log?on_conflict=recipient_id,thread_key', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({ recipient_id: recipient, thread_key: threadKey, emailed_at: new Date().toISOString() }),
            });
          } else {
            console.error('email failed', sent.status, await sent.text());
          }
        }
      }
    }

    return reply(req, 200, { pushed, emailed });
  } catch (err) {
    console.error('notify failed', err);
    return reply(req, 500, { error: 'We could not send the notification.' });
  }
});
