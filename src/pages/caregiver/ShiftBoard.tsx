import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { RatingForm, RatingLine, type RatingSummary } from '../../components/Rating';
import {
  CREDENTIAL_LABELS,
  careMix,
  dayOf,
  daysAgoText,
  isFeatured,
  isCurrent,
  partOf,
  payForShift,
  payText,
  hoursBetween,
  shiftTitle,
  todayText,
  type Application,
  type ApplicationStatus,
  type Shift,
  type Thread,
} from '../../lib/types';

const money = (n: number) => `$${n.toFixed(2)}`;
const hoursLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'hour' : 'hours'}`;

interface Props {
  userId: string;
  onOpenThread: (thread: Thread) => void;
}

interface MyCredential {
  kind: string;
  expires_on: string | null;
}

export default function ShiftBoard({ userId, onOpenThread }: Props) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [free, setFree] = useState<Set<string>>(new Set());
  const [credentials, setCredentials] = useState<MyCredential[]>([]);
  const [summaries, setSummaries] = useState<RatingSummary[]>([]);
  const [rated, setRated] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!supabase) return;
    const [s, a, f, c, r, g] = await Promise.all([
      supabase
        .from('shifts')
        .select('*, homes(*)')
        .gte('shift_date', daysAgoText(60))
        .in('status', ['open', 'filled'])
        .order('shift_date')
        .order('start_time'),
      supabase.from('applications').select('id, shift_id, caregiver_id, status').eq('caregiver_id', userId),
      supabase.from('availability').select('day, part').eq('user_id', userId),
      supabase.from('credentials').select('kind, expires_on').eq('user_id', userId),
      supabase.from('rating_summary').select('ratee_id, average, total'),
      supabase.from('ratings').select('shift_id').eq('rater_id', userId),
    ]);
    const firstError = s.error ?? a.error ?? f.error ?? c.error;
    if (firstError) setError(firstError.message);
    setShifts((s.data ?? []) as Shift[]);
    setApplications((a.data ?? []) as Application[]);
    setFree(new Set((f.data ?? []).map((r) => `${r.day}-${r.part}`)));
    setCredentials((c.data ?? []) as MyCredential[]);
    setSummaries((r.data ?? []) as RatingSummary[]);
    setRated(new Set((g.data ?? []).map((x) => x.shift_id as string)));
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  const appFor = (shiftId: string) => applications.find((a) => a.shift_id === shiftId);
  const fits = (shift: Shift) => free.has(`${dayOf(shift.shift_date)}-${partOf(shift.start_time)}`);
  const has = (kind: string) => isCurrent(credentials.find((c) => c.kind === kind));

  async function apply(shift: Shift) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const existing = appFor(shift.id);
    const { error: err } = existing
      ? await supabase.from('applications').update({ status: 'applied' }).eq('id', existing.id)
      : await supabase.from('applications').insert({ shift_id: shift.id, caregiver_id: userId, status: 'applied' });
    setBusy(false);
    if (err) setError(err.message);
    load();
  }

  async function setStatus(app: Application, status: ApplicationStatus) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('applications').update({ status }).eq('id', app.id);
    setBusy(false);
    if (err) setError(err.message);
    load();
  }

  function message(shift: Shift) {
    onOpenThread({
      shiftId: shift.id,
      caregiverId: userId,
      title: shift.homes?.name ?? 'The home',
      subtitle: shiftTitle(shift),
    });
  }

  const today = todayText();
  const upcoming = shifts.filter((s) => s.shift_date >= today);
  const offers = upcoming.filter((s) => appFor(s.id)?.status === 'offered' && s.status === 'open');
  const mine = upcoming.filter((s) => appFor(s.id)?.status === 'accepted');
  const past = shifts
    .filter((s) => s.shift_date < today && appFor(s.id)?.status === 'accepted')
    .reverse();
  const open = upcoming
    .filter((s) => s.status === 'open' && !offers.includes(s) && !mine.includes(s))
    .sort(
      (a, b) =>
        Number(fits(b)) - Number(fits(a)) || Number(isFeatured(b.homes)) - Number(isFeatured(a.homes)),
    );

  function card(shift: Shift) {
    const app = appFor(shift.id);
    const home = shift.homes;
    const isOpen = openId === shift.id;
    const mix = home ? careMix(home) : '';
    const hours = hoursBetween(shift.start_time, shift.end_time);
    const total = payForShift(shift, hours);
    const isMine = app?.status === 'accepted';
    return (
      <li key={shift.id} className={isOpen ? 'open' : ''}>
        <button
          type="button"
          className="card-button"
          aria-expanded={isOpen}
          onClick={() => setOpenId(isOpen ? null : shift.id)}
        >
          <span className="card-top">
            <span className="list-title">{shiftTitle(shift)}</span>
            {shift.pay_rate != null && <span className="pay">{payText(shift)}</span>}
          </span>
          <span className="hint">{home?.name ?? 'Adult family home'}</span>
          {total != null && (
            <span className="earn">
              {isMine ? 'You earn' : 'You would earn'} {money(total)}
              {shift.pay_type === 'hour' && ` for ${hoursLabel(hours)}`}
            </span>
          )}
          <RatingLine summary={summaries.find((x) => x.ratee_id === shift.home_id)} />
          <span className="chips">
            {app?.status === 'accepted' && <span className="chip ok">Yours</span>}
            {app?.status === 'applied' && <span className="chip">Applied</span>}
            {app?.status === 'offered' && <span className="chip warn">Offered to you</span>}
            {app?.status === 'declined' && <span className="chip bad">Not selected</span>}
            {isFeatured(home) && <span className="chip warn">Featured home</span>}
            {fits(shift) && <span className="chip ok">Fits your free time</span>}
            {shift.spots > 1 && <span className="chip">{shift.spots} caregivers needed</span>}
            {mix && <span className="chip">{mix}</span>}
          </span>
        </button>

        {isOpen && (
          <div className="form inset">
            {home && (
              <p className="hint">
                {home.license_verified ? 'Licence verified. ' : 'Licence not yet verified. '}
                {home.years_operating != null && `${home.years_operating} years operating. `}
                {app?.status === 'accepted' && home.address && `Address: ${home.address}. `}
                {app?.status === 'accepted' && home.phone && `Phone: ${home.phone}.`}
              </p>
            )}
            {home?.description && <p className="hint">{home.description}</p>}
            {shift.pay_note && (
              <p className="quote">
                <strong>{shift.pay_type === 'shift' ? 'What this shift covers' : 'Hours asked for'}:</strong>{' '}
                {shift.pay_note}
              </p>
            )}
            {shift.pay_rate == null && <p className="hint">The home has not said what this shift pays. Message them to ask.</p>}
            {shift.notes && <p className="hint">Note from the home: {shift.notes}</p>}

            {shift.requirements.length > 0 && (
              <dl className="card">
                {shift.requirements.map((kind) => (
                  <div key={kind} className="pair">
                    <dt>{CREDENTIAL_LABELS[kind] ?? kind}</dt>
                    <dd className={has(kind) ? 'good' : 'missing'}>{has(kind) ? 'You have it' : 'Missing'}</dd>
                  </div>
                ))}
              </dl>
            )}

            {app?.status === 'accepted' &&
              shift.shift_date <= today &&
              (rated.has(shift.id) ? (
                <p className="hint">You rated this home. Thank you.</p>
              ) : (
                <RatingForm
                  shiftId={shift.id}
                  raterId={userId}
                  rateeId={shift.home_id}
                  name={home?.name ?? 'this home'}
                  onDone={load}
                />
              ))}

            {app?.status === 'offered' && (
              <div className="row">
                <button type="button" className="btn secondary" disabled={busy} onClick={() => setStatus(app, 'declined')}>
                  Decline
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setStatus(app, 'accepted')}>
                  Accept
                </button>
              </div>
            )}
            {(!app || app.status === 'withdrawn') && (
              <button type="button" className="btn" disabled={busy} onClick={() => apply(shift)}>
                Apply for this shift
              </button>
            )}
            {app?.status === 'applied' && (
              <button type="button" className="btn secondary" disabled={busy} onClick={() => setStatus(app, 'withdrawn')}>
                Withdraw application
              </button>
            )}
            {app && app.status !== 'withdrawn' && (
              <button type="button" className="link" onClick={() => message(shift)}>
                Message the home
              </button>
            )}
          </div>
        )}
      </li>
    );
  }

  if (!loaded) return <p className="hint">Loading…</p>;

  const earned = (list: Shift[]) =>
    list.reduce((sum, s) => sum + (payForShift(s, hoursBetween(s.start_time, s.end_time)) ?? 0), 0);


  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {(mine.length > 0 || past.length > 0) && (
        <section className="section">
          <h2>Your earnings</h2>
          <div className="stats">
            <div>
              <strong>{money(earned(mine))}</strong>
              <span>
                coming up, from {mine.length} {mine.length === 1 ? 'shift' : 'shifts'}
              </span>
            </div>
            <div>
              <strong>{money(earned(past))}</strong>
              <span>
                last 60 days, from {past.length} {past.length === 1 ? 'shift' : 'shifts'}
              </span>
            </div>
          </div>
          <p className="hint">
            Worked out from each shift's hours and rate, before tax. The home pays you directly.
          </p>
        </section>
      )}

      {offers.length > 0 && (
        <section className="section">
          <h2>Offered to you</h2>
          <ul className="list">{offers.map(card)}</ul>
        </section>
      )}

      {mine.length > 0 && (
        <section className="section">
          <h2>Your shifts</h2>
          <ul className="list">{mine.map(card)}</ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="section">
          <h2>Past shifts</h2>
          <p className="hint">Open one to rate the home.</p>
          <ul className="list">{past.map(card)}</ul>
        </section>
      )}

      <section className="section">
        <h2>Open shifts</h2>
        {open.length === 0 ? (
          <p className="hint">
            No open shifts right now. Keep your free times up to date so homes can offer you one.
          </p>
        ) : (
          <ul className="list">{open.map(card)}</ul>
        )}
      </section>
    </>
  );
}
