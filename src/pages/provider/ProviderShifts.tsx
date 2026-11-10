import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import {
  CREDENTIAL_LABELS,
  REQUIREMENT_KINDS,
  daysAgoText,
  isHomeActive,
  payText,
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
import CredentialReport from './CredentialReport';
import { RatingForm, type RatingSummary } from '../../components/Rating';

interface Props {
  userId: string;
  home: HomeInfo | null;
  onOpenThread: (thread: Thread) => void;
  onNeedHome: () => void;
}

/** One line of the post-a-shift form: some days, with one set of times and pay. */
interface ShiftRequest {
  dates: string[];
  start: string;
  end: string;
  pay: string;
  payType: 'hour' | 'shift';
  spots: string;
}

const emptyRequest = (): ShiftRequest => ({ dates: [''], start: '', end: '', pay: '', payType: 'hour', spots: '1' });

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
  const [summaries, setSummaries] = useState<RatingSummary[]>([]);
  const [rated, setRated] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<{ app: Application; shift: Shift } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [requests, setRequests] = useState<ShiftRequest[]>([emptyRequest()]);
  const [required, setRequired] = useState<string[]>(['hca_cna', 'tb_test']);
  const [notes, setNotes] = useState('');

  async function load() {
    if (!supabase) return;
    const s = await supabase
      .from('shifts')
      .select('*')
      .eq('home_id', userId)
      .gte('shift_date', daysAgoText(60))
      .order('shift_date')
      .order('start_time');
    if (s.error) setError(s.error.message);
    const [r, g] = await Promise.all([
      supabase.from('rating_summary').select('ratee_id, average, total'),
      supabase.from('ratings').select('shift_id, ratee_id').eq('rater_id', userId),
    ]);
    setSummaries((r.data ?? []) as RatingSummary[]);
    setRated(new Set((g.data ?? []).map((x) => `${x.shift_id}:${x.ratee_id}`)));
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
    // Each request becomes one shift per day chosen in it.
    const rows = requests.flatMap((r) =>
      [...new Set(r.dates.filter(Boolean))].sort().map((shiftDate) => ({
        home_id: userId,
        shift_date: shiftDate,
        start_time: r.start,
        end_time: r.end,
        pay_rate: r.pay === '' ? null : Number(r.pay),
        pay_type: r.payType,
        spots: Math.min(20, Math.max(1, Math.round(Number(r.spots)) || 1)),
        requirements: required,
        notes: notes.trim() || null,
      })),
    );
    if (rows.length === 0) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('shifts').insert(rows);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPosting(false);
    setRequests([emptyRequest()]);
    setNotes('');
    load();
  }

  function changeRequest(index: number, change: Partial<ShiftRequest>) {
    setRequests((list) => list.map((r, n) => (n === index ? { ...r, ...change } : r)));
  }

  const shiftCount = requests.reduce((sum, r) => sum + r.dates.length, 0);

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

  const today = todayText();
  const upcoming = shifts.filter((s) => s.status !== 'cancelled' && s.shift_date >= today);
  const past = shifts
    .filter(
      (s) =>
        s.status !== 'cancelled' &&
        s.shift_date < today &&
        applications.some((a) => a.shift_id === s.id && a.status === 'accepted'),
    )
    .reverse();
  const visible = [...upcoming, ...past];

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="section">
        <h2>Post a shift</h2>
        {!isHomeActive(home) ? (
          <>
            <p className="error">Your package has ended, so new shifts cannot be posted.</p>
            <button type="button" className="btn" onClick={onNeedHome}>
              See packages
            </button>
          </>
        ) : !posting ? (
          <button type="button" className="btn" onClick={() => setPosting(true)}>
            Post a new shift
          </button>
        ) : (
          <form className="form" onSubmit={post}>
            {requests.map((req, r) => (
              <div key={r} className="request" role="group" aria-label={`Shift request ${r + 1}`}>
                {requests.length > 1 && (
                  <div className="request-head">
                    <span className="list-title">Shift request {r + 1}</span>
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => setRequests((list) => list.filter((_, n) => n !== r))}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div className="field">
                  <span className="legend">{req.dates.length === 1 ? 'Day' : `Days (${req.dates.length})`}</span>
                  <div className="dates">
                    {req.dates.map((value, i) => (
                      <div key={i} className="date-row">
                        <input
                          type="date"
                          required
                          aria-label={`Request ${r + 1}, day ${i + 1}`}
                          min={todayText()}
                          value={value}
                          onChange={(e) =>
                            changeRequest(r, { dates: req.dates.map((d, n) => (n === i ? e.target.value : d)) })
                          }
                        />
                        {req.dates.length > 1 && (
                          <button
                            type="button"
                            className="btn small secondary"
                            aria-label={`Remove day ${i + 1} from request ${r + 1}`}
                            onClick={() => changeRequest(r, { dates: req.dates.filter((_, n) => n !== i) })}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" className="link" onClick={() => changeRequest(r, { dates: [...req.dates, ''] })}>
                    Add another day
                  </button>
                </div>
                <div className="row">
                  <div className="field">
                    <label htmlFor={`ps-start-${r}`}>Starts</label>
                    <input id={`ps-start-${r}`} type="time" required value={req.start} onChange={(e) => changeRequest(r, { start: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`ps-end-${r}`}>Ends</label>
                    <input id={`ps-end-${r}`} type="time" required value={req.end} onChange={(e) => changeRequest(r, { end: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <span className="legend" id={`ps-paytype-${r}`}>
                    How this shift pays
                  </span>
                  <div className="segmented" role="group" aria-labelledby={`ps-paytype-${r}`}>
                    <button
                      type="button"
                      className={req.payType === 'hour' ? 'on' : ''}
                      aria-pressed={req.payType === 'hour'}
                      onClick={() => changeRequest(r, { payType: 'hour' })}
                    >
                      Per hour
                    </button>
                    <button
                      type="button"
                      className={req.payType === 'shift' ? 'on' : ''}
                      aria-pressed={req.payType === 'shift'}
                      onClick={() => changeRequest(r, { payType: 'shift' })}
                    >
                      Per shift
                    </button>
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label htmlFor={`ps-pay-${r}`}>
                      {req.payType === 'shift' ? 'Pay for the shift (USD)' : 'Pay per hour (USD)'}
                    </label>
                    <input id={`ps-pay-${r}`} type="number" min="0" step="0.25" inputMode="decimal" value={req.pay} onChange={(e) => changeRequest(r, { pay: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`ps-spots-${r}`}>Caregivers needed</label>
                    <input id={`ps-spots-${r}`} type="number" min="1" max="20" step="1" inputMode="numeric" required value={req.spots} onChange={(e) => changeRequest(r, { spots: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={() => setRequests((list) => [...list, emptyRequest()])}>
              Add another shift request
            </button>
            <span className="hint">
              Use a new request for different hours or pay, such as a day shift and a night shift. Each day in a
              request becomes its own shift.
            </span>
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
                {busy ? 'Posting…' : shiftCount > 1 ? `Post ${shiftCount} shifts` : 'Post shift'}
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
                          {shift.status !== 'filled' ? 'Open' : shift.shift_date < today ? 'Completed' : 'Filled'}
                        </span>
                        {shift.spots > 1 && (
                          <span className="chip">
                            {apps.filter((a) => a.status === 'accepted').length} of {shift.spots} caregivers found
                          </span>
                        )}
                        {shift.pay_rate != null && <span className="chip">{payText(shift)}</span>}
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
                            rating={summaries.find((x) => x.ratee_id === app.caregiver_id)}
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
                          {app.status === 'accepted' &&
                            (home.plan === 'plus' && isHomeActive(home) ? (
                              <button type="button" className="btn small secondary" onClick={() => setReport({ app, shift })}>
                                Credential report
                              </button>
                            ) : (
                              <p className="hint">Printable credential reports come with the Plus package.</p>
                            ))}
                          {app.status === 'accepted' &&
                            shift.shift_date <= today &&
                            (rated.has(`${shift.id}:${app.caregiver_id}`) ? (
                              <p className="hint">You rated this caregiver. Thank you.</p>
                            ) : (
                              <RatingForm
                                shiftId={shift.id}
                                raterId={userId}
                                rateeId={app.caregiver_id}
                                name={card ? card.first_name : 'this caregiver'}
                                onDone={load}
                              />
                            ))}
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

      {report && (
        <CredentialReport
          homeName={home.name}
          card={cards.find((c) => c.id === report.app.caregiver_id)}
          credentials={credentials.filter((c) => c.user_id === report.app.caregiver_id)}
          shiftTitle={shiftTitle(report.shift)}
          onClose={() => setReport(null)}
        />
      )}
    </>
  );
}
