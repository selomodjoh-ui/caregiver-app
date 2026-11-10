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
    setSearched(true);
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
        <p className="hint">No caregivers have marked that time as free yet. Try another day or time.</p>
      )}

      <ul className="list">
        {cards.map((card) => {
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
