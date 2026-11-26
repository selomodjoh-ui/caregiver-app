import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  DAYS,
  dateKey,
  dayOf,
  isFreeOn,
  type DateChange,
  formatDate,
  isHomeActive,
  partOf,
  shiftTitle,
  todayText,
  type Application,
  type CaregiverCard,
  type CredentialSummary,
  type HomeInfo,
  type Part,
  type Shift,
  type Thread,
} from '../../lib/types';
import CaregiverSummary from './CaregiverSummary';
import MapView, { type Pin } from '../../components/MapView';
import { milesBetween, milesText, pointOf, type Point } from '../../lib/geo';
import type { RecSummary } from '../../components/Recommendations';

interface Props {
  userId: string;
  home: HomeInfo | null;
  onOpenThread: (thread: Thread) => void;
  onNeedHome: () => void;
}

/** One line of the search: a period of days, and which shifts are needed in it. */
interface Request {
  from: string;
  to: string;
  time: 'day' | 'night' | 'both';
}

/** One shift the provider needs covered: a calendar date, and day or night. */
interface Slot {
  date: string;
  day: number;
  part: Part;
}

const MAX_DAYS = 31;
const slotKey = (x: { day: number; part: Part }) => `${x.day}-${x.part}`;

/** Every shift asked for across all requests, in date order, with repeats removed. */
function slotsFor(requests: Request[]): Slot[] {
  const seen = new Map<string, Slot>();
  for (const r of requests) {
    if (!r.from) continue;
    const end = r.to && r.to >= r.from ? r.to : r.from;
    const [y, m, d] = r.from.split('-').map(Number);
    const cursor = new Date(y, m - 1, d);
    for (let n = 0; n < MAX_DAYS; n += 1) {
      const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (date > end) break;
      for (const part of r.time === 'both' ? (['day', 'night'] as Part[]) : [r.time]) {
        seen.set(`${date}-${part}`, { date, day: cursor.getDay(), part });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.part.localeCompare(b.part));
}

export default function FindCaregivers({ userId, home, onOpenThread, onNeedHome }: Props) {
  const [requests, setRequests] = useState<Request[]>([{ from: todayText(), to: todayText(), time: 'night' }]);
  const [wanted, setWanted] = useState<Slot[]>([]);
  const [covered, setCovered] = useState<Record<string, string[]>>({});
  const [cards, setCards] = useState<CaregiverCard[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [summaries, setSummaries] = useState<RecSummary[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [more, setMore] = useState<{ card: CaregiverCard; slots: string[] }[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [areas, setAreas] = useState<Record<string, Point>>({});
  const [cell, setCell] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadShifts() {
    if (!supabase) return;
    const s = await supabase
      .from('shifts')
      .select('*')
      .eq('home_id', userId)
      .eq('status', 'open')
      .gte('shift_date', todayText())
      .order('shift_date');
    const list = (s.data ?? []) as Shift[];
    setShifts(list);
    if (list.length > 0) {
      const a = await supabase
        .from('applications')
        .select('id, shift_id, caregiver_id, status')
        .in('shift_id', list.map((x) => x.id));
      setApplications((a.data ?? []) as Application[]);
    }
  }

  async function search() {
    if (!supabase) return;
    const slots = slotsFor(requests);
    setWanted(slots);
    if (slots.length === 0) {
      setError('Choose at least one date to search.');
      return;
    }
    setBusy(true);
    setError('');
    const days = [...new Set(slots.map((x) => x.day))];
    const a = await supabase.from('availability').select('user_id, day, part').in('day', days);
    if (a.error) setError(a.error.message);
    const free = new Map<string, Set<string>>();
    for (const row of (a.data ?? []) as { user_id: string; day: number; part: Part }[]) {
      free.set(row.user_id, (free.get(row.user_id) ?? new Set()).add(slotKey(row)));
    }
    // One-off changes caregivers made for these exact dates: away, or free for an extra shift.
    const dates = [...new Set(slots.map((x) => x.date))];
    const d = await supabase.from('availability_dates').select('user_id, on_date, part, free').in('on_date', dates);
    const changed = new Map<string, Map<string, boolean>>();
    for (const row of (d.data ?? []) as ({ user_id: string } & DateChange)[]) {
      const mine = changed.get(row.user_id) ?? new Map<string, boolean>();
      mine.set(dateKey(row.on_date, row.part), row.free);
      changed.set(row.user_id, mine);
    }
    // For each caregiver, which of the requested shifts they are free for.
    const none = new Map<string, boolean>();
    const cover: Record<string, string[]> = {};
    for (const id of new Set([...free.keys(), ...changed.keys()])) {
      const hits = slots.filter((x) => isFreeOn(free.get(id) ?? new Set(), changed.get(id) ?? none, x.date, x.part));
      if (hits.length > 0) cover[id] = hits.map((x) => `${formatDate(x.date)} ${x.part}`);
    }
    const ids = Object.keys(cover).sort((x, y) => cover[y].length - cover[x].length);
    setCovered(cover);
    if (ids.length === 0) {
      setCards([]);
      setCredentials([]);
    } else {
      const [c, k, r] = await Promise.all([
        supabase.from('caregiver_cards').select('id, first_name, surname_initial, looking_for, open_to_permanent').in('id', ids),
        supabase.from('credentials').select('user_id, kind, status, expires_on').in('user_id', ids),
        supabase.from('recommendation_summary').select('subject_id, total').in('subject_id', ids),
      ]);
      setSummaries((r.data ?? []) as RecSummary[]);
      if (c.error) setError(c.error.message);
      const found = (c.data ?? []) as CaregiverCard[];
      setCards(ids.map((id) => found.find((x) => x.id === id)).filter((x): x is CaregiverCard => !!x));
      setCredentials((k.data ?? []) as CredentialSummary[]);
    }
    setMore(null);
    setSearched(true);
    setBusy(false);
  }

  /** Widens the search: caregivers who are free at other times, closest to the searched time first. */
  async function loadMore() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const a = await supabase.from('availability').select('user_id, day, part');
    if (a.error) setError(a.error.message);
    const shown = new Set(cards.map((c) => c.id));
    const byPerson = new Map<string, { day: number; part: Part }[]>();
    for (const row of (a.data ?? []) as { user_id: string; day: number; part: Part }[]) {
      if (shown.has(row.user_id)) continue;
      byPerson.set(row.user_id, [...(byPerson.get(row.user_id) ?? []), { day: row.day, part: row.part }]);
    }
    // Same day first, then the day before or after, then everyone else.
    const wantedDays = wanted.length ? wanted.map((x) => x.day) : [new Date().getDay()];
    const distance = (slots: { day: number }[]) =>
      Math.min(
        ...slots.flatMap((x) => wantedDays.map((day) => Math.min((x.day - day + 7) % 7, (day - x.day + 7) % 7))),
      );
    const ids = [...byPerson.keys()]
      .sort((x, y) => distance(byPerson.get(x)!) - distance(byPerson.get(y)!))
      .slice(0, 20);
    if (ids.length === 0) {
      setMore([]);
      setBusy(false);
      return;
    }
    const [c, k, r] = await Promise.all([
      supabase.from('caregiver_cards').select('id, first_name, surname_initial, looking_for, open_to_permanent').in('id', ids),
      supabase.from('credentials').select('user_id, kind, status, expires_on').in('user_id', ids),
      supabase.from('recommendation_summary').select('subject_id, total').in('subject_id', ids),
    ]);
    const found = (c.data ?? []) as CaregiverCard[];
    setCredentials((list) => [...list.filter((x) => !ids.includes(x.user_id)), ...((k.data ?? []) as CredentialSummary[])]);
    setSummaries((list) => [...list.filter((x) => !ids.includes(x.subject_id)), ...((r.data ?? []) as RecSummary[])]);
    const order = DAYS.map((d) => d.day);
    setMore(
      ids
        .map((id) => found.find((x) => x.id === id))
        .filter((x): x is CaregiverCard => !!x)
        .map((card) => ({
          card,
          slots: byPerson
            .get(card.id)!
            .sort((x, y) => order.indexOf(x.day) - order.indexOf(y.day) || x.part.localeCompare(y.part))
            .map((x) => `${DAYS.find((d) => d.day === x.day)!.short} ${x.part}`),
        })),
    );
    setBusy(false);
  }

  useEffect(() => {
    loadShifts();
    search();
    // Areas caregivers chose to share. Empty until the map step is run in the database.
    supabase
      ?.from('caregiver_areas')
      .select('user_id, lat, lng')
      .then(({ data }) => {
        const found: Record<string, Point> = {};
        for (const row of data ?? []) {
          const p = pointOf(row);
          if (p) found[row.user_id as string] = p;
        }
        setAreas(found);
      });
  }, []);

  const homeSpot = pointOf(home);
  const milesTo = (id: string) => (homeSpot && areas[id] ? milesBetween(homeSpot, areas[id]) : null);
  const cellOf = (p: Point) => `${p.lat},${p.lng}`;

  function showMap() {
    setView('map');
    // The map shows everyone nearby, so bring in caregivers beyond the searched times too.
    if (more === null && !busy) loadMore();
  }

  // Offer a shift that matches one of the searched times first, if there is one.
  const matching = shifts.filter((s) =>
    wanted.some((x) => x.date === s.shift_date && x.day === dayOf(s.shift_date) && x.part === partOf(s.start_time)),
  );

  function changeRequest(index: number, change: Partial<Request>) {
    setRequests((list) => list.map((r, n) => (n === index ? { ...r, ...change } : r)));
  }
  const chosen = shifts.find((s) => s.id === shiftId) ?? matching[0] ?? shifts[0];

  async function offer(caregiverId: string) {
    if (!supabase || !chosen) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('applications')
      .insert({ shift_id: chosen.id, caregiver_id: caregiverId, status: 'offered' });
    setBusy(false);
    if (err) setError(err.message);
    loadShifts();
  }

  function row(card: CaregiverCard, slots?: string[]) {
    const existing = chosen
      ? applications.find((a) => a.shift_id === chosen.id && a.caregiver_id === card.id)
      : undefined;
    return (
      <li key={card.id}>
        <div className="applicant">
          <CaregiverSummary
            card={card}
            credentials={credentials.filter((c) => c.user_id === card.id)}
            required={chosen?.requirements}
            recs={summaries.find((x) => x.subject_id === card.id)?.total}
          />
          {milesTo(card.id) != null && (
            <span className="chips">
              <span className="chip">{milesText(milesTo(card.id)!)}</span>
            </span>
          )}
          {card.open_to_permanent && (
            <span className="chips">
              <span className="chip ok">Open to permanent work</span>
            </span>
          )}
          {card.looking_for && (
            <p className="looking-for">
              <strong>Looking for:</strong> {card.looking_for}
            </p>
          )}
          {!slots && wanted.length > 1 && covered[card.id] && (
            <span className="chips">
              <span className={`chip ${covered[card.id].length === wanted.length ? 'ok' : 'warn'}`}>
                Free for {covered[card.id].length} of your {wanted.length} shifts
              </span>
              {covered[card.id].length < wanted.length &&
                covered[card.id].slice(0, 8).map((slot) => (
                  <span key={slot} className="chip">
                    {slot}
                  </span>
                ))}
            </span>
          )}
          {slots && (
            <span className="chips">
              <span className="hint">Free:</span>
              {slots.map((slot) => (
                <span key={slot} className="chip ok">
                  {slot}
                </span>
              ))}
            </span>
          )}
          <div className="actions">
            {chosen &&
              (existing ? (
                <span className="chip">
                  {existing.status === 'offered' ? 'Offer sent' : `Already ${existing.status}`}
                </span>
              ) : (
                <button type="button" className="btn small" disabled={busy} onClick={() => offer(card.id)}>
                  Offer this shift
                </button>
              ))}
            <button
              type="button"
              className="btn small secondary"
              onClick={() =>
                onOpenThread({
                  shiftId: null,
                  homeId: userId,
                  caregiverId: card.id,
                  title: `${card.first_name} ${card.surname_initial}.`,
                  subtitle: 'Direct conversation',
                })
              }
            >
              Message {card.first_name}
            </button>
          </div>
        </div>
      </li>
    );
  }

  // Everyone we know about who shared an area, grouped by area so overlapping circles open together.
  const people: { card: CaregiverCard; slots?: string[]; free: boolean }[] = [
    ...cards.map((card) => ({ card, free: true })),
    ...(more ?? []).map((m) => ({ card: m.card, slots: m.slots, free: false })),
  ].filter((x) => areas[x.card.id]);
  const pins: Pin[] = [];
  for (const x of people) {
    const p = areas[x.card.id];
    const pin = pins.find((y) => y.id === cellOf(p));
    if (pin) {
      pin.badge = String(Number(pin.badge) + 1);
      if (x.free) pin.quiet = false;
    } else pins.push({ id: cellOf(p), kind: 'area', ...p, badge: '1', label: '', quiet: !x.free });
  }
  for (const pin of pins) pin.label = pin.badge === '1' ? '1 caregiver' : `${pin.badge} caregivers`;
  const inCell = people.filter((x) => cellOf(areas[x.card.id]) === cell);

  if (!home || !isHomeActive(home)) {
    return (
      <section className="section">
        <h2>Who is free</h2>
        <p className="hint">
          {home
            ? 'Your package has ended. Choose a package to search for caregivers again.'
            : 'Add your home details first, then you can search for caregivers.'}
        </p>
        <button type="button" className="btn" onClick={onNeedHome}>
          {home ? 'See packages' : 'Add home details'}
        </button>
      </section>
    );
  }

  return (
    <section className="section">
      <h2>Who is free</h2>
      <p className="hint">
        Choose the dates and shifts you need covered. Use the plus button to add another request.
      </p>

      {requests.map((req, r) => (
        <div key={r} className="request" role="group" aria-label={`Request ${r + 1}`}>
          <div className="request-head">
            <span className="list-title">Request {r + 1}</span>
            {requests.length > 1 && (
              <button
                type="button"
                className="btn small secondary"
                onClick={() => setRequests((list) => list.filter((_, n) => n !== r))}
              >
                Remove
              </button>
            )}
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor={`fc-from-${r}`}>From</label>
              <input
                id={`fc-from-${r}`}
                type="date"
                min={todayText()}
                value={req.from}
                onChange={(e) =>
                  changeRequest(r, { from: e.target.value, to: req.to < e.target.value ? e.target.value : req.to })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`fc-to-${r}`}>To</label>
              <input
                id={`fc-to-${r}`}
                type="date"
                min={req.from || todayText()}
                value={req.to}
                onChange={(e) => changeRequest(r, { to: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`fc-time-${r}`}>Shifts needed</label>
            <select
              id={`fc-time-${r}`}
              value={req.time}
              onChange={(e) => changeRequest(r, { time: e.target.value as Request['time'] })}
            >
              <option value="day">Day shift</option>
              <option value="night">Night shift</option>
              <option value="both">Day and night shifts</option>
            </select>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="add-row"
        onClick={() => setRequests((list) => [...list, { from: todayText(), to: todayText(), time: 'day' }])}
      >
        <span className="plus" aria-hidden="true">
          +
        </span>
        Add another request
      </button>

      <button type="button" className="btn" disabled={busy} onClick={search}>
        {busy
          ? 'Searching…'
          : slotsFor(requests).length > 1
            ? `Search ${slotsFor(requests).length} shifts`
            : 'Search'}
      </button>
      <p className="hint">A period can cover up to {MAX_DAYS} days.</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {shifts.length > 0 ? (
        <div className="field">
          <label htmlFor="fc-shift">Shift to offer</label>
          <select id="fc-shift" value={chosen?.id ?? ''} onChange={(e) => setShiftId(e.target.value)}>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftTitle(s)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="hint">Post a shift first, then you can offer it to someone here.</p>
      )}

      <div className="segmented" role="group" aria-label="View">
        <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>
          List
        </button>
        <button type="button" className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'} onClick={showMap}>
          Map
        </button>
      </div>

      {view === 'map' && (
        <>
          <MapView
            label="Map of caregivers near your home"
            pins={pins}
            me={homeSpot}
            meKind="home"
            selectedId={cell}
            onSelect={setCell}
          />
          {!homeSpot && (
            <p className="hint">
              Your home is not on the map yet.{' '}
              <button type="button" className="link" onClick={onNeedHome}>
                Place your pin in My home
              </button>{' '}
              to see how far away each caregiver is.
            </p>
          )}
          {pins.length === 0 ? (
            <p className="hint">
              No caregivers have shared their area yet. They appear here as they do. Everyone is still in the list.
            </p>
          ) : inCell.length > 0 ? (
            <>
              <h3>{inCell.length === 1 ? '1 caregiver in this area' : `${inCell.length} caregivers in this area`}</h3>
              <ul className="list">{inCell.map((x) => row(x.card, x.slots))}</ul>
            </>
          ) : (
            <p className="hint" role="status">
              Each circle is the general area a caregiver lives in, about a mile wide. Tap a circle to see who is
              there. Filled badges are free for the times you asked for.
            </p>
          )}
        </>
      )}

      {view === 'list' && (
        <>
      {searched && cards.length === 0 && (
        <p className="hint">
          No caregivers have marked {wanted.length > 1 ? 'any of those times' : 'that time'} as free yet. Tap "Show
          more options" to see who is free at other times.
        </p>
      )}

      <ul className="list">{cards.map((card) => row(card))}</ul>

      {searched && more === null && (
        <button type="button" className="btn secondary" disabled={busy} onClick={loadMore}>
          {busy ? 'Looking…' : 'Show more options'}
        </button>
      )}

      {more !== null && (
        <>
          <h3>More options</h3>
          {more.length === 0 ? (
            <p className="hint">There is nobody else to show yet. More caregivers appear here as they join.</p>
          ) : (
            <>
              <p className="hint">
                These caregivers have not marked the times you asked for as free, but may be able to help. Their free times are shown. Message them to ask.
              </p>
              <ul className="list">{more.map((m) => row(m.card, m.slots))}</ul>
            </>
          )}
        </>
      )}
        </>
      )}
    </section>
  );
}
