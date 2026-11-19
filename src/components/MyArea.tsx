import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { pointOf, roughly, type Point } from '../lib/geo';
import LocationPicker from './LocationPicker';

/** Lets a caregiver share, change or remove the general area they live in. */
export default function MyArea({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<Point | null>(null);
  const [draft, setDraft] = useState<Point | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('caregiver_areas')
      .select('lat, lng')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const p = pointOf(data);
        setSaved(p);
        setDraft(p);
      });
  }, [userId]);

  async function save() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const res = draft
      ? await supabase
          .from('caregiver_areas')
          .upsert({ user_id: userId, ...draft, updated_at: new Date().toISOString() })
      : await supabase.from('caregiver_areas').delete().eq('user_id', userId);
    setBusy(false);
    if (res.error) {
      setError(
        res.error.message.includes('caregiver_areas')
          ? 'The map is not switched on yet. Please try again later.'
          : res.error.message,
      );
      return;
    }
    setSaved(draft);
    setOpen(false);
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <section className="section">
      <h2>Your area</h2>
      <p className="hint">
        Share the general area you live in to see how far each shift is and to let homes nearby find you. Homes see a
        circle about a mile wide. They never see your address, and you can remove it at any time.
      </p>
      <span className={`chip ${saved ? 'ok' : ''}`}>{saved ? 'Area shared' : 'Not shared'}</span>
      {!open ? (
        <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
          {saved ? 'Change or remove my area' : 'Choose my area'}
        </button>
      ) : (
        <>
          <LocationPicker
            mode="area"
            label="Map for choosing your area. Tap to place the circle."
            value={draft}
            onChange={(p) => setDraft(p ? roughly(p) : null)}
          />
          <p className="hint">Tap the map near where you live, or use the button above it.</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn" disabled={busy || !changed} onClick={save}>
            {busy ? 'Saving…' : draft ? 'Save my area' : 'Stop sharing my area'}
          </button>
        </>
      )}
    </section>
  );
}
