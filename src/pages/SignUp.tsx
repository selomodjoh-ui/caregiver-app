import { useState, type FormEvent } from 'react';
import { supabase, type Role } from '../lib/supabase';

interface Props {
  onSwitch: () => void;
}

export default function SignUp({ onSwitch }: Props) {
  const [role, setRole] = useState<Role>('caregiver');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [sex, setSex] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
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
      <main className="screen">
        <h1>Check your email</h1>
        <p className="lead">
          We sent a confirmation link to {email}. Open it to finish creating your account, then
          sign in.
        </p>
        <button type="button" className="btn secondary" onClick={onSwitch}>
          Go to sign in
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <h1>Create your profile</h1>
      <p className="lead">Homes see this when you apply for a shift.</p>

      <form onSubmit={submit} className="form">
        <div className="segmented" role="group" aria-label="Account type">
          <button
            type="button"
            aria-pressed={role === 'caregiver'}
            className={role === 'caregiver' ? 'on' : ''}
            onClick={() => setRole('caregiver')}
          >
            I'm a caregiver
          </button>
          <button
            type="button"
            aria-pressed={role === 'provider'}
            className={role === 'provider' ? 'on' : ''}
            onClick={() => setRole('provider')}
          >
            I'm a provider
          </button>
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
          <input
            id="su-pass"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="hint">At least 8 characters.</span>
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
  );
}
