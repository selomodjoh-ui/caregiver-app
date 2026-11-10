import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DAYS, PARTS, type Part } from '../../lib/types';

interface Props {
  userId: string;
}

const keyOf = (day: number, part: Part) => `${day}-${part}`;

export default function Availability({ userId }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('availability')
      .select('day, part')
      .eq('user_id', userId)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setPicked(new Set((data ?? []).map((r) => keyOf(r.day as number, r.part as Part))));
        setLoaded(true);
      });
  }, [userId]);

  async function toggle(day: number, part: Part) {
    if (!supabase) return;
    const key = keyOf(day, part);
    const wasOn = picked.has(key);

    // Change the screen straight away, then save. Undo if saving fails.
    const next = new Set(picked);
    if (wasOn) next.delete(key);
    else next.add(key);
    setPicked(next);
    setError('');

    const { error: err } = wasOn
      ? await supabase.from('availability').delete().eq('user_id', userId).eq('day', day).eq('part', part)
      : await supabase.from('availability').insert({ user_id: userId, day, part });

    if (err) {
      setError(err.message);
      setPicked(picked);
    }
  }

  return (
    <section className="section">
      <h2>When are you free?</h2>
      <p className="hint">
        Tap the day or night shifts you can work outside your regular job. Homes search by these,
        and each tap saves by itself.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loaded ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          <div className="week">
            <div className="week-row week-head" aria-hidden="true">
              <span />
              {PARTS.map((p) => (
                <span key={p.part}>{p.label}</span>
              ))}
            </div>
            {DAYS.map(({ day, short, full }) => (
              <div key={day} className="week-row" role="group" aria-label={full}>
                <span className="week-day">{short}</span>
                {PARTS.map(({ part, label }) => {
                  const on = picked.has(keyOf(day, part));
                  return (
                    <button
                      key={part}
                      type="button"
                      className={`slot ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${full} ${label.toLowerCase()}`}
                      onClick={() => toggle(day, part)}
                    >
                      {on ? 'Free' : 'Off'}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="hint">
            {picked.size === 0
              ? 'Nothing marked yet. Homes cannot find you until you mark a time.'
              : `You have marked ${picked.size} open ${picked.size === 1 ? 'slot' : 'slots'} each week.`}
          </p>
        </>
      )}
    </section>
  );
}
