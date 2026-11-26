import { useEffect, useState, type FormEvent } from 'react';
import CaregiverSummary from './CaregiverSummary';
import { supabase } from '../../lib/supabase';
import type { RecSummary } from '../../components/Recommendations';
import {
  CREDENTIAL_LABELS,
  JOB_KINDS,
  REQUIREMENT_KINDS,
  formatDate,
  jobKindLabel,
  jobPayText,
  todayText,
  type CaregiverCard,
  type CredentialSummary,
  type HomeInfo,
  type Job,
  type JobApplication,
  type Thread,
} from '../../lib/types';

interface Props {
  userId: string;
  home: HomeInfo | null;
  onOpenThread: (thread: Thread) => void;
  onNeedHome: () => void;
}

const APP_TEXT: Record<JobApplication['status'], string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  hired: 'Hired',
  declined: 'Declined',
  withdrawn: 'Withdrew',
};

/** A home's permanent and long-term jobs: post one, and review who applied. */
export default function ProviderJobs({ userId, home, onOpenThread, onNeedHome }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [cards, setCards] = useState<CaregiverCard[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [summaries, setSummaries] = useState<RecSummary[]>([]);
  const [seekers, setSeekers] = useState<CaregiverCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Job['kind']>('live_in');
  const [schedule, setSchedule] = useState('');
  const [pay, setPay] = useState('');
  const [unit, setUnit] = useState<Job['pay_unit']>('hour');
  const [start, setStart] = useState('');
  const [required, setRequired] = useState<string[]>(['hca_cna', 'tb_test']);
  const [description, setDescription] = useState('');

  async function load() {
    if (!supabase) return;
    const [j, r, s] = await Promise.all([
      supabase.from('jobs').select('*').eq('home_id', userId).order('created_at', { ascending: false }),
      supabase.from('recommendation_summary').select('subject_id, total'),
      supabase
        .from('caregiver_cards')
        .select('id, first_name, surname_initial, looking_for, open_to_permanent')
        .eq('open_to_permanent', true)
        .limit(30),
    ]);
    if (j.error) setError('Jobs are not available yet. Please try again shortly.');
    const list = (j.data ?? []) as Job[];
    setJobs(list);
    setSummaries((r.data ?? []) as RecSummary[]);
    const open = (s.data ?? []) as CaregiverCard[];
    setSeekers(open);

    let applied: JobApplication[] = [];
    if (list.length > 0) {
      const a = await supabase.from('job_applications').select('*').in('job_id', list.map((x) => x.id));
      applied = ((a.data ?? []) as JobApplication[]).filter((x) => x.status !== 'withdrawn');
    }
    setApps(applied);
    const people = [...new Set([...applied.map((x) => x.caregiver_id), ...open.map((x) => x.id)])];
    if (people.length > 0) {
      const [c, k] = await Promise.all([
        supabase.from('caregiver_cards').select('id, first_name, surname_initial, looking_for').in('id', people),
        supabase.from('credentials').select('user_id, kind, status, expires_on').in('user_id', people),
      ]);
      setCards((c.data ?? []) as CaregiverCard[]);
      setCredentials((k.data ?? []) as CredentialSummary[]);
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, [userId]);

  const today = todayText();
  const isLive = (j: Job) => j.status === 'open' && j.expires_on >= today;
  const limit = home?.plan === 'plus' ? 5 : 1;

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (title.trim().length < 3) {
      setError('Give the job a short title, such as "Night caregiver".');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('jobs').insert({
      home_id: userId,
      title: title.trim(),
      kind,
      schedule: schedule.trim() || null,
      pay_amount: pay === '' ? null : Number(pay),
      pay_unit: unit,
      start_date: start || null,
      requirements: required,
      description: description.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes('open job')
          ? `Your plan allows ${limit} open ${limit === 1 ? 'job' : 'jobs'} at a time. Close one first, or move to Plus for five.`
          : 'We could not post the job. Check that your plan is active, then try again.',
      );
      return;
    }
    setPosting(false);
    setTitle('');
    setSchedule('');
    setPay('');
    setStart('');
    setDescription('');
    load();
  }

  async function setJob(job: Job, change: Partial<Job>) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('jobs').update(change).eq('id', job.id);
    setBusy(false);
    if (err) {
      setError(
        err.message.includes('open job')
          ? `Your plan allows ${limit} open ${limit === 1 ? 'job' : 'jobs'} at a time. Close another one first.`
          : 'We could not change the job. Please try again.',
      );
    }
    load();
  }

  async function decide(app: JobApplication, status: JobApplication['status']) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('job_applications').update({ status }).eq('id', app.id);
    setBusy(false);
    if (err) setError('We could not save that. Please try again.');
    load();
  }

  const message = (card: CaregiverCard | undefined, id: string) =>
    onOpenThread({
      shiftId: null,
      homeId: userId,
      caregiverId: id,
      photoId: id,
      title: card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver',
      subtitle: 'Direct conversation',
    });

  if (!home) {
    return (
      <section className="section">
        <h2>Permanent and long-term jobs</h2>
        <p className="hint">Add your home's details first, then you can post a job.</p>
        <button type="button" className="btn" onClick={onNeedHome}>
          Add my home
        </button>
      </section>
    );
  }

  const applicants = new Set(apps.map((a) => a.caregiver_id));
  const others = seekers.filter((s) => !applicants.has(s.id));

  return (
    <section className="section">
      <h2>Permanent and long-term jobs</h2>
      <p className="hint">
        Hiring someone to stay? Post the job here and caregivers apply to you directly. Your plan allows {limit}{' '}
        open {limit === 1 ? 'job' : 'jobs'} at a time, and each stays listed for 30 days.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!posting ? (
        <button type="button" className="btn" onClick={() => { setPosting(true); setError(''); }}>
          Post a job
        </button>
      ) : (
        <form className="form inset" onSubmit={post}>
          <div className="field">
            <label htmlFor="pj-title">Job title</label>
            <input id="pj-title" maxLength={80} value={title} placeholder="For example: Night caregiver" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <span className="legend">Type of job</span>
            <div className="segmented" role="group" aria-label="Type of job">
              {JOB_KINDS.map((k) => (
                <button key={k.kind} type="button" className={kind === k.kind ? 'on' : ''} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="pj-schedule">Days and hours</label>
            <input id="pj-schedule" maxLength={200} value={schedule} placeholder="For example: Monday to Friday, 7pm to 7am" onChange={(e) => setSchedule(e.target.value)} />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="pj-pay">Pay (USD)</label>
              <input id="pj-pay" type="number" min="0" step="0.25" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pj-unit">Paid</label>
              <select id="pj-unit" value={unit} onChange={(e) => setUnit(e.target.value as Job['pay_unit'])}>
                <option value="hour">Per hour</option>
                <option value="day">Per day</option>
                <option value="month">Per month</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="pj-start">Start date (optional)</label>
            <input id="pj-start" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <fieldset className="checks">
            <legend className="legend">The caregiver must have</legend>
            {REQUIREMENT_KINDS.map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={required.includes(k)}
                  onChange={() => setRequired((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]))}
                />
                {CREDENTIAL_LABELS[k]}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="pj-desc">About the job (optional)</label>
            <textarea id="pj-desc" rows={4} maxLength={1500} value={description} onChange={(e) => setDescription(e.target.value)} />
            <span className="hint">
              Describe the duties and the experience you need. No resident names or health details, and please
              leave out age, gender or nationality.
            </span>
          </div>
          <div className="row">
            <button type="button" className="btn secondary" onClick={() => setPosting(false)}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Posting…' : 'Post job'}
            </button>
          </div>
        </form>
      )}

      {!loaded ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          <h3 className="week-title">Your jobs</h3>
          {jobs.length === 0 ? (
            <p className="hint">You have not posted a job yet.</p>
          ) : (
            <ul className="list">
              {jobs.map((job) => {
                const live = isLive(job);
                const list = apps.filter((a) => a.job_id === job.id);
                const pay = jobPayText(job);
                return (
                  <li key={job.id} className="shift-card job-card">
                    <div className="job-head">
                      <div className="list-main">
                        <span className="list-title">{job.title}</span>
                        <span className="hint">
                          {jobKindLabel(job.kind)}
                          {job.schedule ? `, ${job.schedule}` : ''}
                        </span>
                      </div>
                      {pay && <span className="shift-pay job-pay">{pay}</span>}
                    </div>
                    <span className="chips">
                      <span className={`chip ${live ? 'ok' : job.status === 'filled' ? '' : 'warn'}`}>
                        {live ? `Open until ${formatDate(job.expires_on)}` : job.status === 'filled' ? 'Filled' : job.status === 'closed' ? 'Closed' : 'Expired'}
                      </span>
                      <span className="chip">
                        {list.length} {list.length === 1 ? 'applicant' : 'applicants'}
                      </span>
                    </span>
                    <div className="actions">
                      {live ? (
                        <>
                          <button type="button" className="btn small secondary" disabled={busy} onClick={() => setJob(job, { status: 'filled' })}>
                            Mark as filled
                          </button>
                          <button type="button" className="btn small secondary" disabled={busy} onClick={() => setJob(job, { status: 'closed' })}>
                            Close
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn small secondary"
                          disabled={busy}
                          onClick={() => setJob(job, { status: 'open', expires_on: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) })}
                        >
                          Post again for 30 days
                        </button>
                      )}
                    </div>
                    {list.length > 0 && (
                      <div className="applicants">
                        {list.map((app) => {
                          const card = cards.find((c) => c.id === app.caregiver_id);
                          return (
                            <div key={app.id} className="applicant">
                              <CaregiverSummary
                                card={card}
                                credentials={credentials.filter((c) => c.user_id === app.caregiver_id)}
                                required={job.requirements}
                                recs={summaries.find((x) => x.subject_id === app.caregiver_id)?.total}
                              />
                              {app.note && <p className="quote">“{app.note}”</p>}
                              <span className={`chip ${app.status === 'hired' || app.status === 'shortlisted' ? 'ok' : app.status === 'declined' ? 'bad' : ''}`}>
                                {APP_TEXT[app.status]}
                              </span>
                              <div className="actions">
                                <button type="button" className="btn small" onClick={() => message(card, app.caregiver_id)}>
                                  Message
                                </button>
                                {app.status === 'applied' && (
                                  <button type="button" className="btn small secondary" disabled={busy} onClick={() => decide(app, 'shortlisted')}>
                                    Shortlist
                                  </button>
                                )}
                                {(app.status === 'applied' || app.status === 'shortlisted') && (
                                  <>
                                    <button type="button" className="btn small secondary" disabled={busy} onClick={() => decide(app, 'hired')}>
                                      Mark as hired
                                    </button>
                                    <button type="button" className="btn small secondary" disabled={busy} onClick={() => decide(app, 'declined')}>
                                      Decline
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="week-title">Caregivers open to permanent work</h3>
          {others.length === 0 ? (
            <p className="hint">Nobody has marked themselves open to permanent work yet.</p>
          ) : (
            <ul className="list">
              {others.map((s) => (
                <li key={s.id} className="shift-card">
                  <CaregiverSummary
                    card={s}
                    credentials={credentials.filter((c) => c.user_id === s.id)}
                    recs={summaries.find((x) => x.subject_id === s.id)?.total}
                  />
                  {s.looking_for && <p className="quote">Looking for: {s.looking_for}</p>}
                  <div className="actions">
                    <button type="button" className="btn small" onClick={() => message(s, s.id)}>
                      Message {s.first_name}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
