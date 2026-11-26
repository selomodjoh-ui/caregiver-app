import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Empty from '../components/Empty';
import Skeleton from '../components/Skeleton';
import { supabase, type Role } from '../lib/supabase';
import { announce } from '../lib/push';
import PushToggle from '../components/PushToggle';
import Avatar from '../components/Avatar';
import { shiftTitle, type Application, type CaregiverCard, type Shift, type Thread } from '../lib/types';

interface Props {
  userId: string;
  role: Role;
  thread: Thread | null;
  onOpenThread: (thread: Thread) => void;
  onBack: () => void;
  /** The signed-in person's own contact details, which they may choose to share. */
  contact: Contact;
  /** Unopened messages from other people, one entry per message. */
  unread: Unread[];
  /** Called after a conversation has been marked read. */
  onRead: () => void;
}

export interface Unread {
  shift_id: string | null;
  home_id: string | null;
  caregiver_id: string;
}

/** How many unopened messages belong to one conversation. */
function unreadIn(thread: Thread, unread: Unread[]): number {
  return unread.filter(
    (m) =>
      m.caregiver_id === thread.caregiverId &&
      (thread.shiftId ? m.shift_id === thread.shiftId : m.shift_id === null && m.home_id === (thread.homeId ?? null)),
  ).length;
}

export interface Contact {
  phone: string | null;
  email: string | null;
}

/** Shows a message, turning "Phone:" and "Email:" lines into links you can tap. */
function renderBody(body: string): ReactNode {
  return body.split('\n').map((line, i) => {
    const phone = line.match(/^Phone: (.+)$/);
    const email = line.match(/^Email: (\S+@\S+)$/);
    let content: ReactNode = line;
    if (phone) {
      content = (
        <>
          Phone: <a href={`tel:${phone[1].replace(/[^0-9+]/g, '')}`}>{phone[1]}</a>
        </>
      );
    } else if (email) {
      content = (
        <>
          Email: <a href={`mailto:${email[1]}`}>{email[1]}</a>
        </>
      );
    }
    return (
      <span key={i}>
        {i > 0 && <br />}
        {content}
      </span>
    );
  });
}

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

const POLL_MS = 5000;

export default function Messages({ userId, role, thread, onOpenThread, onBack, contact, unread, onRead }: Props) {
  return thread ? (
    <Conversation userId={userId} thread={thread} onBack={onBack} contact={contact} onRead={onRead} />
  ) : (
    <ThreadList userId={userId} role={role} onOpenThread={onOpenThread} unread={unread} />
  );
}

function ThreadList({ userId, role, onOpenThread, unread }: Pick<Props, 'userId' | 'role' | 'onOpenThread' | 'unread'>) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!supabase) return;
      if (role === 'caregiver') {
        const a = await supabase
          .from('applications')
          .select('id, shift_id, caregiver_id, status')
          .eq('caregiver_id', userId)
          .neq('status', 'withdrawn');
        if (a.error) setError(a.error.message);
        const apps = (a.data ?? []) as Application[];
        const ids = apps.map((x) => x.shift_id);
        const s = ids.length
          ? await supabase.from('shifts').select('*, homes(*)').in('id', ids).order('shift_date')
          : { data: [] };
        setThreads(
          ((s.data ?? []) as Shift[]).map((shift) => ({
            shiftId: shift.id,
            caregiverId: userId,
            photoId: shift.home_id,
            title: shift.homes?.name ?? 'The home',
            subtitle: shiftTitle(shift),
          })),
        );
        const d = await supabase.from('messages').select('home_id').is('shift_id', null).eq('caregiver_id', userId);
        const homeIds = [...new Set((d.data ?? []).map((x) => x.home_id as string))];
        if (homeIds.length > 0) {
          const h = await supabase.from('homes').select('owner_id, name').in('owner_id', homeIds);
          const direct = homeIds.map((id) => ({
            shiftId: null,
            homeId: id,
            caregiverId: userId,
            photoId: id,
            title: (h.data ?? []).find((x) => x.owner_id === id)?.name ?? 'A care home',
            subtitle: 'Direct conversation',
          }));
          setThreads((list) => [...direct, ...list]);
        }
      } else {
        const s = await supabase.from('shifts').select('*').eq('home_id', userId).order('shift_date');
        if (s.error) setError(s.error.message);
        const shifts = (s.data ?? []) as Shift[];
        const ids = shifts.map((x) => x.id);
        const a = ids.length
          ? await supabase
              .from('applications')
              .select('id, shift_id, caregiver_id, status')
              .in('shift_id', ids)
              .neq('status', 'withdrawn')
          : { data: [] };
        const apps = (a.data ?? []) as Application[];
        const d = await supabase.from('messages').select('caregiver_id').is('shift_id', null).eq('home_id', userId);
        const directIds = [...new Set((d.data ?? []).map((x) => x.caregiver_id as string))];
        const people = [...new Set([...apps.map((x) => x.caregiver_id), ...directIds])];
        const c = people.length
          ? await supabase.from('caregiver_cards').select('id, first_name, surname_initial').in('id', people)
          : { data: [] };
        const cards = (c.data ?? []) as CaregiverCard[];
        const nameOf = (id: string) => {
          const card = cards.find((x) => x.id === id);
          return card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver';
        };
        setThreads([
          ...directIds.map((id) => ({
            shiftId: null,
            homeId: userId,
            caregiverId: id,
            photoId: id,
            title: nameOf(id),
            subtitle: 'Direct conversation',
          })),
          ...apps.map((app) => {
            const shift = shifts.find((x) => x.id === app.shift_id)!;
            const card = cards.find((x) => x.id === app.caregiver_id);
            return {
              shiftId: app.shift_id,
              caregiverId: app.caregiver_id,
              photoId: app.caregiver_id,
              title: card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver',
              subtitle: shiftTitle(shift),
            };
          }),
        ]);
      }
      setLoaded(true);
    }
    load();
  }, [userId, role]);

  return (
    <section className="section">
      <h2>Messages</h2>
      <PushToggle />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded ? (
        <Skeleton rows={3} label="Loading messages" />
      ) : threads.length === 0 ? (
        <Empty icon="chat" title="No conversations yet">
          {role === 'caregiver'
            ? 'Apply for a shift and you can message the home.'
            : 'When someone applies, or you offer a shift, you can message them here.'}
        </Empty>
      ) : (
        <ul className="list">
          {[...threads]
            .sort((a, b) => Number(unreadIn(b, unread) > 0) - Number(unreadIn(a, unread) > 0))
            .map((t) => {
              const count = unreadIn(t, unread);
              return (
                <li key={`${t.shiftId}-${t.homeId}-${t.caregiverId}`} className={count > 0 ? 'unread' : ''}>
                  <button type="button" className="card-button with-avatar" onClick={() => onOpenThread(t)}>
                    <Avatar userId={t.photoId} name={t.title} />
                    <span className="list-main">
                      <span className="card-top">
                        <span className="list-title">{t.title}</span>
                        {count > 0 && (
                          <span className="unread-count">
                            {count} new<span className="visually-hidden"> {count === 1 ? 'message' : 'messages'}</span>
                          </span>
                        )}
                      </span>
                      <span className="hint">{t.shiftId ? `About: ${t.subtitle}` : t.subtitle}</span>
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

function Conversation({
  userId,
  thread,
  onBack,
  contact,
  onRead,
}: Pick<Props, 'userId' | 'onBack' | 'contact' | 'onRead'> & { thread: Thread }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sharePhone, setSharePhone] = useState(true);
  const [shareEmail, setShareEmail] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const seen = useRef(-1);

  async function load() {
    if (!supabase) return;
    const base = supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('caregiver_id', thread.caregiverId);
    const scoped = thread.shiftId
      ? base.eq('shift_id', thread.shiftId)
      : base.is('shift_id', null).eq('home_id', thread.homeId ?? '');
    const { data, error: err } = await scoped.order('created_at');
    if (err) setError(err.message);
    else {
      const list = (data ?? []) as Message[];
      setMessages(list);
      // Anything the other person wrote counts as read once it is on screen.
      if (list.some((m) => m.sender_id !== userId) && list.length !== seen.current) {
        seen.current = list.length;
        await supabase.rpc('mark_thread_read', {
          p_shift: thread.shiftId,
          p_home: thread.shiftId ? null : (thread.homeId ?? null),
          p_caregiver: thread.caregiverId,
        });
        onRead();
      }
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [thread.shiftId, thread.homeId, thread.caregiverId]);

  // Scroll to the newest message when one arrives.
  useEffect(() => {
    if (messages.length !== count.current) {
      count.current = messages.length;
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (await sendBody(body)) setDraft('');
  }

  async function shareContact() {
    const lines = ['My contact details'];
    if (sharePhone && contact.phone) lines.push(`Phone: ${contact.phone}`);
    if (shareEmail && contact.email) lines.push(`Email: ${contact.email}`);
    if (lines.length === 1) return;
    if (await sendBody(lines.join('\n'))) setSharing(false);
  }

  async function sendBody(body: string): Promise<boolean> {
    if (!supabase) return false;
    setBusy(true);
    setError('');
    const { data: saved, error: err } = await supabase
      .from('messages')
      .insert({
        shift_id: thread.shiftId,
        home_id: thread.shiftId ? null : thread.homeId,
        caregiver_id: thread.caregiverId,
        sender_id: userId,
        body,
      })
      .select('id')
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    if (saved?.id) announce(saved.id as string);
    load();
    return true;
  }

  const canShare = (sharePhone && !!contact.phone) || (shareEmail && !!contact.email);

  return (
    <section className="section chat">
      <button type="button" className="link" onClick={onBack}>
        Back to messages
      </button>
      <div className="person">
        <Avatar
          userId={thread.photoId ?? (userId === thread.caregiverId ? thread.homeId : thread.caregiverId)}
          name={thread.title}
        />
        <div>
          <h2>{thread.title}</h2>
          <p className="hint">{thread.shiftId ? `About: ${thread.subtitle}` : thread.subtitle}</p>
        </div>
      </div>

      <div className="bubbles" aria-live="polite">
        {messages.length === 0 && <p className="hint">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''}`}>
              <span className="who">{mine ? 'You' : thread.title}</span>
              <p>{renderBody(m.body)}</p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <p className="hint">Keep resident names and health details out of chat.</p>
      <form className="composer" onSubmit={send}>
        <label htmlFor="chat-msg" className="sr-only">
          Message
        </label>
        <input
          id="chat-msg"
          value={draft}
          maxLength={2000}
          placeholder="Write a message"
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn small send" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>

      {!sharing ? (
        <button type="button" className="link" onClick={() => setSharing(true)}>
          Share my contact details
        </button>
      ) : (
        <div className="share">
          <span className="legend">Share with {thread.title}</span>
          <fieldset className="checks">
            <legend className="sr-only">What to share</legend>
            {contact.phone ? (
              <label>
                <input type="checkbox" checked={sharePhone} onChange={(e) => setSharePhone(e.target.checked)} />
                Phone: {contact.phone}
              </label>
            ) : (
              <p className="hint">There is no phone number on your profile.</p>
            )}
            {contact.email && (
              <label>
                <input type="checkbox" checked={shareEmail} onChange={(e) => setShareEmail(e.target.checked)} />
                Email: {contact.email}
              </label>
            )}
          </fieldset>
          <p className="hint">This is your choice. Once sent, it cannot be taken back.</p>
          <div className="row">
            <button type="button" className="btn secondary" onClick={() => setSharing(false)}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={busy || !canShare} onClick={shareContact}>
              Share
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
