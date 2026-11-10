import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabase';

interface Props {
  session: Session;
}

export default function Home({ session }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('profiles')
      .select('id, role, first_name, surname, sex, phone, address')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setProfile(data as Profile | null);
      });
  }, [session.user.id]);

  return (
    <main className="screen">
      <h1>{profile ? `Hello, ${profile.first_name}` : 'Hello'}</h1>
      <p className="lead">
        {profile
          ? profile.role === 'provider'
            ? 'You are signed in as a provider.'
            : 'You are signed in as a caregiver.'
          : 'You are signed in.'}
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {profile && (
        <dl className="card">
          <div>
            <dt>Name</dt>
            <dd>
              {profile.first_name} {profile.surname}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{session.user.email}</dd>
          </div>
          {profile.phone && (
            <div>
              <dt>Mobile</dt>
              <dd>{profile.phone}</dd>
            </div>
          )}
          {profile.address && (
            <div>
              <dt>Address</dt>
              <dd>{profile.address}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="hint">
        Credentials, availability, shifts and chat are the next parts to be built.
      </p>

      <button type="button" className="btn secondary" onClick={() => supabase?.auth.signOut()}>
        Sign out
      </button>
    </main>
  );
}
