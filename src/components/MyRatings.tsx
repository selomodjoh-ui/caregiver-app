import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RatingLine, Stars, type RatingSummary } from './Rating';

interface FeedItem {
  stars: number;
  comment: string | null;
  created_at: string;
  written_by: string;
}

/** The signed-in person's own rating and the comments others left. */
export default function MyRatings({ userId }: { userId: string }) {
  const [summary, setSummary] = useState<RatingSummary | undefined>();
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('rating_summary')
      .select('ratee_id, average, total')
      .eq('ratee_id', userId)
      .maybeSingle()
      .then(({ data }) => setSummary((data as RatingSummary | null) ?? undefined));
    supabase
      .from('rating_feed')
      .select('stars, comment, created_at, written_by')
      .eq('ratee_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setFeed((data ?? []) as FeedItem[]));
  }, [userId]);

  return (
    <section className="section">
      <h2>Your rating</h2>
      <RatingLine summary={summary} />
      {feed.length > 0 && (
        <ul className="list">
          {feed.map((item, i) => (
            <li key={i}>
              <div className="feed-item">
                <Stars value={item.stars} />
                {item.comment && <p>{item.comment}</p>}
                <span className="hint">{item.written_by}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
