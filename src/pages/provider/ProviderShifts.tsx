import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import {
  CREDENTIAL_LABELS,
  REQUIREMENT_KINDS,
  shiftTitle,
  todayText,
  type Application,
  type ApplicationStatus,
  type CaregiverCard,
  type CredentialSummary,
  type HomeInfo,
  type Shift,
  type Thread,
} from '../../lib/types';
import CaregiverSummary from './CaregiverSummary';

interface Props {
  userId: string;
  home: HomeInfo | null;
  onOpenThread: (thread: Thread) => void;
  onNeedHome: () => void;
}

const STATUS_TEXT: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  offered: 'You offered this',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

export default function ProviderShifts({ userId, home, onOpenThread, onNeedHome }: Props) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [cards, setCards] = useState<CaregiverCard[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [pay, setPay] = useState('');
  const [required, setRequired] = useState<string[]>(['hca_cna', 'tb_test']);
  const [notes, setNotes] = useState('');

  async function load() {
    if (!supabase) return;
    const s = await supabase
      .from('shifts')
      .select('*')
      .eq('home_id', userId)
      .gte('shift_date', todayText())
      .order('shift_date')
      .order('start_time');
    if (s.error) setError(s.error.message);
    const list = (s.data ?? []) as Shift[];
    setShifts(list);

    const ids = list.map((x) => x.id);
    if (ids.length > 0) {
      const a = await supabase.from('applications').select('id, shift_id, caregiver_id, status').in('shift_id', ids);
      if (a.error) setError(a.error.message);
      const apps = (a.data ?? []) as Application[];
      setApplications(apps);
      const people = [...new Set(apps.map((x) => x.caregiver_id))];
      if (people.length > 0) {
        const [c, k] = await Promise.all([
          supabase.from('caregiver_cards').select('id, first_name, surname_initial').in('id', people),
          supabase.from('credentials').select('user_id, kind, status, expires_on').in('user_id', people),
        ]);
        setCards((c.data ?? []) as CaregiverCard[]);
        setCredentials((k.data ?? []) as CredentialSummary[]);
      }
    } else {
      setApplications([]);
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('shifts').insert({
      home_id: userId,
      shift_date: date,
      start_time: start,
      end_time: end,
      pay_rate: pay === '' ? null : Number(pay),
      requirements: required,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPosting(false);
    setDate('');
    setStart('');
    setEnd('');
    setPay('');
    setNotes('');
    load();
  }

  async function decide(app: Application, status: ApplicationStatus) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('applications').update({ status }).eq('id', app.id);
    setBusy(false);
    if (err) setError(err.message);
    load();
  }

  async function cancel(shift: Shift) {
    if (!supabase) return;
    if (!window.confirm('Cancel this shift? Caregivers will no longer see it.')) return;
    setBusy(true);
    const { error: err } = await supabase.from('shifts').update({ status: 'cancelled' }).eq('id', shift.id);
    setBusy(false);
    if (err) setError(err.message);
    load();
  }

  function toggleRequired(kind: string) {
    setRequired((r) => (r.includes(kind) ? r.filter((k) => k !== kind) : [...r, kind]));
  }

  if (!home) {
    return (
      <section className="section">
        <h2>Post a shift</h2>
        <p className="hint">Add your home's details first, so caregivers know who is asking.</p>
        <button type="button" className="btn" onClick={onNeedHome}>
          Add home details
        </button>
      </section>
    );
  }

  const visible = shifts.filter((s) => s.status !== 'cancelled');

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="section">
        <h2>Post a shift</h2>
        {!posting ? (
          <button type="button" className="btn" onClick={() => setPosting(true)}>
            Post a new shift
          </button>
        ) : (
          <form className="form" onSubmit={post}>
            <div className="field">
              <label htmlFor="ps-date">Date</label>
              <input id="ps-date" type="date" required min={todayText()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="ps-start">Starts</label>
                <input id="ps-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ps-end">Ends</label>
                <input id="ps-end" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ps-pay">Pay per hour (USD)</label>
              <input id="ps-pay" type="number" min="0" step="0.25" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} />
            </div>
            <fieldset className="checks">
              <legend className="legend">The caregiver must have</legend>
              {REQUIREMENT_KINDS.map((kind) => (
                <label key={kind}>
                  <input type="checkbox" checked={required.includes(kind)} onChange={() => toggleRequired(kind)} />
                  {CREDENTIAL_LABELS[kind]}
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor="ps-notes">Note for caregivers (optional)</label>
              <textarea id="ps-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <span className="hint">No resident names or health details.</span>
            </div>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => setPosting(false)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Posting…' : 'Post shift'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="section">
        <h2>Your shifts</h2>
        {!loaded ? (
          <p className="hint">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="hint">No upcoming shifts. Post one and caregivers who are free will see it.</p>
        ) : (
          <ul className="list">
            {visible.map((shift) => {
              const apps = applications.filter((a) => a.shift_id === shift.id && a.status !== 'withdrawn');
              return (
                <li key={shift.id}>
                  <div className="list-row">
                    <div className="list-main">
                      <span className="list-title">{shiftTitle(shift)}</span>
                      <span className="chips">
                        <span className={`chip ${shift.status === 'filled' ? 'ok' : 'warn'}`}>
                          {shift.status === 'filled' ? 'Filled' : 'Open'}
                        </span>
                        {shift.pay_rate != null && <span className="chip">${Number(shift.pay_rate).toFixed(2)}/hr</span>}
                      </span>
                    </div>
                    {shift.status === 'open' && (
                      <button type="button" className="btn small secondary" disabled={busy} onClick={() => cancel(shift)}>
                        Cancel
                      </button>
                    )}
                  </div>

                  <div className="applicants">
                    {apps.length === 0 && <p className="hint">No applicants yet.</p>}
                    {apps.map((app) => {
                      const card = cards.find((c) => c.id === app.caregiver_id);
                      return (
                        <div key={app.id} className="applicant">
                          <CaregiverSummary
                            card={card}
                            credentials={credentials.filter((c) => c.user_id === app.caregiver_id)}
                            required={shift.requirements}
                          />
                          <span className={`chip ${app.status === 'accepted' ? 'ok' : app.status === 'declined' ? 'bad' : ''}`}>
                            {STATUS_TEXT[app.status]}
                          </span>
                          <div className="actions">
                            {app.status === 'applied' && shift.status === 'open' && (
                              <>
                                <button type="button" className="btn small" disabled={busy} onClick={() => decide(app, 'accepted')}>
                                  Accept
                                </button>
                                <button type="button" className="btn small secondary" disabled={busy} onClick={() => decide(app, 'declined')}>
                                  Decline
                                </button>
                              </>
                            )}
                            {app.status === 'offered' && (
                              <button type="button" className="btn small secondary" disabled={busy} onClick={() => decide(app, 'withdrawn')}>
                                Take back offer
                              </button>
                            )}
                            <button
                              type="button"
                              className="link"
                              onClick={() =>
                                onOpenThread({
                                  shiftId: shift.id,
                                  caregiverId: app.caregiver_id,
                                  title: card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver',
                                  subtitle: shiftTitle(shift),
                                })
                              }
                            >
                              Message
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
