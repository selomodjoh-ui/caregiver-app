import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export interface RatingSummary {
  ratee_id: string;
  average: number;
  total: number;
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z" />
    </svg>
  );
}

/** "4.8 from 12 shifts", or a note that there are no ratings yet. */
export function RatingLine({ summary }: { summary: RatingSummary | undefined }) {
  if (!summary) return <span className="rating none">No ratings yet</span>;
  return (
    <span className="rating">
      <span className="star-on">
        <Star filled />
      </span>
      {Number(summary.average).toFixed(1)} from {summary.total} {summary.total === 1 ? 'shift' : 'shifts'}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="stars-row" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'star-on' : 'star-off'}>
          <Star filled={n <= value} />
        </span>
      ))}
    </span>
  );
}

interface FormProps {
  shiftId: string;
  raterId: string;
  rateeId: string;
  /** Who is being rated, for the heading: "Rate Sunrise Home". */
  name: string;
  onDone: () => void;
}

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function RatingForm({ shiftId, raterId, rateeId, name, onDone }: FormProps) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || stars === 0) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('ratings').insert({
      shift_id: shiftId,
      rater_id: raterId,
      ratee_id: rateeId,
      stars,
      comment: comment.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone();
  }

  return (
    <form className="rate" onSubmit={submit}>
      <span className="legend" id={`rate-${shiftId}`}>
        Rate {name}
      </span>
      <div className="star-picker" role="group" aria-labelledby={`rate-${shiftId}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= stars ? 'on' : ''}
            aria-pressed={n === stars}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            onClick={() => setStars(n)}
          >
            <Star filled={n <= stars} />
          </button>
        ))}
      </div>
      <span className="hint">{stars === 0 ? 'Tap a star.' : WORDS[stars]}</span>
      <div className="field">
        <label htmlFor={`rate-c-${shiftId}`}>A few words (optional)</label>
        <textarea
          id={`rate-c-${shiftId}`}
          rows={2}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <span className="hint">Others will see this. No resident names or health details.</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy || stars === 0}>
        {busy ? 'Sending…' : 'Send rating'}
      </button>
    </form>
  );
}
