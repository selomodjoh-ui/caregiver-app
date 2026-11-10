import { useState, type FormEvent } from 'react';
import { supabase, type Role } from '../lib/supabase';
import Band from '../components/Band';
import People from '../components/People';

interface Props {
  onSwitch: () => void;
}

const check = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export default function SignUp({ onSwitch }: Props) {
  const [role, setRole] = useState<Role>('caregiver');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [sex, setSex] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          role,
          first_name: firstName.trim(),
          surname: surname.trim(),
          sex: sex || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
        },
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    // With email confirmation on, there is no session until the link is clicked.
    if (!data.session) setSent(true);
  }

  if (sent) {
    return (
      <>
        <Band title="Check your email" lead={`We sent a link to ${email}.`} />
        <main className="content">
          <p className="hint">Open the link to finish creating your account, then sign in.</p>
          <button type="button" className="btn secondary" onClick={onSwitch}>
            Go to sign in
          </button>
        </main>
      </>
    );
  }

  return (
    <>
      <Band
        title="Care work, on your schedule"
        lead="Join to find shifts in adult family homes near you."
      >
        <People />
      </Band>
      <main className="content">
        <form onSubmit={submit} className="form">
          <div className="field">
            <span className="legend" id="role-legend">
              I am joining as
            </span>
            <div className="roles" role="group" aria-labelledby="role-legend">
              <button
                type="button"
                aria-pressed={role === 'caregiver'}
                className={`role caregiver ${role === 'caregiver' ? 'on' : ''}`}
                onClick={() => setRole('caregiver')}
              >
                <span className="role-check">{check}</span>
                <span className="role-icon">
                  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
                  </svg>
                </span>
                A caregiver
                <small>I want to pick up shifts</small>
              </button>
              <button
                type="button"
                aria-pressed={role === 'provider'}
                className={`role provider ${role === 'provider' ? 'on' : ''}`}
                onClick={() => setRole('provider')}
              >
                <span className="role-check">{check}</span>
                <span className="role-icon">
                  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 11l8-7 8 7" />
                    <path d="M6 10v10h12V10" />
                    <path d="M10 20v-5h4v5" />
                  </svg>
                </span>
                A provider
                <small>I run a care home</small>
              </button>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="su-first">First name</label>
              <input
                id="su-first"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="su-last">Surname</label>
              <input
                id="su-last"
                autoComplete="family-name"
                required
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="su-sex">Sex / gender (optional)</label>
            <select id="su-sex" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">Select</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="x">Non-binary / X</option>
              <option value="none">Prefer not to say</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="su-phone">Mobile number</label>
            <input
              id="su-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="su-email">Email</label>
            <input
              id="su-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="su-addr">Home address</label>
            <input
              id="su-addr"
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="su-pass">Password</label>
            <div className="with-toggle">
              <input
                id="su-pass"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
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
            <span className="hint">
              {password.length >= 8
                ? 'Good, that is long enough.'
                : `At least 8 characters. ${8 - password.length} to go.`}
            </span>
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="switch">
          Already have an account?{' '}
          <button type="button" className="link" onClick={onSwitch}>
            Sign in
          </button>
        </p>
      </main>
    </>
  );
}
