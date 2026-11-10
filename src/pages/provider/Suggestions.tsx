import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { RatingLine } from '../../components/Rating';
import { shiftTitle, type Shift, type Thread } from '../../lib/types';

interface Suggestion {
  id: string;
  first_name: string;
  surname_initial: string;
  missing: number;
  average: number | null;
  total: number;
}

interface Props {
  shift: Shift;
  homeId: string;
  /** How many more caregivers the shift needs. */
  stillNeeded: number;
  onOffered: () => void;
  onOpenThread: (thread: Thread) => void;
}

/** Caregivers the app suggests for one shift, best match first. */
export default function Suggestions({ shift, homeId, stillNeeded, onOffered, onOpenThread }: Props) {
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('suggest_caregivers', { target: shift.id });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setList((data ?? []) as Suggestion[]);
  }

  async function offer(ids: string[]) {
    if (!supabase || ids.length === 0) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('applications')
      .insert(ids.map((id) => ({ shift_id: shift.id, caregiver_id: id, status: 'offered' })));
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setList((current) => (current ?? []).filter((s) => !ids.includes(s.id)));
    onOffered();
  }

  if (list === null) {
    return (
      <>
        <button type="button" className="btn small secondary" disabled={busy} onClick={load}>
          {busy ? 'Looking…' : 'Suggest caregivers'}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  }

  const top = list.slice(0, stillNeeded);

  return (
    <div className="suggest">
      <span className="list-title">Suggested for this shift</span>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {list.length === 0 ? (
        <p className="hint">
          Nobody matches yet. A match is free at this time
          {shift.preferred_sex ? `, is a ${shift.preferred_sex} caregiver` : ''} and has not already applied or been
          offered the shift.
        </p>
      ) : (
        <>
          <p className="hint">
            Free at this time{shift.preferred_sex ? `, ${shift.preferred_sex}` : ''}, ranked by the credentials you
            asked for and then by rating.
          </p>
          {list.map((s, i) => (
            <div key={s.id} className="applicant">
              <div className="person">
                <span className="avatar" aria-hidden="true">
                  {s.first_name.charAt(0).toUpperCase()}
                </span>
                <div className="list-main">
                  <span className="list-title">
                    {s.first_name} {s.surname_initial}.
                  </span>
                  <RatingLine summary={s.total > 0 && s.average != null ? { ratee_id: s.id, average: s.average, total: s.total } : undefined} />
                  <span className="chips">
                    {i === 0 && <span className="chip warn">Best match</span>}
                    <span className={`chip ${s.missing === 0 ? 'ok' : 'bad'}`}>
                      {s.missing === 0
                        ? 'Has every credential you asked for'
                        : `Missing ${s.missing} ${s.missing === 1 ? 'credential' : 'credentials'}`}
                    </span>
                  </span>
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn small" disabled={busy} onClick={() => offer([s.id])}>
                  Offer this shift
                </button>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() =>
                    onOpenThread({
                      shiftId: null,
                      homeId,
                      caregiverId: s.id,
                      title: `${s.first_name} ${s.surname_initial}.`,
                      subtitle: `Direct conversation, about ${shiftTitle(shift)}`,
                    })
                  }
                >
                  Message
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn" disabled={busy} onClick={() => offer(top.map((s) => s.id))}>
            {top.length === 1 ? `Offer to the best match` : `Offer to the top ${top.length}`}
          </button>
        </>
      )}
    </div>
  );
}
