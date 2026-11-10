import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabase';
import type { HomeInfo, Thread } from '../lib/types';
import Band from '../components/Band';
import TabBar, { icons, type Tab } from '../components/TabBar';
import Credentials from './Credentials';
import Messages from './Messages';
import Availability from './caregiver/Availability';
import ShiftBoard from './caregiver/ShiftBoard';
import FindCaregivers from './provider/FindCaregivers';
import HomeProfile from './provider/HomeProfile';
import ProviderShifts from './provider/ProviderShifts';

interface Props {
  session: Session;
}

type TabId = 'shifts' | 'availability' | 'credentials' | 'find' | 'home' | 'messages' | 'account';

const CAREGIVER_TABS: Tab<TabId>[] = [
  { id: 'account', label: 'Me', icon: icons.person },
  { id: 'credentials', label: 'Credentials', icon: icons.shield },
  { id: 'availability', label: 'Free time', icon: icons.clock },
  { id: 'shifts', label: 'Shifts', icon: icons.shifts },
  { id: 'messages', label: 'Messages', icon: icons.chat },
];

const PROVIDER_TABS: Tab<TabId>[] = [
  { id: 'shifts', label: 'Shifts', icon: icons.shifts },
  { id: 'find', label: 'Who is free', icon: icons.search },
  { id: 'messages', label: 'Messages', icon: icons.chat },
  { id: 'home', label: 'My home', icon: icons.home },
  { id: 'account', label: 'Me', icon: icons.person },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home({ session }: Props) {
  const userId = session.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [home, setHome] = useState<HomeInfo | null>(null);
  const [tab, setTab] = useState<TabId>('shifts');
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function loadHome() {
    if (!supabase) return;
    const { data } = await supabase.from('homes').select('*').eq('owner_id', userId).maybeSingle();
    setHome((data as HomeInfo | null) ?? null);
  }

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('profiles')
      .select('id, role, first_name, surname, sex, phone, address')
      .eq('id', userId)
      .maybeSingle()
      .then(async ({ data, error: err }) => {
        if (err) setError(err.message);
        const p = data as Profile | null;
        setProfile(p);
        if (p?.role === 'provider') await loadHome();
        setLoaded(true);
      });
  }, [userId]);

  function openThread(t: Thread) {
    setThread(t);
    setTab('messages');
  }

  function changeTab(next: TabId) {
    setThread(null);
    setTab(next);
    window.scrollTo(0, 0);
  }

  if (!loaded) {
    return (
      <>
        <Band title="One moment" />
        <main className="content">
          <p className="hint">Loading…</p>
        </main>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Band title="Something is missing" />
        <main className="content">
          <p className="error" role="alert">
            {error || 'We could not find your profile. Sign out and create your account again.'}
          </p>
          <button type="button" className="btn secondary" onClick={() => supabase?.auth.signOut()}>
            Sign out
          </button>
        </main>
      </>
    );
  }

  const isProvider = profile.role === 'provider';
  const tabs = isProvider ? PROVIDER_TABS : CAREGIVER_TABS;

  return (
    <>
      <Band
        title={`${greeting()}, ${profile.first_name}`}
        lead={isProvider ? (home ? home.name : 'Set up your home to post shifts.') : 'Thank you for the care you give.'}
      />
      <main className="content with-tabs">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {tab === 'shifts' &&
          (isProvider ? (
            <ProviderShifts userId={userId} home={home} onOpenThread={openThread} onNeedHome={() => changeTab('home')} />
          ) : (
            <ShiftBoard userId={userId} onOpenThread={openThread} />
          ))}
        {tab === 'availability' && <Availability userId={userId} />}
        {tab === 'credentials' && <Credentials userId={userId} />}
        {tab === 'find' && <FindCaregivers userId={userId} />}
        {tab === 'home' && <HomeProfile userId={userId} home={home} onSaved={loadHome} />}
        {tab === 'messages' && (
          <Messages
            userId={userId}
            role={profile.role}
            thread={thread}
            onOpenThread={openThread}
            onBack={() => setThread(null)}
          />
        )}
        {tab === 'account' && (
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
                <dt>Account type</dt>
                <dd>{isProvider ? 'Provider' : 'Caregiver'}</dd>
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
            <button type="button" className="btn secondary" onClick={() => supabase?.auth.signOut()}>
              Sign out
            </button>
          </section>
        )}
      </main>
      <TabBar tabs={tabs} current={tab} onChange={changeTab} />
    </>
  );
}
