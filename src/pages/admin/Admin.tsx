import { useEffect, useState, type ReactNode } from 'react';
import { messageOf, supabase } from '../../lib/supabase';
import { CREDENTIAL_LABELS, formatDate, formatTime, payText, todayText } from '../../lib/types';
import Band from '../../components/Band';

type Section = 'overview' | 'credentials' | 'homes' | 'people' | 'shifts' | 'packages';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'homes', label: 'Homes' },
  { id: 'people', label: 'People' },
  { id: 'shifts', label: 'Shifts' },
  { id: 'packages', label: 'Prices' },
];

interface Overview {
  caregivers: number;
  providers: number;
  homes: number;
  new_accounts_7d: number;
  unconfirmed_accounts: number;
  credentials_waiting: number;
  credentials_expiring: number;
  homes_unverified: number;
  package_requests: number;
  packages_ending: number;
  packages_ended: number;
  shifts_open: number;
  shifts_filled: number;
  shifts_unfilled_past: number;
  applications: number;
  messages: number;
  ratings: number;
  average_rating: number | null;
}

interface CredentialRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  kind: string;
  credential_number: string | null;
  expires_on: string | null;
  file_path: string | null;
  status: 'in_review' | 'verified';
  updated_at: string;
}

interface HomeRow {
  owner_id: string;
  name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  license_number: string | null;
  license_verified: boolean;
  years_operating: number | null;
  residents: number;
  plan: string;
  plan_until: string | null;
  requested_plan: string | null;
  shifts_posted: number;
  shifts_filled: number;
  rating: number | null;
  ratings: number;
}

interface PersonRow {
  id: string;
  role: 'caregiver' | 'provider' | 'none';
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  confirmed: boolean;
  last_sign_in_at: string | null;
  credentials: number;
  shifts_worked: number;
  rating: number | null;
}

interface ShiftRow {
  id: string;
  home: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  pay_rate: number | null;
  pay_type: 'hour' | 'shift';
  status: 'open' | 'filled' | 'cancelled';
  spots: number;
  accepted: number;
  waiting: number;
}

interface PlanRow {
  id: string;
  name: string;
  price_usd: number | null;
  blurb: string;
}

const PLAN_NAMES: Record<string, string> = { pilot: 'Founding pilot', standard: 'Standard', plus: 'Plus' };
const day = (stamp: string | null) =>
  stamp ? new Date(stamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

function addMonths(from: string | null, months: number): string {
  const today = todayText();
  const start = from && from > today ? from : today;
  const [y, m, d] = start.split('-').map(Number);
  const t = new Date(y, m - 1 + months, d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

interface Props {
  onClose: () => void;
}

export default function Admin({ onClose }: Props) {
  const [section, setSection] = useState<Section>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [credentials, setCredentials] = useState<CredentialRow[] | null>(null);
  const [homes, setHomes] = useState<HomeRow[] | null>(null);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [credFilter, setCredFilter] = useState<'waiting' | 'verified' | 'all'>('waiting');
  const [peopleFilter, setPeopleFilter] = useState<'all' | 'caregiver' | 'provider' | 'unconfirmed'>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // The admin screen uses the full width of a computer screen.
  useEffect(() => {
    document.body.classList.add('wide');
    return () => document.body.classList.remove('wide');
  }, []);

  async function read<T>(fn: string, set: (value: T) => void) {
    if (!supabase) return;
    const { data, error: err } = await supabase.rpc(fn);
    if (err) setError(err.message);
    else set(data as T);
  }

  async function load(which: Section) {
    setError('');
    try {
      if (which === 'overview') await read<Overview>('admin_overview', setOverview);
      if (which === 'credentials') await read<CredentialRow[]>('admin_credentials', setCredentials);
      if (which === 'homes') await read<HomeRow[]>('admin_homes', setHomes);
      if (which === 'people') await read<PersonRow[]>('admin_people', setPeople);
      if (which === 'shifts') await read<ShiftRow[]>('admin_shifts', setShifts);
      if (which === 'packages' && supabase) {
        const { data, error: err } = await supabase.from('plans').select('id, name, price_usd, blurb').order('sort');
        if (err) setError(err.message);
        else setPlans((data ?? []) as PlanRow[]);
      }
    } catch (e) {
      setError(messageOf(e));
    }
  }

  useEffect(() => {
    setQuery('');
    load(section);
  }, [section]);

  async function act(fn: string, args: Record<string, unknown>, done: string, reload: Section) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc(fn, args);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice(done);
    window.setTimeout(() => setNotice(''), 2500);
    load(reload);
  }

  async function viewFile(path: string) {
    if (!supabase) return;
    const { data, error: err } = await supabase.storage.from('credentials').createSignedUrl(path, 120);
    if (err || !data) setError(err?.message ?? 'Could not open the document.');
    else window.open(data.signedUrl, '_blank', 'noopener');
  }

  function go(to: Section, then?: () => void) {
    setSection(to);
    then?.();
    window.scrollTo(0, 0);
  }

  const words = query.trim().toLowerCase();
  const matches = (...fields: (string | null)[]) => !words || fields.some((f) => (f ?? '').toLowerCase().includes(words));

  return (
    <>
      <Band title="Admin" lead="Everything that keeps ShiftKind running.">
        <button type="button" className="btn small secondary back" onClick={onClose}>
          Back to the app
        </button>
      </Band>
      <main className="content admin">
        <nav className="filters" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? 'on' : ''}
              aria-current={section === s.id ? 'page' : undefined}
              onClick={() => go(s.id)}
            >
              {s.label}
              {s.id === 'credentials' && overview && overview.credentials_waiting > 0 && (
                <span className="badge">{overview.credentials_waiting}</span>
              )}
              {s.id === 'homes' && overview && overview.homes_unverified + overview.package_requests > 0 && (
                <span className="badge">{overview.homes_unverified + overview.package_requests}</span>
              )}
            </button>
          ))}
        </nav>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {section === 'overview' &&
          (overview ? (
            <OverviewView
              o={overview}
              toCredentials={() => go('credentials', () => setCredFilter('waiting'))}
              toHomes={() => go('homes')}
              toPeople={() => go('people', () => setPeopleFilter('unconfirmed'))}
              toShifts={() => go('shifts')}
            />
          ) : (
            <p className="hint">Loading…</p>
          ))}

        {section === 'credentials' && (
          <section className="section">
            <h2>Credentials</h2>
            <p className="hint">
              Open the document, check the number against the state record, then mark it verified. Caregivers and
              homes see the result straight away.
            </p>
            <div className="filters" role="group" aria-label="Show">
              {(['waiting', 'verified', 'all'] as const).map((f) => (
                <button key={f} type="button" className={credFilter === f ? 'on' : ''} aria-pressed={credFilter === f} onClick={() => setCredFilter(f)}>
                  {f === 'waiting' ? 'Waiting for review' : f === 'verified' ? 'Verified' : 'All'}
                </button>
              ))}
            </div>
            <Search value={query} onChange={setQuery} label="Find by name or email" />
            {!credentials ? (
              <p className="hint">Loading…</p>
            ) : (
              <CardList
                empty={credFilter === 'waiting' ? 'Nothing is waiting for review.' : 'No credentials match.'}
                items={credentials
                  .filter((c) => credFilter === 'all' || (credFilter === 'waiting') === (c.status === 'in_review'))
                  .filter((c) => matches(c.name, c.email))
                  .map((c) => {
                    const expired = !!c.expires_on && c.expires_on < todayText();
                    return (
                      <li key={c.id}>
                        <div className="applicant">
                          <div className="list-main">
                            <span className="list-title">{CREDENTIAL_LABELS[c.kind] ?? c.kind}</span>
                            <span>
                              {c.name} · <a href={`mailto:${c.email}`}>{c.email}</a>
                              {c.phone && ` · ${c.phone}`}
                            </span>
                            <span className="chips">
                              <span className={`chip ${c.status === 'verified' ? 'ok' : 'warn'}`}>
                                {c.status === 'verified' ? 'Verified' : 'Waiting for review'}
                              </span>
                              {c.credential_number && <span className="chip">Number: {c.credential_number}</span>}
                              <span className={`chip ${expired ? 'bad' : ''}`}>
                                {c.expires_on ? `${expired ? 'Expired' : 'Expires'} ${formatDate(c.expires_on)}` : 'No expiry date given'}
                              </span>
                              <span className="chip">Updated {day(c.updated_at)}</span>
                            </span>
                          </div>
                          <div className="actions">
                            {c.file_path ? (
                              <button type="button" className="btn small secondary" onClick={() => viewFile(c.file_path!)}>
                                View document
                              </button>
                            ) : (
                              <span className="chip bad">No document uploaded</span>
                            )}
                            {c.status === 'in_review' ? (
                              <button type="button" className="btn small" disabled={busy} onClick={() => act('admin_review_credential', { target: c.id, verified: true }, 'Marked as verified', 'credentials')}>
                                Mark verified
                              </button>
                            ) : (
                              <button type="button" className="btn small secondary" disabled={busy} onClick={() => act('admin_review_credential', { target: c.id, verified: false }, 'Verification removed', 'credentials')}>
                                Remove verification
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
              />
            )}
          </section>
        )}

        {section === 'homes' && (
          <section className="section">
            <h2>Homes</h2>
            <p className="hint">Check each licence against the state record, and set the package once a home has paid.</p>
            <Search value={query} onChange={setQuery} label="Find by home, owner or email" />
            {!homes ? (
              <p className="hint">Loading…</p>
            ) : (
              <CardList
                empty="No homes yet."
                items={homes.filter((h) => matches(h.name, h.owner_name, h.email)).map((h) => (
                  <HomeCard key={h.owner_id} h={h} busy={busy} act={act} />
                ))}
              />
            )}
          </section>
        )}

        {section === 'people' && (
          <section className="section">
            <h2>People</h2>
            <div className="filters" role="group" aria-label="Show">
              {(['all', 'caregiver', 'provider', 'unconfirmed'] as const).map((f) => (
                <button key={f} type="button" className={peopleFilter === f ? 'on' : ''} aria-pressed={peopleFilter === f} onClick={() => setPeopleFilter(f)}>
                  {f === 'all' ? 'Everyone' : f === 'caregiver' ? 'Caregivers' : f === 'provider' ? 'Providers' : 'Email not confirmed'}
                </button>
              ))}
            </div>
            <Search value={query} onChange={setQuery} label="Find by name, email or phone" />
            {!people ? (
              <p className="hint">Loading…</p>
            ) : (
              <CardList
                empty="Nobody matches."
                items={people
                  .filter((p) => peopleFilter === 'all' || (peopleFilter === 'unconfirmed' ? !p.confirmed : p.role === peopleFilter))
                  .filter((p) => matches(p.name, p.email, p.phone))
                  .map((p) => (
                    <li key={p.id}>
                      <div className="applicant">
                        <div className="list-main">
                          <span className="list-title">{p.name}</span>
                          <span>
                            <a href={`mailto:${p.email}`}>{p.email}</a>
                            {p.phone && ` · ${p.phone}`}
                          </span>
                          <span className="chips">
                            <span className="chip ok">{p.role === 'provider' ? 'Provider' : p.role === 'caregiver' ? 'Caregiver' : 'No profile'}</span>
                            {!p.confirmed && <span className="chip bad">Email not confirmed, cannot sign in</span>}
                            <span className="chip">Joined {day(p.created_at)}</span>
                            <span className="chip">Last sign-in: {day(p.last_sign_in_at)}</span>
                            {p.role === 'caregiver' && <span className="chip">{p.credentials} credentials</span>}
                            {p.role === 'caregiver' && <span className="chip">{p.shifts_worked} shifts accepted</span>}
                            {p.rating != null && <span className="chip">Rated {Number(p.rating).toFixed(1)}</span>}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
              />
            )}
          </section>
        )}

        {section === 'shifts' && (
          <section className="section">
            <h2>Shifts</h2>
            <p className="hint">Every shift from the last 60 days onward, newest first.</p>
            <Search value={query} onChange={setQuery} label="Find by home" />
            {!shifts ? (
              <p className="hint">Loading…</p>
            ) : (
              <CardList
                empty="No shifts yet."
                items={shifts.filter((s) => matches(s.home)).map((s) => {
                  const past = s.shift_date < todayText();
                  return (
                    <li key={s.id}>
                      <div className="applicant">
                        <div className="list-main">
                          <span className="list-title">
                            {formatDate(s.shift_date)}, {formatTime(s.start_time)} to {formatTime(s.end_time)}
                          </span>
                          <span>{s.home}</span>
                          <span className="chips">
                            <span className={`chip ${s.status === 'filled' ? 'ok' : s.status === 'cancelled' || past ? 'bad' : 'warn'}`}>
                              {s.status === 'filled' ? 'Filled' : s.status === 'cancelled' ? 'Cancelled' : past ? 'Never filled' : 'Open'}
                            </span>
                            <span className="chip">
                              {s.accepted} of {s.spots} caregivers found
                            </span>
                            {s.waiting > 0 && <span className="chip">{s.waiting} waiting for an answer</span>}
                            {s.pay_rate != null && <span className="chip">{payText(s)}</span>}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              />
            )}
          </section>
        )}

        {section === 'packages' && (
          <section className="section">
            <h2>Prices</h2>
            <p className="hint">The monthly price homes see for each package. Leave a price empty to show "Price on request".</p>
            {!plans ? (
              <p className="hint">Loading…</p>
            ) : (
              <ul className="list">
                {plans.map((plan) => (
                  <PriceRow key={plan.id} plan={plan} busy={busy} act={act} />
                ))}
              </ul>
            )}
          </section>
        )}

        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </main>
    </>
  );
}

function Search({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="field">
      <label htmlFor="admin-search">{label}</label>
      <input id="admin-search" type="search" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CardList({ items, empty }: { items: ReactNode[]; empty: string }) {
  if (items.length === 0) return <p className="hint">{empty}</p>;
  return (
    <>
      <p className="hint" role="status">
        Showing {items.length}.
      </p>
      <ul className="list grid">{items}</ul>
    </>
  );
}

function OverviewView({ o, toCredentials, toHomes, toPeople, toShifts }: { o: Overview; toCredentials: () => void; toHomes: () => void; toPeople: () => void; toShifts: () => void }) {
  const todo: { count: number; text: string; button: string; go: () => void }[] = [
    { count: o.credentials_waiting, text: 'credentials waiting for your review', button: 'Review', go: toCredentials },
    { count: o.homes_unverified, text: 'homes with a licence not yet verified', button: 'Check', go: toHomes },
    { count: o.package_requests, text: 'homes asking for a package', button: 'Open', go: toHomes },
    { count: o.packages_ending, text: 'packages ending within 7 days', button: 'Open', go: toHomes },
    { count: o.packages_ended, text: 'homes whose package has ended', button: 'Open', go: toHomes },
    { count: o.unconfirmed_accounts, text: 'accounts that cannot sign in because the email is not confirmed', button: 'See', go: toPeople },
    { count: o.shifts_unfilled_past, text: 'past shifts that were never filled', button: 'See', go: toShifts },
  ].filter((t) => t.count > 0);

  const tiles: [string | number, string][] = [
    [o.caregivers, 'caregivers'],
    [o.providers, 'providers'],
    [o.homes, 'homes set up'],
    [o.new_accounts_7d, 'new accounts, last 7 days'],
    [o.shifts_open, 'open shifts'],
    [o.shifts_filled, 'shifts filled'],
    [o.applications, 'applications and offers'],
    [o.messages, 'messages sent'],
    [o.average_rating != null ? `${Number(o.average_rating).toFixed(1)} of 5` : 'None yet', `average rating, from ${o.ratings}`],
    [o.credentials_expiring, 'credentials expiring in 30 days'],
  ];

  return (
    <>
      <section className="section">
        <h2>Needs your attention</h2>
        {todo.length === 0 ? (
          <p className="quote">Nothing is waiting for you. Everything is up to date.</p>
        ) : (
          <ul className="list">
            {todo.map((t) => (
              <li key={t.text}>
                <div className="list-row">
                  <span className="count">{t.count}</span>
                  <span className="list-main">{t.text}</span>
                  <button type="button" className="btn small" onClick={t.go}>
                    {t.button}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="section">
        <h2>At a glance</h2>
        <div className="stats wide-grid">
          {tiles.map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

type Act = (fn: string, args: Record<string, unknown>, done: string, reload: Section) => void;

function HomeCard({ h, busy, act }: { h: HomeRow; busy: boolean; act: Act }) {
  const [plan, setPlan] = useState(h.requested_plan ?? h.plan);
  const [until, setUntil] = useState(h.plan_until ?? '');
  const ended = !!h.plan_until && h.plan_until < todayText();

  return (
    <li>
      <div className="applicant">
        <div className="list-main">
          <span className="list-title">{h.name}</span>
          <span>
            {h.owner_name} · <a href={`mailto:${h.email}`}>{h.email}</a>
            {h.phone && ` · ${h.phone}`}
          </span>
          {h.address && <span className="hint">{h.address}</span>}
          <span className="chips">
            <span className={`chip ${h.license_verified ? 'ok' : 'warn'}`}>
              {h.license_verified ? 'Licence verified' : 'Licence not verified'}
            </span>
            <span className="chip">Licence: {h.license_number ?? 'not given'}</span>
            <span className="chip">{h.residents} residents</span>
            <span className="chip">
              {h.shifts_filled} of {h.shifts_posted} shifts filled
            </span>
            {h.rating != null && (
              <span className="chip">
                Rated {Number(h.rating).toFixed(1)} from {h.ratings}
              </span>
            )}
          </span>
        </div>
        <div className="actions">
          <button
            type="button"
            className={`btn small ${h.license_verified ? 'secondary' : ''}`}
            disabled={busy}
            onClick={() =>
              act('admin_verify_home', { target: h.owner_id, verified: !h.license_verified }, h.license_verified ? 'Verification removed' : 'Licence verified', 'homes')
            }
          >
            {h.license_verified ? 'Remove verification' : 'Mark licence verified'}
          </button>
        </div>

        <div className="package-box">
          <span className="chips">
            <span className={`chip ${ended ? 'bad' : 'ok'}`}>
              {PLAN_NAMES[h.plan] ?? h.plan}
              {h.plan_until ? `, ${ended ? 'ended' : 'until'} ${formatDate(h.plan_until)}` : ', no end date'}
            </span>
            {h.requested_plan && <span className="chip warn">Asked for {PLAN_NAMES[h.requested_plan] ?? h.requested_plan}</span>}
          </span>
          <div className="row">
            <div className="field">
              <label htmlFor={`pl-${h.owner_id}`}>Package</label>
              <select id={`pl-${h.owner_id}`} value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="pilot">Founding pilot</option>
                <option value="standard">Standard</option>
                <option value="plus">Plus</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`un-${h.owner_id}`}>Paid until</label>
              <input id={`un-${h.owner_id}`} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn small secondary" onClick={() => setUntil(addMonths(h.plan_until, 1))}>
              Add 1 month
            </button>
            <button type="button" className="btn small secondary" onClick={() => setUntil(addMonths(h.plan_until, 12))}>
              Add 1 year
            </button>
            <button
              type="button"
              className="btn small"
              disabled={busy}
              onClick={() => act('admin_set_plan', { target: h.owner_id, new_plan: plan, until: until || null }, 'Package saved', 'homes')}
            >
              Save package
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function PriceRow({ plan, busy, act }: { plan: PlanRow; busy: boolean; act: Act }) {
  const [price, setPrice] = useState(plan.price_usd != null ? String(plan.price_usd) : '');
  return (
    <li>
      <div className="applicant">
        <div className="list-main">
          <span className="list-title">{plan.name}</span>
          <span className="hint">{plan.blurb}</span>
        </div>
        <div className="row price-row">
          <div className="field">
            <label htmlFor={`pr-${plan.id}`}>Price per month (USD)</label>
            <input id={`pr-${plan.id}`} type="number" min="0" step="1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => act('admin_set_price', { plan_id: plan.id, price: price === '' ? null : Number(price) }, 'Price saved', 'packages')}
          >
            Save price
          </button>
        </div>
      </div>
    </li>
  );
}
