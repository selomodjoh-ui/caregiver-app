import { useEffect, useState } from 'react';
import Empty from '../../components/Empty';
import Skeleton from '../../components/Skeleton';
import Avatar from '../../components/Avatar';
import { supabase } from '../../lib/supabase';
import { milesBetween, milesText, pointOf, type Point } from '../../lib/geo';
import {
  CREDENTIAL_LABELS,
  JOB_KINDS,
  formatDate,
  jobKindLabel,
  jobPayText,
  todayText,
  type Job,
  type JobApplication,
} from '../../lib/types';

interface Props {
  userId: string;
}

const STATUS_TEXT: Record<JobApplication['status'], string> = {
  applied: 'You applied. The home will message you if they want to talk.',
  shortlisted: 'The home has shortlisted you.',
  hired: 'The home marked you as hired.',
  declined: 'The home chose someone else.',
  withdrawn: 'You withdrew your application.',
};

/** Permanent and long-term jobs a caregiver can browse and apply for. */
export default function JobBoard({ userId }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [held, setHeld] = useState<string[]>([]);
  const [me, setMe] = useState<Point | null>(null);
  const [kind, setKind] = useState<'any' | Job['kind']>('any');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!supabase) return;
    const [j, a, c, area] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, homes(name, address, license_verified, bed_bound, assisted, independent, lat, lng)')
        .order('created_at', { ascending: false }),
      supabase.from('job_applications').select('*').eq('caregiver_id', userId),
      supabase.from('credentials').select('kind, expires_on').eq('user_id', userId),
      supabase.from('caregiver_areas').select('lat, lng').eq('user_id', userId).maybeSingle(),
    ]);
    if (j.error) setError('Jobs are not available yet. Please try again shortly.');
    setJobs((j.data ?? []) as Job[]);
    setApps((a.data ?? []) as JobApplication[]);
    const today = todayText();
    setHeld(
      ((c.data ?? []) as { kind: string; expires_on: string | null }[])
        .filter((x) => !x.expires_on || x.expires_on >= today)
        .map((x) => x.kind),
    );
    setMe(pointOf(area.data));
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, [userId]);

  const appFor = (jobId: string) => apps.find((a) => a.job_id === jobId);

  async function apply(job: Job) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const existing = appFor(job.id);
    const { error: err } = existing
      ? await supabase.from('job_applications').update({ status: 'applied', note: note.trim() || null }).eq('id', existing.id)
      : await supabase.from('job_applications').insert({ job_id: job.id, caregiver_id: userId, note: note.trim() || null });
    setBusy(false);
    if (err) {
      setError('We could not send your application. The job may have just closed.');
      return;
    }
    setOpenId(null);
    setNote('');
    load();
  }

  async function withdraw(app: JobApplication) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('job_applications').update({ status: 'withdrawn' }).eq('id', app.id);
    setBusy(false);
    if (err) setError('We could not withdraw your application. Please try again.');
    load();
  }

  const today = todayText();
  const isOpen = (j: Job) => j.status === 'open' && j.expires_on >= today;
  const mine = jobs.filter((j) => {
    const a = appFor(j.id);
    return a && a.status !== 'withdrawn';
  });
  const open = jobs.filter((j) => isOpen(j) && !mine.includes(j) && (kind === 'any' || j.kind === kind));

  function card(job: Job) {
    const app = appFor(job.id);
    const active = app && app.status !== 'withdrawn';
    const pay = jobPayText(job);
    const p = pointOf(job.homes);
    const miles = me && p ? milesBetween(me, p) : null;
    const residents = (job.homes?.bed_bound ?? 0) + (job.homes?.assisted ?? 0) + (job.homes?.independent ?? 0);
    const missing = job.requirements.filter((k) => !held.includes(k));
    return (
      <li key={job.id} className="shift-card job-card">
        <div className="job-head">
          <div className="list-main">
            <span className="list-title">{job.title}</span>
            <span className="home-line">
              <Avatar userId={job.home_id} name={job.homes?.name} size="small" />
              <span className="hint">{job.homes?.name ?? 'Adult family home'}</span>
            </span>
          </div>
          {pay && <span className="shift-pay job-pay">{pay}</span>}
        </div>
        <span className="chips">
          <span className="chip ok">{jobKindLabel(job.kind)}</span>
          {job.homes?.license_verified && <span className="chip ok">Licence checked</span>}
          {miles !== null && <span className="chip">{milesText(miles)}</span>}
          {residents > 0 && <span className="chip">{residents} {residents === 1 ? 'resident' : 'residents'}</span>}
          {job.start_date && <span className="chip">Starts {formatDate(job.start_date)}</span>}
        </span>
        {job.schedule && <p className="job-line"><strong>Schedule:</strong> {job.schedule}</p>}
        {job.homes?.address && <p className="job-line"><strong>Where:</strong> {job.homes.address}</p>}
        {job.description && <p className="job-text">{job.description}</p>}
        {job.requirements.length > 0 && (
          <span className="chips">
            {job.requirements.map((k) => (
              <span key={k} className={`chip ${missing.includes(k) ? 'warn' : 'ok'}`}>
                {missing.includes(k) ? 'You need: ' : 'You have: '}
                {CREDENTIAL_LABELS[k] ?? k}
              </span>
            ))}
          </span>
        )}

        {active ? (
          <>
            <p className="notice-bar inline" role="status">{STATUS_TEXT[app.status]}</p>
            {(app.status === 'applied' || app.status === 'shortlisted') && (
              <button type="button" className="link" disabled={busy} onClick={() => withdraw(app)}>
                Withdraw my application
              </button>
            )}
          </>
        ) : !isOpen(job) ? (
          <p className="hint">This job is no longer open.</p>
        ) : openId === job.id ? (
          <div className="field">
            <label htmlFor={`note-${job.id}`}>A short note to the home (optional)</label>
            <textarea
              id={`note-${job.id}`}
              rows={3}
              maxLength={500}
              value={note}
              placeholder="For example: when you could start, and your experience with similar residents."
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="actions">
              <button type="button" className="btn small" disabled={busy} onClick={() => apply(job)}>
                {busy ? 'Sending…' : 'Send application'}
              </button>
              <button type="button" className="btn small secondary" disabled={busy} onClick={() => setOpenId(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setOpenId(job.id);
              setNote('');
            }}
          >
            Apply for this job
          </button>
        )}
      </li>
    );
  }

  return (
    <section className="section">
      <h2>Permanent and long-term jobs</h2>
      <p className="hint">
        Posted by the homes themselves. You see the real home, the schedule and the pay before you apply, and
        nobody charges you a fee.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded ? (
        <Skeleton rows={3} label="Loading jobs" />
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <h3 className="week-title">Your applications</h3>
              <ul className="list">{mine.map(card)}</ul>
            </>
          )}
          <h3 className="week-title">Open jobs</h3>
          <div className="chips filter-chips" role="group" aria-label="Type of job">
            <button type="button" className={`chip pick ${kind === 'any' ? 'on' : ''}`} aria-pressed={kind === 'any'} onClick={() => setKind('any')}>
              All
            </button>
            {JOB_KINDS.map((k) => (
              <button key={k.kind} type="button" className={`chip pick ${kind === k.kind ? 'on' : ''}`} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
                {k.label}
              </button>
            ))}
          </div>
          {open.length === 0 ? (
            <Empty icon="briefcase" title="No open jobs right now">Homes post new ones here. Turn on "open to a permanent job" on the Me tab and hiring homes can find you first.</Empty>
          ) : (
            <ul className="list">{open.map(card)}</ul>
          )}
        </>
      )}
    </section>
  );
}
