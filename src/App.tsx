import { useEffect, useState } from 'react';
import type { EmailOtpType, Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import Band from './components/Band';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Home from './pages/Home';

type View = 'signin' | 'signup';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>(() => (location.search.includes('signin') ? 'signin' : 'signup'));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    // Links in our emails arrive as /?token_hash=...&type=... on our own address.
    const params = new URLSearchParams(location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;
    const start = async () => {
      if (tokenHash && type) {
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
        history.replaceState(null, '', '/');
        if (error) {
          setView('signin');
          setNotice('That link has expired or was already used. Sign in below, or sign up again to get a new one.');
        }
      }
      const { data } = await client.auth.getSession();
      setSession(data.session);
      setLoading(false);
    };
    start();
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
      {!session && notice && (
        <p className="notice-bar" role="status">
          {notice}
        </p>
      )}
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
