import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Home from './pages/Home';

type View = 'signin' | 'signup';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('signup');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="screen">
        <h1>Almost there</h1>
        <p className="lead">
          The app is not connected to its backend yet. Add the Supabase project URL and public key
          as described in the README, then reload.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="screen">
        <p className="lead">Loading…</p>
      </main>
    );
  }

  if (session) return <Home session={session} />;

  return view === 'signup' ? (
    <SignUp onSwitch={() => setView('signin')} />
  ) : (
    <SignIn onSwitch={() => setView('signup')} />
  );
}
