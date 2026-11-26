import { useEffect, useState } from 'react';
import Empty from '../../components/Empty';
import Skeleton from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { AskRec, RecLine, RecList, type Rec, type RecSummary } from '../../components/Recommendations';
import {
  CREDENTIAL_LABELS,
  careMix,
  daysAgoText,
  isFeatured,
  isCurrent,
  partOf,
  formatDate,
  formatTime,
  payForShift,
  payText,
  hoursBetween,
  shiftTitle,
  todayText,
  dateKey,
  isFreeOn,
  type DateChange,
  type Application,
  type ApplicationStatus,
  type Shift,
  type Thread,
} from '../../lib/types';

import Avatar from '../../components/Avatar';
import MapView, { type Pin } from '../../components/MapView';
import { milesBetween, milesText, pointOf, whereAmI, type Point } from '../../lib/geo';

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
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());
  const [credentials, setCredentials] = useState<MyCredential[]>([]);
  const [summaries, setSummaries] = useState<RecSummary[]>([]);
  const [myRecs, setMyRecs] = useState<Pick<Rec, 'author_id' | 'status'>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState<'all' | 'fits' | 'day' | 'night'>('all');
  const [sort, setSort] = useState<'soonest' | 'pay' | 'near'>('soonest');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [me, setMe] = useState<Point | null>(null);
  const [meNote, setMeNote] = useState('');
  const [pinId, setPinId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dayPick, setDayPick] = useState('any');
  const [size, setSize] = useState<'any' | 'small' | 'mid' | 'large'>('any');

  async function load() {
    if (!supabase) return;
    // The caregiver's saved area, if they shared one. Missing until the map step is run in the database.
    supabase
      .from('caregiver_areas')
      .select('lat, lng')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const p = pointOf(data);
        if (p) setMe((now) => now ?? p);
      });
    const [s, a, f, fd, c, r, g] = await Promise.all([
      supabase
        .from('shifts')
        .select('*, homes(*)')
        .gte('shift_date', daysAgoText(60))
        .in('status', ['open', 'filled'])
        .order('shift_date')
        .order('start_time'),
      supabase.from('applications').select('id, shift_id, caregiver_id, status').eq('caregiver_id', userId),
      supabase.from('availability').select('day, part').eq('user_id', userId),
      supabase.from('availability_dates').select('on_date, part, free').eq('user_id', userId).gte('on_date', todayText()),
      supabase.from('credentials').select('kind, expires_on').eq('user_id', userId),
      supabase.from('recommendation_summary').select('subject_id, total'),
      supabase.from('recommendations').select('author_id, status').eq('subject_id', userId),
    ]);
    const firstError = s.error ?? a.error ?? f.error ?? c.error;
    if (firstError) setError(firstError.message);
    setShifts((s.data ?? []) as Shift[]);
    setApplications((a.data ?? []) as Application[]);
    setFree(new Set((f.data ?? []).map((r) => `${r.day}-${r.part}`)));
    // One-off date changes. Missing until the database step is run; the usual week still works.
    setChanges(new Map(((fd.data ?? []) as DateChange[]).map((x) => [dateKey(x.on_date, x.part), x.free])));
    setCredentials((c.data ?? []) as MyCredential[]);
    setSummaries((r.data ?? []) as RecSummary[]);
    setMyRecs((g.data ?? []) as Pick<Rec, 'author_id' | 'status'>[]);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  const appFor = (shiftId: string) => applications.find((a) => a.shift_id === shiftId);
  const fits = (shift: Shift) => isFreeOn(free, changes, shift.shift_date, partOf(shift.start_time));
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
      photoId: shift.home_id,
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
  const allOpen = upcoming.filter((s) => s.status === 'open' && !offers.includes(s) && !mine.includes(s));
  const totalFor = (s: Shift) => payForShift(s, hoursBetween(s.start_time, s.end_time)) ?? -1;
  const milesTo = (s: Shift) => {
    const p = pointOf(s.homes);
    return me && p ? milesBetween(me, p) : null;
  };
  const words = query.trim().toLowerCase();
  const open = allOpen
    .filter((s) => {
      if (show === 'fits' && !fits(s)) return false;
      if ((show === 'day' || show === 'night') && partOf(s.start_time) !== show) return false;
      if (dayPick !== 'any' && s.shift_date !== dayPick) return false;
      if (size !== 'any') {
        const residents = (s.homes?.bed_bound ?? 0) + (s.homes?.assisted ?? 0) + (s.homes?.independent ?? 0);
        if (size === 'small' && residents > 2) return false;
        if (size === 'mid' && (residents < 3 || residents > 4)) return false;
        if (size === 'large' && residents < 5) return false;
      }
      if (!words) return true;
      return `${s.homes?.name ?? ''} ${s.homes?.address ?? ''}`.toLowerCase().includes(words);
    })
    .sort((a, b) =>
      sort === 'pay'
        ? totalFor(b) - totalFor(a)
        : sort === 'near'
          ? (milesTo(a) ?? 1e9) - (milesTo(b) ?? 1e9) || a.shift_date.localeCompare(b.shift_date)
          : // Soonest first; on the same day, featured homes and shifts that fit come first.
          a.shift_date.localeCompare(b.shift_date) ||
          Number(isFeatured(b.homes)) - Number(isFeatured(a.homes)) ||
          Number(fits(b)) - Number(fits(a)) ||
          a.start_time.localeCompare(b.start_time),
    );

  // The first shift in view that fits the caregiver's free time and is still open to apply for.
  const bestId =
    open.find((s) => fits(s) && (!appFor(s.id) || appFor(s.id)?.status === 'withdrawn'))?.id ?? null;
  // The next two weeks as tappable days; a dot marks a day that has open shifts.
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, d, has: allOpen.some((s) => s.shift_date === iso) };
  });

  // One pin per home, counting that home's open shifts in the current filter.
  const pins: Pin[] = [];
  for (const s of open) {
    const p = pointOf(s.homes);
    if (!p) continue;
    const pin = pins.find((x) => x.id === s.home_id);
    if (pin) pin.badge = String(Number(pin.badge) + 1);
    else pins.push({ id: s.home_id, kind: 'home', ...p, badge: '1', label: s.homes?.name ?? 'Adult family home' });
  }
  for (const pin of pins) pin.label = `${pin.label}, ${pin.badge} open ${pin.badge === '1' ? 'shift' : 'shifts'}`;
  const atPin = open.filter((s) => s.home_id === pinId && pointOf(s.homes));
  const unpinned = open.filter((s) => !pointOf(s.homes)).length;

  async function useMyLocation() {
    setMeNote('Finding you…');
    try {
      setMe(await whereAmI());
      setMeNote('');
    } catch (e) {
      setMeNote(e instanceof Error ? e.message : 'We could not find your location.');
    }
  }

  function card(shift: Shift, isBest = false) {
    const app = appFor(shift.id);
    const home = shift.homes;
    const isOpen = openId === shift.id;
    const mix = home ? careMix(home) : '';
    const hours = hoursBetween(shift.start_time, shift.end_time);
    const total = payForShift(shift, hours);
    const isMine = app?.status === 'accepted';
    // Midday keeps the date from slipping a day in time zones behind UTC.
    const when = new Date(`${shift.shift_date}T12:00:00`);
    const canApply = !app || app.status === 'withdrawn';
    return (
      <li key={shift.id} className={[isOpen ? 'open' : '', isBest ? 'best' : ''].join(' ').trim()}>
        <button
          type="button"
          className="card-button"
          aria-expanded={isOpen}
          onClick={() => setOpenId(isOpen ? null : shift.id)}
        >
          <span className="shift-head">
            {!isBest && (
              <span className="date-block" aria-hidden="true">
                <small>{when.toLocaleDateString('en-US', { weekday: 'short' })}</small>
                <b>{when.getDate()}</b>
              </span>
            )}
            <span className="shift-when">
              {isBest && <span className="chip ok best-tag">Fits your free time</span>}
              <span className="shift-date">
                {isBest && `${formatDate(shift.shift_date)}, `}
                {partOf(shift.start_time) === 'night' ? (isBest ? 'night' : 'Night shift') : isBest ? 'day' : 'Day shift'}
              </span>
              <span className="shift-time">
                {formatTime(shift.start_time)} to {formatTime(shift.end_time)}
              </span>
            </span>
            {(total != null || shift.pay_rate != null) && (
              <span className="shift-pay">
                <b>{total != null ? (Number.isInteger(total) ? `$${total}` : money(total)) : payText(shift)}</b>
                {total != null && (
                  <small>
                    {payText(shift)}
                    {shift.pay_type === 'hour' && `, ${hoursLabel(hours)}`}
                  </small>
                )}
              </span>
            )}
          </span>
          <span className="home-line">
            <Avatar userId={shift.home_id} name={home?.name} size="small" />
            <span className={isBest ? 'list-title' : 'hint'}>{home?.name ?? 'Adult family home'}</span>
          </span>
          {isMine && total != null && <span className="earn">You earn {money(total)}</span>}
          <RecLine total={summaries.find((x) => x.subject_id === shift.home_id)?.total} />
          <span className="chips">
            {app?.status === 'accepted' && <span className="chip ok">Yours</span>}
            {app?.status === 'applied' && <span className="chip">Applied</span>}
            {app?.status === 'offered' && <span className="chip warn">Offered to you</span>}
            {app?.status === 'declined' && <span className="chip bad">Not selected</span>}
            {isFeatured(home) && <span className="chip warn">Featured home</span>}
            {milesTo(shift) != null && <span className="chip">{milesText(milesTo(shift)!)}</span>}
            {fits(shift) && !isBest && <span className="chip ok">Fits your free time</span>}
            {shift.preferred_sex && (
              <span className="chip">{shift.preferred_sex === 'female' ? 'Female' : 'Male'} caregiver requested</span>
            )}
            {shift.spots > 1 && <span className="chip">{shift.spots} caregivers needed</span>}
            {mix && <span className="chip">{mix}</span>}
          </span>
        </button>
        {isBest && !isOpen && canApply && (
          <button type="button" className="btn best-apply" disabled={busy} onClick={() => apply(shift)}>
            Apply for this shift
          </button>
        )}

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
            <RecList subjectId={shift.home_id} total={summaries.find((x) => x.subject_id === shift.home_id)?.total} />
            {shift.preferred_sex && (
              <p className="quote">
                <strong>The home asks for a {shift.preferred_sex} caregiver for this shift.</strong> Reason given:{' '}
                {shift.preference_reason}
              </p>
            )}
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
              shift.shift_date <= today && (
                <AskRec
                  userId={userId}
                  otherId={shift.home_id}
                  name={home?.name ?? 'this home'}
                  mine={myRecs}
                  onDone={load}
                />
              )}

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

  if (!loaded) return <Skeleton rows={4} label="Loading shifts" />;

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
          <ul className="list">{offers.map((s) => card(s))}</ul>
        </section>
      )}

      {mine.length > 0 && (
        <section className="section">
          <h2>Your shifts</h2>
          <ul className="list">{mine.map((s) => card(s))}</ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="section">
          <h2>Past shifts</h2>
          <p className="hint">Open one to ask the home for a recommendation.</p>
          <ul className="list">{past.map((s) => card(s))}</ul>
        </section>
      )}

      <section className="section">
        <h2>Browse open shifts</h2>
        {allOpen.length === 0 ? (
          <p className="hint">
            No homes have open shifts right now. Keep your free times up to date so homes can offer you one.
          </p>
        ) : (
          <>
            <div className="filters" role="group" aria-label="Show">
              {(
                [
                  ['all', 'All'],
                  ['fits', 'Fits my free time'],
                  ['day', 'Day'],
                  ['night', 'Night'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={show === id ? 'on' : ''}
                  aria-pressed={show === id}
                  onClick={() => setShow(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="day-strip" role="group" aria-label="Day">
              <button type="button" className={dayPick === 'any' ? 'on' : ''} aria-pressed={dayPick === 'any'} onClick={() => setDayPick('any')}>
                <small>Any</small>
                <b>All</b>
                <span className="dot" />
              </button>
              {days.map(({ iso, d, has: hasShifts }) => (
                <button
                  key={iso}
                  type="button"
                  className={[dayPick === iso ? 'on' : '', hasShifts ? 'has' : ''].join(' ').trim()}
                  aria-pressed={dayPick === iso}
                  aria-label={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${hasShifts ? ', has open shifts' : ', no open shifts'}`}
                  onClick={() => setDayPick(dayPick === iso ? 'any' : iso)}
                >
                  <small>{d.toLocaleDateString('en-US', { weekday: 'short' })}</small>
                  <b>{d.getDate()}</b>
                  <span className="dot" />
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="sb-search">City, ZIP code or home name</label>
              <input id="sb-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="sb-size">Residents in the home</label>
                <select id="sb-size" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
                  <option value="any">Any number</option>
                  <option value="small">1 or 2</option>
                  <option value="mid">3 or 4</option>
                  <option value="large">5 or more</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="sb-sort">Sort by</label>
                <select id="sb-sort" value={sort} onChange={(e) => setSort(e.target.value as 'soonest' | 'pay' | 'near')}>
                  <option value="soonest">Soonest</option>
                  <option value="pay">Highest pay</option>
                  {me && <option value="near">Nearest</option>}
                </select>
              </div>
            </div>
            <p className="hint" role="status">
              Showing {open.length} of {allOpen.length} open {allOpen.length === 1 ? 'shift' : 'shifts'}.
            </p>
            <div className="segmented" role="group" aria-label="View">
              <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>
                List
              </button>
              <button type="button" className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}>
                Map
              </button>
            </div>
            {!me && (
              <div className="near-me">
                <p className="hint">See how far each shift is from you.</p>
                <button type="button" className="btn secondary small" onClick={useMyLocation}>
                  Use where I am now
                </button>
                {meNote && (
                  <p className="hint" role="status">
                    {meNote}
                  </p>
                )}
              </div>
            )}
            {open.length === 0 ? (
              <Empty icon="search" title="No shifts match">Choose "All" in both rows or clear the search to see every open shift.</Empty>
            ) : view === 'list' ? (
              <ul className="list">{[...open.filter((s) => s.id === bestId), ...open.filter((s) => s.id !== bestId)].map((s) =>
                  card(s, s.id === bestId),
                )}</ul>
            ) : (
              <>
                <MapView
                  label="Map of homes with open shifts"
                  pins={pins}
                  me={me}
                  selectedId={pinId}
                  onSelect={setPinId}
                />
                {pins.length === 0 ? (
                  <p className="hint">None of these homes has placed itself on the map yet. Use the list to see them.</p>
                ) : atPin.length > 0 ? (
                  <>
                    <h3>{atPin[0].homes?.name ?? 'This home'}</h3>
                    <ul className="list">{atPin.map((s) => card(s))}</ul>
                  </>
                ) : (
                  <p className="hint" role="status">
                    Tap a pin to see that home's shifts. The number on a pin is how many shifts it has open.
                    {unpinned > 0 &&
                      ` ${unpinned} more ${unpinned === 1 ? 'shift is' : 'shifts are'} at homes not on the map yet. Find them in the list.`}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
