import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import Band from '../components/Band';

interface Props {
  onSwitch: () => void;
}

export default function SignIn({ onSwitch }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <>
      <Band title="Welcome back" lead="Sign in to see your shifts and messages." />
      <main className="content">
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
            <div className="with-toggle">
              <input
                id="si-pass"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="toggle"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
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
    </>
  );
}
