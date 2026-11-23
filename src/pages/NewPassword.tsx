import { useState, type FormEvent } from 'react';
import { messageOf, supabase, withTimeout } from '../lib/supabase';
import Band from '../components/Band';
import Help from '../components/Help';

/** Shown after someone opens the link in a "reset your password" email. */
export default function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: err } = await withTimeout(supabase.auth.updateUser({ password }));
      if (err) setError(err.message);
      else onDone();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Band title="Choose a new password" lead="You'll use it the next time you sign in." />
      <main className="content">
        <form onSubmit={submit} className="form">
          <div className="field">
            <label htmlFor="np-pass">New password</label>
            <div className="with-toggle">
              <input
                id="np-pass"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="toggle" aria-pressed={show} onClick={() => setShow((v) => !v)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            <span className="hint">At least 8 characters.</span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
        <Help />
      </main>
    </>
  );
}
