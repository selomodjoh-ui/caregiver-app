import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onSwitch: () => void;
}

export default function SignIn({ onSwitch }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) setError(err.message);
  }

  return (
    <main className="screen">
      <h1>Sign in</h1>
      <p className="lead">Welcome back.</p>

      <form onSubmit={submit} className="form">
        <div className="field">
          <label htmlFor="si-email">Email</label>
          <input
            id="si-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="si-pass">Password</label>
          <input
            id="si-pass"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="switch">
        New here?{' '}
        <button type="button" className="link" onClick={onSwitch}>
          Create an account
        </button>
      </p>
    </main>
  );
}
