import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase, type Role } from '../lib/supabase';
import { shiftTitle, type Application, type CaregiverCard, type Shift, type Thread } from '../lib/types';

interface Props {
  userId: string;
  role: Role;
  thread: Thread | null;
  onOpenThread: (thread: Thread) => void;
  onBack: () => void;
}

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

const POLL_MS = 5000;

export default function Messages({ userId, role, thread, onOpenThread, onBack }: Props) {
  return thread ? (
    <Conversation userId={userId} thread={thread} onBack={onBack} />
  ) : (
    <ThreadList userId={userId} role={role} onOpenThread={onOpenThread} />
  );
}

function ThreadList({ userId, role, onOpenThread }: Pick<Props, 'userId' | 'role' | 'onOpenThread'>) {
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
            title: shift.homes?.name ?? 'The home',
            subtitle: shiftTitle(shift),
          })),
        );
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
        const people = [...new Set(apps.map((x) => x.caregiver_id))];
        const c = people.length
          ? await supabase.from('caregiver_cards').select('id, first_name, surname_initial').in('id', people)
          : { data: [] };
        const cards = (c.data ?? []) as CaregiverCard[];
        setThreads(
          apps.map((app) => {
            const shift = shifts.find((x) => x.id === app.shift_id)!;
            const card = cards.find((x) => x.id === app.caregiver_id);
            return {
              shiftId: app.shift_id,
              caregiverId: app.caregiver_id,
              title: card ? `${card.first_name} ${card.surname_initial}.` : 'Caregiver',
              subtitle: shiftTitle(shift),
            };
          }),
        );
      }
      setLoaded(true);
    }
    load();
  }, [userId, role]);

  return (
    <section className="section">
      <h2>Messages</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded ? (
        <p className="hint">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="hint">
          {role === 'caregiver'
            ? 'No conversations yet. Apply for a shift and you can message the home.'
            : 'No conversations yet. When someone applies, or you offer a shift, you can message them here.'}
        </p>
      ) : (
        <ul className="list">
          {threads.map((t) => (
            <li key={`${t.shiftId}-${t.caregiverId}`}>
              <button type="button" className="card-button" onClick={() => onOpenThread(t)}>
                <span className="list-title">{t.title}</span>
                <span className="hint">About: {t.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Conversation({ userId, thread, onBack }: Pick<Props, 'userId' | 'onBack'> & { thread: Thread }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  async function load() {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('shift_id', thread.shiftId)
      .eq('caregiver_id', thread.caregiverId)
      .order('created_at');
    if (err) setError(err.message);
    else setMessages((data ?? []) as Message[]);
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [thread.shiftId, thread.caregiverId]);

  // Scroll to the newest message when one arrives.
  useEffect(() => {
    if (messages.length !== count.current) {
      count.current = messages.length;
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('messages').insert({
      shift_id: thread.shiftId,
      caregiver_id: thread.caregiverId,
      sender_id: userId,
      body,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft('');
    load();
  }

  return (
    <section className="section chat">
      <button type="button" className="link" onClick={onBack}>
        Back to messages
      </button>
      <div>
        <h2>{thread.title}</h2>
        <p className="hint">About: {thread.subtitle}</p>
      </div>

      <div className="bubbles" aria-live="polite">
        {messages.length === 0 && <p className="hint">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''}`}>
              <span className="who">{mine ? 'You' : thread.title}</span>
              <p>{m.body}</p>
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
    </section>
  );
}
