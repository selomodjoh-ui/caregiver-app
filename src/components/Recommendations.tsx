import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/types';

export interface RecSummary {
  subject_id: string;
  total: number;
}

/** One row of the recommendations table, as the two people involved see it. */
export interface Rec {
  id: string;
  subject_id: string;
  author_id: string;
  body: string | null;
  status: 'requested' | 'declined' | 'written' | 'shown' | 'hidden';
  created_at: string;
  written_at: string | null;
}

interface FeedItem {
  body: string;
  written_at: string | null;
  written_by: string;
}

/** The date of a timestamp where the reader is, in the app's usual wording. */
export function stampDay(stamp: string): string {
  const d = new Date(stamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return formatDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

const countText = (n: number) => `${n} ${n === 1 ? 'recommendation' : 'recommendations'}`;

/** "2 recommendations", or a note that there are none yet. */
export function RecLine({ total }: { total: number | undefined }) {
  if (!total) return <span className="rating none">No recommendations yet</span>;
  return <span className="rating">{countText(total)}</span>;
}

/** The count, and a link that opens what people wrote. */
export function RecList({ subjectId, total }: { subjectId: string | undefined; total: number | undefined }) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);

  if (!subjectId || !total) return <RecLine total={0} />;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && feed === null && supabase) {
      const { data } = await supabase
        .from('recommendation_feed')
        .select('body, written_at, written_by')
        .eq('subject_id', subjectId)
        .order('written_at', { ascending: false })
        .limit(20);
      setFeed((data ?? []) as FeedItem[]);
    }
  }

  return (
    <>
      <button type="button" className="link rec-toggle" aria-expanded={open} onClick={toggle}>
        {open ? 'Hide recommendations' : `Read ${countText(total)}`}
      </button>
      {open && feed === null && <span className="hint">Loading…</span>}
      {open && feed && (
        <ul className="rec-feed">
          {feed.map((item, i) => (
            <li key={i}>
              <p>{item.body}</p>
              <span className="hint">
                {item.written_by}
                {item.written_at ? `, ${stampDay(item.written_at)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface AskProps {
  userId: string;
  otherId: string;
  name: string;
  /** Recommendations about the signed-in person, to tell whether this one was already asked for. */
  mine: Pick<Rec, 'author_id' | 'status'>[];
  onDone: () => void;
}

/** Shown after a shift: ask the other side for a recommendation. */
export function AskRec({ userId, otherId, name, mine, onDone }: AskProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = mine.find((r) => r.author_id === otherId);

  if (existing) {
    const written = existing.status === 'written' || existing.status === 'shown' || existing.status === 'hidden';
    return (
      <p className="hint">
        {written
          ? `${name} wrote you a recommendation. Open the Me tab to read it and choose whether to show it.`
          : `You asked ${name} for a recommendation.`}
      </p>
    );
  }

  async function ask() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('recommendations').insert({ subject_id: userId, author_id: otherId });
    setBusy(false);
    if (err && err.code !== '23505') {
      setError('We could not send that request. Please try again.');
      return;
    }
    onDone();
  }

  return (
    <div className="rec-ask">
      <button type="button" className="btn small secondary" disabled={busy} onClick={ask}>
        {busy ? 'Asking…' : `Ask ${name} for a recommendation`}
      </button>
      <span className="hint">They write a few sentences, and you choose whether it shows on your profile.</span>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
