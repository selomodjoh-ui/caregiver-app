import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DAYS, PARTS, dateKey, daysAheadText, dayOf, isFreeOn, parseDate, todayText, type DateChange, type Part } from '../../lib/types';

interface Props {
  userId: string;
}

const keyOf = (day: number, part: Part) => `${day}-${part}`;
const DAYS_AHEAD = 14;

export default function Availability({ userId }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());
  const [datesReady, setDatesReady] = useState(false);
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
    supabase
      .from('availability_dates')
      .select('on_date, part, free')
      .eq('user_id', userId)
      .gte('on_date', todayText())
      .then(({ data, error: err }) => {
        // If this part of the database is not there yet, the usual week still works alone.
        if (err) return;
        setChanges(new Map(((data ?? []) as DateChange[]).map((x) => [dateKey(x.on_date, x.part), x.free])));
        setDatesReady(true);
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

  /** Flips one date. If the result matches the usual week again, the change is simply removed. */
  async function toggleDate(date: string, part: Part) {
    if (!supabase) return;
    const key = dateKey(date, part);
    const usual = picked.has(keyOf(dayOf(date), part));
    const want = !isFreeOn(picked, changes, date, part);

    const before = changes;
    const next = new Map(changes);
    if (want === usual) next.delete(key);
    else next.set(key, want);
    setChanges(next);
    setError('');

    const { error: err } =
      want === usual
        ? await supabase.from('availability_dates').delete().eq('user_id', userId).eq('on_date', date).eq('part', part)
        : await supabase.from('availability_dates').upsert({ user_id: userId, on_date: date, part, free: want });

    if (err) {
      setError(err.message);
      setChanges(before);
    }
  }

  async function clearChanges() {
    if (!supabase) return;
    const before = changes;
    setChanges(new Map());
    setError('');
    const { error: err } = await supabase.from('availability_dates').delete().eq('user_id', userId).gte('on_date', todayText());
    if (err) {
      setError(err.message);
      setChanges(before);
    }
  }

  const upcoming = Array.from({ length: DAYS_AHEAD }, (_, n) => daysAheadText(n));
  const changedCount = upcoming.reduce(
    (count, date) => count + PARTS.filter(({ part }) => changes.has(dateKey(date, part))).length,
    0,
  );

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
          <h3 className="week-title">My usual week</h3>
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

          {datesReady && (
            <>
              <h3 className="week-title">The next two weeks</h3>
              <p className="hint">
                These dates follow your usual week. Going away, or free for one extra shift? Tap that
                date. It changes that date only.
              </p>
              <div className="week dates">
                <div className="week-row week-head" aria-hidden="true">
                  <span />
                  {PARTS.map((p) => (
                    <span key={p.part}>{p.label}</span>
                  ))}
                </div>
                {upcoming.map((date, n) => {
                  const d = parseDate(date);
                  const long = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                  return (
                    <div key={date} className="week-row" role="group" aria-label={long}>
                      <span className="week-day date-day">
                        <small>{n === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}</small>
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {PARTS.map(({ part, label }) => {
                        const on = isFreeOn(picked, changes, date, part);
                        const changed = changes.has(dateKey(date, part));
                        return (
                          <button
                            key={part}
                            type="button"
                            className={`slot ${on ? 'on' : ''} ${changed ? 'changed' : ''}`}
                            aria-pressed={on}
                            aria-label={`${long} ${label.toLowerCase()}${changed ? ', changed for this date' : ''}`}
                            onClick={() => toggleDate(date, part)}
                          >
                            {on ? 'Free' : changed ? 'Away' : 'Off'}
                            {changed && <span className="slot-note">this date only</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {changedCount > 0 && (
                <p className="hint">
                  You changed {changedCount} {changedCount === 1 ? 'slot' : 'slots'} from your usual week.{' '}
                  <button type="button" className="link" onClick={clearChanges}>
                    Go back to my usual week
                  </button>
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
