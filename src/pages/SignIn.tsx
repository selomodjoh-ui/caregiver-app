import { useState, type FormEvent } from 'react';
import { messageOf, supabase, withTimeout } from '../lib/supabase';
import Band from '../components/Band';
import Help from '../components/Help';
import People from '../components/People';

interface Props {
  onSwitch: () => void;
}

export default function SignIn({ onSwitch }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setBusy(true);
    try {
      const { error: err } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` }),
      );
      if (err) setError(err.message);
      else setResetSent(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setBusy(true);
    try {
      const { error: err } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
      );
      if (err) {
        setError(
          err.message === 'Email not confirmed'
            ? 'Your email is not confirmed yet. Open the confirmation email we sent and click the link, then sign in. If you cannot find it, check your spam or junk folder.'
            : err.message === 'Invalid login credentials'
              ? 'That email and password do not match an account. Check both and try again.'
              : err.message,
        );
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (forgot) {
    return (
      <>
        <Band title="Reset your password" lead="We'll email you a link to choose a new one." />
        <main className="content">
          {resetSent ? (
            <>
              <p className="notice-bar inline" role="status">
                If {email.trim()} has a ShiftKind account, a reset link is on its way. It can take a few minutes. If
                you don't see it, check your spam or junk folder.
              </p>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setForgot(false);
                  setResetSent(false);
                }}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <form onSubmit={sendReset} className="form">
              <div className="field">
                <label htmlFor="fp-email">Email</label>
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Sending…' : 'Email me a reset link'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setForgot(false);
                  setError('');
                }}
              >
                Back to sign in
              </button>
            </form>
          )}
          <Help />
        </main>
      </>
    );
  }

  return (
    <>
      <Band title="Welcome back" lead="Sign in to see your shifts and messages.">
        <People />
      </Band>
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
          <p className="switch">
            <button
              type="button"
              className="link"
              onClick={() => {
                setForgot(true);
                setError('');
              }}
            >
              Forgot password?
            </button>
          </p>
        </form>

        <p className="switch">
          New here?{' '}
          <button type="button" className="link" onClick={onSwitch}>
            Create an account
          </button>
        </p>
        <Help />
      </main>
    </>
  );
}
