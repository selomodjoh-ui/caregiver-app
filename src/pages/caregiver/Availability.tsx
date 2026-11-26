import { useEffect, useState } from 'react';
import Skeleton from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { DAYS, PARTS, dateKey, daysAheadText, dayOf, isFreeOn, parseDate, todayText, type DateChange, type Part } from '../../lib/types';

interface Props {
  userId: string;
}

const keyOf = (day: number, part: Part) => `${day}-${part}`;
const DAYS_AHEAD = 28;

const weekOf = (days: number[], parts: Part[]) => new Set(days.flatMap((d) => parts.map((p) => keyOf(d, p))));
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
/** One-tap ways to fill the usual week. */
const QUICK: { label: string; keys: Set<string> }[] = [
  { label: 'Any time', keys: weekOf(ALL_DAYS, ['day', 'night']) },
  { label: 'Weekdays', keys: weekOf([1, 2, 3, 4, 5], ['day']) },
  { label: 'Weekends', keys: weekOf([6, 0], ['day', 'night']) },
  { label: 'Every night', keys: weekOf(ALL_DAYS, ['night']) },
];

export default function Availability({ userId }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());
  const [datesReady, setDatesReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [openDate, setOpenDate] = useState('');

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

  /** Sets the whole usual week in one go: adds what is missing, removes the rest. */
  async function applyWeek(target: Set<string>) {
    if (!supabase) return;
    const before = picked;
    const add = [...target].filter((k) => !before.has(k));
    const drop = [...before].filter((k) => !target.has(k));
    if (add.length === 0 && drop.length === 0) return;
    setPicked(new Set(target));
    setError('');
    const split = (k: string) => ({ day: Number(k.split('-')[0]), part: k.split('-')[1] as Part });
    const db = supabase;
    const results = await Promise.all([
      ...(add.length ? [db.from('availability').insert(add.map((k) => ({ user_id: userId, ...split(k) })))] : []),
      ...drop.map((k) => db.from('availability').delete().eq('user_id', userId).eq('day', split(k).day).eq('part', split(k).part)),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setError(failed.error.message);
      // Read back what was really saved, so the screen never shows a guess.
      const { data } = await db.from('availability').select('day, part').eq('user_id', userId);
      setPicked(data ? new Set(data.map((r) => keyOf(r.day as number, r.part as Part))) : before);
    }
  }

  const upcoming = Array.from({ length: DAYS_AHEAD }, (_, n) => daysAheadText(n));
  /** A date counts as changed only while it differs from the usual week. */
  const isChanged = (date: string, part: Part) => {
    const c = changes.get(dateKey(date, part));
    return c !== undefined && c !== picked.has(keyOf(dayOf(date), part));
  };
  const changedDates = upcoming.filter((date) => PARTS.some(({ part }) => isChanged(date, part)));

  const dayCount = DAYS.filter(({ day }) => picked.has(keyOf(day, 'day'))).length;
  const nightCount = DAYS.filter(({ day }) => picked.has(keyOf(day, 'night'))).length;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const summary =
    picked.size === 0
      ? 'Nothing marked yet. Homes cannot find you until you mark a time.'
      : `You are free for ${count(picked.size, 'shift')} a week: ${[
          dayCount ? count(dayCount, 'day') : '',
          nightCount ? count(nightCount, 'night') : '',
        ]
          .filter(Boolean)
          .join(' and ')}.`;

  const statusOf = (day: number) => {
    const d = picked.has(keyOf(day, 'day'));
    const n = picked.has(keyOf(day, 'night'));
    return d && n ? 'Day and night' : d ? 'Day only' : n ? 'Night only' : 'Off';
  };

  const sameSet = (a: Set<string>) => a.size === picked.size && [...a].every((k) => picked.has(k));
  const longDate = (date: string) => parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const open = openDate && upcoming.includes(openDate) ? openDate : upcoming[0];

  return (
    <section className="section">
      <h2>When are you free?</h2>
      <p className="hint">Homes search by the times you mark here. Each tap saves by itself.</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loaded ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <p className={`free-summary ${picked.size === 0 ? 'none' : ''}`} role="status">
            {summary}
          </p>

          <h3 className="week-title">My usual week</h3>
          <div className="filter-chips quick-week" role="group" aria-label="Quick ways to fill your week">
            {QUICK.map((q) => {
              const on = picked.size > 0 && sameSet(q.keys);
              return (
                <button key={q.label} type="button" className={`chip pick ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => applyWeek(q.keys)}>
                  {q.label}
                </button>
              );
            })}
            {picked.size > 0 && (
              <button type="button" className="chip pick" onClick={() => applyWeek(new Set())}>
                Clear all
              </button>
            )}
          </div>
          <div className="day-list">
            {DAYS.map(({ day, full }) => (
              <div key={day} className="day-row" role="group" aria-label={`${full}: ${statusOf(day)}`}>
                <span className="day-name">
                  <strong>{full}</strong>
                  <small className={statusOf(day) === 'Off' ? 'off' : ''}>{statusOf(day)}</small>
                </span>
                {PARTS.map(({ part, label }) => {
                  const on = picked.has(keyOf(day, part));
                  return (
                    <button
                      key={part}
                      type="button"
                      className={`part-pick ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${full} ${label.toLowerCase()}`}
                      onClick={() => toggle(day, part)}
                    >
                      {on && <Tick />}
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {datesReady && (
            <>
              <h3 className="week-title">The next four weeks</h3>
              <p className="hint">
                These dates follow your usual week. Going away, or free for one extra shift? Tap the date and change
                that date only.
              </p>
              <div className="month">
                <div className="month-row month-head" aria-hidden="true">
                  {upcoming.slice(0, 7).map((date) => (
                    <span key={date}>{parseDate(date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  ))}
                </div>
                <div className="month-row" role="group" aria-label="Dates in the next four weeks">
                  {upcoming.map((date, n) => {
                    const d = parseDate(date);
                    const day = isFreeOn(picked, changes, date, 'day');
                    const night = isFreeOn(picked, changes, date, 'night');
                    const changed = changedDates.includes(date);
                    const state = day && night ? 'day and night' : day ? 'day only' : night ? 'night only' : 'off';
                    return (
                      <button
                        key={date}
                        type="button"
                        className={`date-cell ${day || night ? 'free' : ''} ${changed ? 'changed' : ''} ${date === open ? 'open' : ''}`}
                        aria-pressed={date === open}
                        aria-label={`${longDate(date)}, ${state}${changed ? ', changed for this date' : ''}`}
                        onClick={() => setOpenDate(date)}
                      >
                        <small>{n === 0 ? 'Today' : d.getDate() === 1 || n === 0 ? d.toLocaleDateString('en-US', { month: 'short' }) : ' '}</small>
                        <b>{d.getDate()}</b>
                        <span className="date-marks">{day && night ? 'D N' : day ? 'D' : night ? 'N' : 'Off'}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="month-key">D is a day shift, N is a night shift. A gold edge marks a date you changed.</p>
              </div>

              <div className="date-panel" role="group" aria-label={longDate(open)}>
                <strong>{open === upcoming[0] ? `Today, ${longDate(open)}` : longDate(open)}</strong>
                <div className="date-panel-row">
                  {PARTS.map(({ part, label }) => {
                    const on = isFreeOn(picked, changes, open, part);
                    const changed = isChanged(open, part);
                    return (
                      <button
                        key={part}
                        type="button"
                        className={`slot ${on ? 'on' : ''} ${changed ? 'changed' : ''}`}
                        aria-pressed={on}
                        aria-label={`${longDate(open)} ${label.toLowerCase()}${changed ? ', changed for this date' : ''}`}
                        onClick={() => toggleDate(open, part)}
                      >
                        {label}: {on ? 'Free' : changed ? 'Away' : 'Off'}
                        {changed && <span className="slot-note">this date only</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {changedDates.length > 0 && (
                <p className="hint">
                  You changed {count(changedDates.length, 'date')} from your usual week.{' '}
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

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
