import { useState } from 'react';
import { supabase } from '../lib/supabase';

/** Lets a person remove their own account for good. Sits at the bottom of the Me tab. */
export default function DeleteAccount({ isProvider }: { isProvider: boolean }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    if (!supabase || busy) return;
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    if (err || !(data as { deleted?: boolean } | null)?.deleted) {
      const context = (err as { context?: Response } | null)?.context;
      const body = context ? await context.json().catch(() => null) : null;
      setError(body?.error ?? 'We could not delete your account. Please try again, or email support@getshiftkind.com.');
      setBusy(false);
      return;
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    window.location.assign('/welcome/');
  }

  if (!open) {
    return (
      <p className="delete-account-link">
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      </p>
    );
  }

  return (
    <div className="delete-account" role="group" aria-labelledby="delete-account-title">
      <h3 id="delete-account-title">Delete my account</h3>
      <p>
        This removes your profile, {isProvider ? 'your home, your shifts' : 'your credentials, your applications'}, your
        messages and your ratings. {isProvider ? 'Any card subscription is stopped. ' : ''}It cannot be undone.
      </p>
      <div className="field">
        <label htmlFor="delete-word">Type DELETE to confirm</label>
        <input
          id="delete-word"
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="delete-account-actions">
        <button type="button" className="btn danger" disabled={busy || word.trim().toUpperCase() !== 'DELETE'} onClick={remove}>
          {busy ? 'Deleting…' : 'Delete my account for good'}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setWord('');
            setError('');
          }}
        >
          Keep my account
        </button>
      </div>
    </div>
  );
}
