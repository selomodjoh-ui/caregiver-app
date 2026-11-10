import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  DAYS,
  PARTS,
  dayOf,
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
import type { RatingSummary } from '../../components/Rating';

interface Props {
  userId: string;
  home: HomeInfo | null;
  onOpenThread: (thread: Thread) => void;
  onNeedHome: () => void;
}

export default function FindCaregivers({ userId, home, onOpenThread, onNeedHome }: Props) {
  const [day, setDay] = useState(6);
  const [part, setPart] = useState<Part>('night');
  const [cards, setCards] = useState<CaregiverCard[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [summaries, setSummaries] = useState<RatingSummary[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [more, setMore] = useState<{ card: CaregiverCard; slots: string[] }[] | null>(null);
  const [searched, setSearched] = useState(false);
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
    setBusy(true);
    setError('');
    const a = await supabase.from('availability').select('user_id').eq('day', day).eq('part', part);
    if (a.error) setError(a.error.message);
    const ids = (a.data ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) {
      setCards([]);
      setCredentials([]);
    } else {
      const [c, k, r] = await Promise.all([
        supabase.from('caregiver_cards').select('id, first_name, surname_initial').in('id', ids),
        supabase.from('credentials').select('user_id, kind, status, expires_on').in('user_id', ids),
        supabase.from('rating_summary').select('ratee_id, average, total').in('ratee_id', ids),
      ]);
      setSummaries((r.data ?? []) as RatingSummary[]);
      if (c.error) setError(c.error.message);
      setCards((c.data ?? []) as CaregiverCard[]);
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
    const distance = (slots: { day: number }[]) =>
      Math.min(...slots.map((x) => Math.min((x.day - day + 7) % 7, (day - x.day + 7) % 7)));
    const ids = [...byPerson.keys()]
      .sort((x, y) => distance(byPerson.get(x)!) - distance(byPerson.get(y)!))
      .slice(0, 20);
    if (ids.length === 0) {
      setMore([]);
      setBusy(false);
      return;
    }
    const [c, k, r] = await Promise.all([
      supabase.from('caregiver_cards').select('id, first_name, surname_initial').in('id', ids),
      supabase.from('credentials').select('user_id, kind, status, expires_on').in('user_id', ids),
      supabase.from('rating_summary').select('ratee_id, average, total').in('ratee_id', ids),
    ]);
    const found = (c.data ?? []) as CaregiverCard[];
    setCredentials((list) => [...list.filter((x) => !ids.includes(x.user_id)), ...((k.data ?? []) as CredentialSummary[])]);
    setSummaries((list) => [...list.filter((x) => !ids.includes(x.ratee_id)), ...((r.data ?? []) as RatingSummary[])]);
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
  }, []);

  // Offer the shift that matches the searched time first, if there is one.
  const matching = shifts.filter((s) => dayOf(s.shift_date) === day && partOf(s.start_time) === part);
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
            rating={summaries.find((x) => x.ratee_id === card.id)}
          />
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
      <p className="hint">Search by the time you need covered.</p>

      <div className="row">
        <div className="field">
          <label htmlFor="fc-day">Day</label>
          <select id="fc-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d) => (
              <option key={d.day} value={d.day}>
                {d.full}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fc-part">Time</label>
          <select id="fc-part" value={part} onChange={(e) => setPart(e.target.value as Part)}>
            {PARTS.map((p) => (
              <option key={p.part} value={p.part}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" className="btn" disabled={busy} onClick={search}>
        {busy ? 'Searching…' : 'Search'}
      </button>

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

      {searched && cards.length === 0 && (
        <p className="hint">
          No caregivers have marked that time as free yet. Tap "Show more options" to see who is free at other
          times.
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
                These caregivers have not marked {DAYS.find((d) => d.day === day)!.full} {part} as free, but may be
                able to help. Their free times are shown. Message them to ask.
              </p>
              <ul className="list">{more.map((m) => row(m.card, m.slots))}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
