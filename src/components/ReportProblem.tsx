import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/** A private note to the ShiftKind team. Nobody else on the app sees it. */
export default function ReportProblem({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || body.trim().length < 10) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('problem_reports')
      .insert({ reporter_id: userId, about: about.trim() || null, body: body.trim() });
    setBusy(false);
    if (err) {
      setError('We could not send your report. Please try again.');
      return;
    }
    setAbout('');
    setBody('');
    setOpen(false);
    setSent(true);
  }

  return (
    <section className="section">
      <h2>Report a problem</h2>
      <p className="hint">
        Had a bad experience with a shift, a home or a caregiver? Tell us. Only the ShiftKind team reads this. It is
        never shown to the other person or on anyone's profile.
      </p>
      {sent && (
        <p className="notice-bar inline" role="status">
          Thank you. We have your report and will look into it.
        </p>
      )}
      {!open ? (
        <button type="button" className="btn secondary" onClick={() => { setOpen(true); setSent(false); }}>
          Report a problem
        </button>
      ) : (
        <form className="form inset" onSubmit={submit}>
          <div className="field">
            <label htmlFor="rp-about">Who or what is it about? (optional)</label>
            <input id="rp-about" maxLength={120} value={about} onChange={(e) => setAbout(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rp-body">What happened?</label>
            <textarea id="rp-body" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
            <span className="hint">Leave out resident names and health details. In an emergency call 911.</span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" className="btn" disabled={busy || body.trim().length < 10}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
