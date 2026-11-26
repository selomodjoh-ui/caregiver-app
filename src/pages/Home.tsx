import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { messageOf, supabase, withTimeout, type Profile } from '../lib/supabase';
import type { HomeInfo, Thread } from '../lib/types';
import Band from '../components/Band';
import PhotoPicker from '../components/PhotoPicker';
import MyRecommendations from '../components/MyRecommendations';
import ReportProblem from '../components/ReportProblem';
import MyArea from '../components/MyArea';
import LookingFor from '../components/LookingFor';
import TabBar, { icons, type Tab } from '../components/TabBar';
import Credentials from './Credentials';
import Messages, { type Unread } from './Messages';
import Availability from './caregiver/Availability';
import JobBoard from './caregiver/JobBoard';
import ProviderJobs from './provider/ProviderJobs';
import ShiftBoard from './caregiver/ShiftBoard';
import FindCaregivers from './provider/FindCaregivers';
import HomeProfile from './provider/HomeProfile';
import Packages from './provider/Packages';
import ProviderShifts from './provider/ProviderShifts';
import Reports from './provider/Reports';
import Help from '../components/Help';
import DeleteAccount from '../components/DeleteAccount';
import Admin from './admin/Admin';

interface Props {
  session: Session;
}

type TabId = 'reports' | 'shifts' | 'availability' | 'credentials' | 'find' | 'home' | 'messages' | 'account';

const CAREGIVER_TABS: Tab<TabId>[] = [
  { id: 'account', label: 'Me', icon: icons.person },
  { id: 'credentials', label: 'Credentials', icon: icons.shield },
  { id: 'availability', label: 'Free time', icon: icons.clock },
  { id: 'shifts', label: 'Shifts', icon: icons.shifts },
  { id: 'messages', label: 'Messages', icon: icons.chat },
];

const PROVIDER_TABS: Tab<TabId>[] = [
  { id: 'account', label: 'Me', icon: icons.person },
  { id: 'home', label: 'My home', icon: icons.home },
  { id: 'find', label: 'Who is free', icon: icons.search },
  { id: 'shifts', label: 'Shifts', icon: icons.shifts },
  { id: 'messages', label: 'Messages', icon: icons.chat },
  { id: 'reports', label: 'Reports', icon: icons.report },
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
  // Coming back from the payment page lands on My home, where the package is shown.
  const [tab, setTab] = useState<TabId>(() =>
    location.search.includes('billing=') ? 'home' : location.search.includes('open=messages') ? 'messages' : 'shifts',
  );
  // Messages the other person sent that this person has not opened yet.
  const [unread, setUnread] = useState<Unread[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  // Inside the Shifts tab: single shifts, or permanent jobs.
  const [work, setWork] = useState<'shifts' | 'jobs'>('shifts');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  async function loadHome() {
    if (!supabase) return;
    const { data } = await supabase.from('homes').select('*').eq('owner_id', userId).maybeSingle();
    setHome((data as HomeInfo | null) ?? null);
  }

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await withTimeout(
          supabase
            .from('profiles')
            .select('id, role, first_name, surname, sex, phone, address')
            .eq('id', userId)
            .maybeSingle(),
        );
        if (cancelled) return;
        if (err) setError(err.message);
        const p = data as Profile | null;
        setProfile(p);
        if (p?.role === 'provider') await withTimeout(loadHome());
        // Shows the admin button only to people on the admins list. Fails quietly if not set up.
        supabase.rpc('is_admin').then(({ data: admin }) => {
          if (!cancelled) setIsAdmin(admin === true);
        });
      } catch (e) {
        if (!cancelled) setError(messageOf(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function openThread(t: Thread) {
    setThread(t);
    setTab('messages');
  }

  async function loadUnread() {
    if (!supabase) return;
    const { data } = await supabase
      .from('messages')
      .select('shift_id, home_id, caregiver_id')
      .is('read_at', null)
      .neq('sender_id', userId);
    if (data) setUnread(data as Unread[]);
  }

  useEffect(() => {
    if (location.search.includes('open=messages')) history.replaceState(null, '', '/');
    loadUnread();
    const timer = window.setInterval(loadUnread, 20000);
    const onFocus = () => loadUnread();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId]);

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

  if (adminOpen && isAdmin) return <Admin onClose={() => setAdminOpen(false)} />;

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

        {tab === 'shifts' && (
          <div className="segmented work-switch" role="group" aria-label="Shifts or jobs">
            <button type="button" className={work === 'shifts' ? 'on' : ''} aria-pressed={work === 'shifts'} onClick={() => setWork('shifts')}>
              Shifts
            </button>
            <button type="button" className={work === 'jobs' ? 'on' : ''} aria-pressed={work === 'jobs'} onClick={() => setWork('jobs')}>
              Permanent jobs
            </button>
          </div>
        )}
        {tab === 'shifts' &&
          work === 'shifts' &&
          (isProvider ? (
            <ProviderShifts userId={userId} home={home} onOpenThread={openThread} onNeedHome={() => changeTab('home')} />
          ) : (
            <ShiftBoard userId={userId} onOpenThread={openThread} />
          ))}
        {tab === 'shifts' &&
          work === 'jobs' &&
          (isProvider ? (
            <ProviderJobs userId={userId} home={home} onOpenThread={openThread} onNeedHome={() => changeTab('home')} />
          ) : (
            <JobBoard userId={userId} />
          ))}
        {tab === 'reports' && <Reports userId={userId} home={home} onNeedHome={() => changeTab('home')} />}
        {tab === 'availability' && <Availability userId={userId} />}
        {tab === 'availability' && <LookingFor userId={userId} />}
        {tab === 'credentials' && <Credentials userId={userId} />}
        {tab === 'find' && (
          <FindCaregivers userId={userId} home={home} onOpenThread={openThread} onNeedHome={() => changeTab('home')} />
        )}
        {tab === 'home' && <HomeProfile userId={userId} home={home} onSaved={loadHome} />}
        {tab === 'home' && home && <Packages home={home} onChanged={loadHome} />}
        {tab === 'messages' && (
          <Messages
            unread={unread}
            onRead={loadUnread}
            userId={userId}
            role={profile.role}
            thread={thread}
            onOpenThread={openThread}
            onBack={() => setThread(null)}
            contact={{
              phone: (isProvider ? home?.phone : null) ?? profile.phone,
              email: session.user.email ?? null,
            }}
          />
        )}
        {tab === 'account' && (
          <PhotoPicker userId={userId} name={profile.first_name} isProvider={isProvider} />
        )}
        {tab === 'account' && <MyRecommendations userId={userId} isProvider={isProvider} />}
        {tab === 'account' && !isProvider && <MyArea userId={userId} />}
        {tab === 'account' && <ReportProblem userId={userId} />}
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
                  <dt>{/^[0-9]{5}$/.test(profile.address) ? 'ZIP code' : 'Address'}</dt>
                  <dd>{profile.address}</dd>
                </div>
              )}
            </dl>
            {isAdmin && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setAdminOpen(true);
                  window.scrollTo(0, 0);
                }}
              >
                Open the admin screen
              </button>
            )}
            <button type="button" className="btn secondary" onClick={() => supabase?.auth.signOut()}>
              Sign out
            </button>
            <Help />
            <DeleteAccount isProvider={isProvider} />
          </section>
        )}
      </main>
      <TabBar
        tabs={tabs.map((t) => (t.id === 'messages' ? { ...t, badge: unread.length } : t))}
        current={tab}
        onChange={changeTab}
      />
    </>
  );
}
