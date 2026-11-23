import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const LIMIT = 300;

/** A caregiver's short note on the work they want. Homes see it on the caregiver's card. */
export default function LookingFor({ userId }: { userId: string }) {
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('profiles')
      .select('looking_for')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const text = (data as { looking_for?: string | null } | null)?.looking_for ?? '';
        setSaved(text);
        setDraft(text);
      });
  }, [userId]);

  async function save() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setDone(false);
    const text = draft.trim();
    const { error: err } = await supabase.from('profiles').update({ looking_for: text || null }).eq('id', userId);
    setBusy(false);
    if (err) {
      setError('We could not save your note. Please try again.');
      return;
    }
    setSaved(text);
    setDraft(text);
    setDone(true);
  }

  return (
    <section className="section">
      <h2>The work I'm looking for</h2>
      <p className="hint">
        Tell homes what suits you, such as nights only, weekends, or regular shifts with one home. They see this
        note when they look for caregivers.
      </p>
      <div className="field">
        <label htmlFor="looking-for">My note to homes</label>
        <textarea
          id="looking-for"
          rows={3}
          maxLength={LIMIT}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDone(false);
          }}
        />
        <span className="hint">
          {draft.length} of {LIMIT} characters
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="hint" role="status">
          Saved. Homes can see your note now.
        </p>
      )}
      <button type="button" className="btn secondary" disabled={busy || draft.trim() === saved} onClick={save}>
        {busy ? 'Saving…' : 'Save my note'}
      </button>
    </section>
  );
}
