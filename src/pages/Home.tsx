import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabase';
import Band from '../components/Band';
import Credentials from './Credentials';

interface Props {
  session: Session;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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

  const lead = profile
    ? profile.role === 'provider'
      ? 'Your home account is set up.'
      : 'Thank you for the care you give.'
    : undefined;

  return (
    <>
      <Band title={profile ? `${greeting()}, ${profile.first_name}` : greeting()} lead={lead} />
      <main className="content">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {profile?.role === 'caregiver' && <Credentials userId={session.user.id} />}

        {profile && (
          <section className="section">
            <h2>Your details</h2>
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
          </section>
        )}

        <p className="hint">
          {profile?.role === 'provider'
            ? 'The home profile, posting shifts and chat are the next parts to be built.'
            : 'Availability, shifts and chat are the next parts to be built.'}
        </p>

        <button type="button" className="btn secondary" onClick={() => supabase?.auth.signOut()}>
          Sign out
        </button>
      </main>
    </>
  );
}
