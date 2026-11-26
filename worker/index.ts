// The website's server. Almost everything is a static file from dist/, served by
// Cloudflare directly. This Worker only runs first for the few public pages that
// show live data, so search engines and AI assistants (which mostly do not run
// JavaScript) read real prices and real open shifts as plain HTML:
//
//   /            the welcome page, with package prices filled in
//   /shifts/     the public board of open shifts (no home name or address)
//   /llms.txt    the plain-text summary for AI assistants, with prices
//   /sitemap.xml lists /shifts/ only once it has enough shifts to be worth indexing
//
// Data comes from Supabase with the public (publishable) key, through the
// public_open_shifts() function and the plans table (migration 0027).

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

interface Plan {
  id: string;
  name: string;
  price_usd: number | null;
}

interface PublicShift {
  shift_date: string;
  start_time: string;
  end_time: string;
  pay_rate: number | null;
  pay_type: string;
  spots: number;
  requirements: string[];
  town: string | null;
}

/** Below this many open shifts, /shifts/ is kept out of search results. */
const MIN_INDEXABLE_SHIFTS = 3;
const SITE = 'https://getshiftkind.com';

const REQUIREMENT_LABELS: Record<string, string> = {
  hca_cna: 'HCA or CNA',
  tb_test: 'TB test',
  cpr_first_aid: 'CPR / First Aid',
  nurse_delegation: 'Nurse delegation',
};

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

    // "/" with a query string is the app (?join, ?token_hash, ...): leave it alone.
    const route =
      url.pathname === '/' && !url.search ? 'home'
      : url.pathname === '/shifts/' ? 'shifts'
      : url.pathname === '/shifts' ? 'shifts-slash'
      : url.pathname === '/llms.txt' ? 'llms'
      : url.pathname === '/sitemap.xml' ? 'sitemap'
      : null;
    if (route === 'shifts-slash') return Response.redirect(`${url.origin}/shifts/`, 301);
    if (!route) return env.ASSETS.fetch(request);

    // Cache each page for 5 minutes at the edge, so most visits never reach Supabase.
    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(key);
    if (hit) return hit;

    let response: Response;
    try {
      response = await render(route, request, url, env);
    } catch {
      // If Supabase is unreachable, the static files still work (without live numbers).
      return route === 'shifts' ? shiftsUnavailable() : env.ASSETS.fetch(request);
    }
    response.headers.set('Cache-Control', 'public, max-age=300');
    ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};

async function render(route: 'home' | 'shifts' | 'llms' | 'sitemap', request: Request, url: URL, env: Env): Promise<Response> {
  if (route === 'shifts') return shiftsPage(await openShifts(env));

  if (route === 'sitemap') {
    const [asset, shifts] = await Promise.all([env.ASSETS.fetch(request), openShifts(env)]);
    let xml = await asset.text();
    if (shifts.length >= MIN_INDEXABLE_SHIFTS) {
      xml = xml.replace('</urlset>', `  <url><loc>${SITE}/shifts/</loc></url>\n</urlset>`);
    }
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }

  const plans = paidPlans(await fetchPlans(env));
  if (route === 'llms') {
    const text = await (await env.ASSETS.fetch(request)).text();
    const line = plans.length
      ? `- Adult family homes start with 14 days free, then ${plans.map((p) => `${p.name} at ${dollars(p.price_usd)} a month`).join(' or ')}.`
      : null;
    const out = line ? text.replace(/^- Adult family homes start with 14 days free.*$/m, line) : text;
    return new Response(out, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  // route === 'home'
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/`, request));
  if (!plans.length) return new Response(page.body, page);
  const sentence = `After that, ${plans.map((p) => `${p.name} is ${dollars(p.price_usd)} a month`).join(' and ')}.`;
  return new HTMLRewriter()
    .on('[data-prices]', { element: (el) => { el.setInnerContent(sentence); } })
    .on('head', { element: (el) => { el.append(offersJsonLd(plans), { html: true }); } })
    .transform(new Response(page.body, page));
}

async function supabase<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return (await res.json()) as T;
}

const fetchPlans = (env: Env) => supabase<Plan[]>(env, 'plans?select=id,name,price_usd&order=sort');
const openShifts = (env: Env) => supabase<PublicShift[]>(env, 'rpc/public_open_shifts', { method: 'POST', body: '{}' });

/** The packages a home pays for, once they have a price. */
function paidPlans(plans: Plan[]): Plan[] {
  return plans.filter((p) => p.price_usd != null && Number(p.price_usd) > 0);
}

function dollars(n: number | null): string {
  const v = Number(n);
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

function offersJsonLd(plans: Plan[]): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'ShiftKind for adult family homes',
    serviceType: 'Caregiver shift matching',
    provider: { '@id': `${SITE}/#org` },
    areaServed: { '@type': 'State', name: 'Washington' },
    offers: plans.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      price: Number(p.price_usd).toFixed(2),
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: Number(p.price_usd).toFixed(2),
        priceCurrency: 'USD',
        unitText: 'MONTH',
      },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

// ---------- /shifts/ ----------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function dateText(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function timeText(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

function payText(s: PublicShift): string {
  if (s.pay_rate == null) return 'Pay not listed';
  const rate = Number(s.pay_rate);
  if (s.pay_type === 'shift') return `${dollars(rate)} for the shift`;
  const total = rate * hoursBetween(s.start_time, s.end_time);
  return `${dollars(rate)}/hr (${dollars(Math.round(total * 100) / 100)} total)`;
}

function partOf(start: string): string {
  const h = Number(start.split(':')[0]);
  return h >= 6 && h < 18 ? 'Day shift' : 'Night shift';
}

export function shiftsPage(shifts: PublicShift[]): Response {
  const indexable = shifts.length >= MIN_INDEXABLE_SHIFTS;
  const towns = [...new Set(shifts.map((s) => s.town).filter((t): t is string => !!t))];
  const count = shifts.length;
  const countText = count === 1 ? '1 open shift' : `${count} open shifts`;
  const description = count
    ? `${countText} at licensed adult family homes in Washington${towns.length ? `, including ${towns.slice(0, 3).join(', ')}` : ''}. See the date, hours and pay, then apply for free.`
    : 'Open caregiver shifts at licensed adult family homes in Washington. See the date, hours and pay, then apply for free.';

  const rows = shifts
    .map((s) => {
      const needs = s.requirements.map((r) => REQUIREMENT_LABELS[r]).filter(Boolean);
      return `<li class="shift">
  <div class="when"><strong>${esc(dateText(s.shift_date))}</strong><span>${esc(timeText(s.start_time))} to ${esc(timeText(s.end_time))} · ${partOf(s.start_time)}</span></div>
  <div class="where">${esc(s.town ? `${s.town}, WA` : 'Washington')}</div>
  <div class="pay">${esc(payText(s))}</div>
  <div class="needs">${needs.length ? `Needs: ${esc(needs.join(', '))}` : 'No specific credentials listed'}${s.spots > 1 ? ` · ${s.spots} caregivers needed` : ''}</div>
  <a class="btn" href="/?join">Apply</a>
</li>`;
    })
    .join('\n');

  const body = count
    ? `<ol class="list">\n${rows}\n</ol>`
    : `<div class="empty"><h2>No open shifts right now</h2><p>New shifts are posted every week. Create a free account, mark the days and nights you are free, and homes can offer you a shift directly.</p><a class="btn" href="/?join">Create a free account</a></div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Caregiver Shifts at Adult Family Homes in Washington | ShiftKind</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}/shifts/">
${indexable ? '' : '<meta name="robots" content="noindex, follow">\n'}<meta name="theme-color" content="#1d3a6e">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<style>
:root { --emerald: #1d3a6e; --green: #2f6fb5; --sage: #e2e9f5; --ground: #f3f6fb; --surface: #fff; --ink: #14213d; --muted: #4d5a73; --line: #d3dcec; --coral-tint: #fdeed6; --coral-ink: #8a3a1c; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 400 18px/1.55 'Figtree', system-ui, sans-serif; }
a { color: var(--emerald); }
a:focus-visible { outline: 3px solid #f2b25c; outline-offset: 3px; border-radius: 6px; }
.wrap { max-width: 920px; margin: 0 auto; padding: 0 24px; }
header { border-bottom: 1px solid var(--line); background: var(--surface); }
header .wrap { display: flex; align-items: center; gap: 20px; min-height: 64px; }
.brand { font: 800 20px 'Plus Jakarta Sans', system-ui, sans-serif; color: var(--emerald); text-decoration: none; }
header .signin { margin-left: auto; font-weight: 600; }
h1 { font: 800 clamp(32px, 5vw, 48px)/1.08 'Plus Jakarta Sans', system-ui, sans-serif; color: var(--emerald); letter-spacing: -0.02em; margin: 48px 0 12px; }
h2 { font: 700 24px/1.25 'Plus Jakarta Sans', system-ui, sans-serif; color: var(--emerald); margin: 0 0 8px; }
.lead { color: var(--muted); max-width: 36em; margin: 0 0 32px; }
.list { list-style: none; margin: 0 0 48px; padding: 0; display: grid; gap: 14px; }
.shift { background: var(--surface); border: 1.5px solid var(--line); border-radius: 20px; padding: 20px 22px; display: grid; grid-template-columns: 1.3fr 1fr 1.2fr auto; gap: 6px 20px; align-items: center; }
.when strong { display: block; font-size: 19px; }
.when span, .needs { color: var(--muted); font-size: 16px; }
.where { font-weight: 600; }
.pay { font-weight: 700; color: var(--emerald); }
.needs { grid-column: 1 / 4; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 22px; border-radius: 14px; background: var(--emerald); color: #fff; font-weight: 700; text-decoration: none; }
.btn:hover { background: #1f4a85; }
.shift .btn { grid-column: 4; grid-row: 1 / 3; }
.empty { background: var(--surface); border: 1.5px solid var(--line); border-radius: 24px; padding: 32px; margin-bottom: 48px; display: grid; gap: 14px; justify-items: start; }
.empty p { color: var(--muted); margin: 0; }
.note { background: var(--coral-tint); color: var(--coral-ink); border-radius: 16px; padding: 16px 20px; font-size: 16px; margin-bottom: 48px; }
footer { border-top: 1px solid var(--line); padding: 28px 0 40px; color: var(--muted); font-size: 16px; }
footer a { margin-right: 16px; }
@media (max-width: 720px) {
  .shift { grid-template-columns: 1fr; }
  .needs, .shift .btn { grid-column: auto; grid-row: auto; }
  .shift .btn { justify-self: start; margin-top: 6px; }
}
</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">ShiftKind</a><a class="signin" href="/?signin">Sign in</a></div></header>
<main class="wrap">
  <h1>Open caregiver shifts in Washington</h1>
  <p class="lead">${count ? `${esc(countText)} at licensed adult family homes, with the hours and pay up front.` : 'Shifts at licensed adult family homes, with the hours and pay up front.'} Applying is free. You will need a free ShiftKind account so the home can see your credentials.</p>
  ${body}
  <p class="note">Sign in to see each home's name, details and recommendations before you apply. Homes hire and pay caregivers directly.</p>
</main>
<footer><div class="wrap"><a href="/">About ShiftKind</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="mailto:support@getshiftkind.com">support@getshiftkind.com</a></div></footer>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function shiftsUnavailable(): Response {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Open shifts | ShiftKind</title></head><body style="font:18px/1.55 system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 24px"><h1>Open shifts</h1><p>We could not load the shifts just now. Please try again in a minute, or <a href="/?join">create a free account</a> to see them in the app.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '60' } },
  );
}
