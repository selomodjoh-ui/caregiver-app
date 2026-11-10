import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import Band from './components/Band';
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
      <div className="app">
        <Band title="Almost there" />
        <main className="content">
          <p className="hint">
            The app is not connected to its backend yet. Add the Supabase project URL and public
            key as described in the README, then reload.
          </p>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app">
        <Band title="One moment" />
        <main className="content">
          <p className="hint">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {session ? (
        <Home session={session} />
      ) : view === 'signup' ? (
        <SignUp onSwitch={() => setView('signin')} />
      ) : (
        <SignIn onSwitch={() => setView('signup')} />
      )}
    </div>
  );
}
