import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { stampDay, type Rec } from './Recommendations';

interface Contact {
  id: string;
  name: string;
}

/**
 * Everything about recommendations for the signed-in person: requests waiting
 * for them to write, what others wrote about them, who they can ask, and what
 * they have written.
 */
export default function MyRecommendations({ userId, isProvider }: { userId: string; isProvider: boolean }) {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const [r, c] = await Promise.all([
      supabase
        .from('recommendations')
        .select('id, subject_id, author_id, body, status, created_at, written_at')
        .order('created_at', { ascending: false }),
      supabase.rpc('recommendation_contacts'),
    ]);
    setRecs((r.data ?? []) as Rec[]);
    setContacts((c.data ?? []) as Contact[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? (isProvider ? 'A caregiver' : 'A home');

  async function change(rec: Rec, patch: Partial<Pick<Rec, 'status' | 'body'>>) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('recommendations').update(patch).eq('id', rec.id);
    setBusy(false);
    if (err) setError('We could not save that. Please try again.');
    load();
  }

  async function ask(id: string) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('recommendations').insert({ subject_id: userId, author_id: id });
    setBusy(false);
    if (err && err.code !== '23505') setError('We could not send that request. Please try again.');
    load();
  }

  const toWrite = recs.filter((r) => r.author_id === userId && r.status === 'requested');
  const aboutMe = recs.filter((r) => r.subject_id === userId && r.body && r.status !== 'requested' && r.status !== 'declined');
  const asked = recs.filter((r) => r.subject_id === userId);
  const iWrote = recs.filter((r) => r.author_id === userId && r.body && r.status !== 'declined');
  const canAsk = contacts.filter((c) => !asked.some((r) => r.author_id === c.id));
  const waiting = asked.filter((r) => r.status === 'requested' || r.status === 'declined');
  const other = isProvider ? 'caregiver' : 'home';

  return (
    <section className="section">
      <h2>Recommendations</h2>
      <p className="hint">
        A recommendation is a few sentences from a {other} you have worked with. It is only written when you ask, and
        it only shows on your profile if you say so.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {toWrite.length > 0 && (
        <>
          <h3>Asked of you</h3>
          <ul className="list">
            {toWrite.map((rec) => {
              const draft = drafts[rec.id] ?? '';
              const short = draft.trim().length < 20;
              return (
                <li key={rec.id}>
                  <div className="rec-card">
                    <span className="list-title">{nameOf(rec.subject_id)} asked you for a recommendation</span>
                    <div className="field">
                      <label htmlFor={`rec-${rec.id}`}>What would you tell another {isProvider ? 'home' : 'caregiver'}?</label>
                      <textarea
                        id={`rec-${rec.id}`}
                        rows={3}
                        maxLength={1000}
                        value={draft}
                        onChange={(e) => setDrafts((d) => ({ ...d, [rec.id]: e.target.value }))}
                      />
                      <span className="hint">
                        At least a sentence. No resident names or health details. They read it first and choose whether
                        to show it.
                      </span>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy || short}
                        onClick={() => change(rec, { status: 'written', body: draft.trim() })}
                      >
                        Send recommendation
                      </button>
                      <button type="button" className="btn small secondary" disabled={busy} onClick={() => change(rec, { status: 'declined' })}>
                        Decline
                      </button>
                    </div>
                    <span className="hint">If you decline, they are not told.</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3>About you</h3>
      {aboutMe.length === 0 && <p className="hint">Nothing yet. Ask a {other} you have worked with.</p>}
      {aboutMe.length > 0 && (
        <ul className="list">
          {aboutMe.map((rec) => (
            <li key={rec.id}>
              <div className="rec-card">
                <p className="rec-body">{rec.body}</p>
                <span className="hint">
                  {nameOf(rec.author_id)}
                  {rec.written_at ? `, ${stampDay(rec.written_at)}` : ''}
                </span>
                <span className="chips">
                  {rec.status === 'shown' && <span className="chip ok">On your profile</span>}
                  {rec.status === 'hidden' && <span className="chip">Private, only you see it</span>}
                  {rec.status === 'written' && <span className="chip warn">New, not on your profile yet</span>}
                </span>
                <div className="actions">
                  {rec.status !== 'shown' && (
                    <button type="button" className="btn small" disabled={busy} onClick={() => change(rec, { status: 'shown' })}>
                      Show on my profile
                    </button>
                  )}
                  {rec.status === 'written' && (
                    <button type="button" className="btn small secondary" disabled={busy} onClick={() => change(rec, { status: 'hidden' })}>
                      Keep private
                    </button>
                  )}
                  {rec.status === 'shown' && (
                    <button type="button" className="btn small secondary" disabled={busy} onClick={() => change(rec, { status: 'hidden' })}>
                      Take off my profile
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(canAsk.length > 0 || waiting.length > 0) && (
        <>
          <h3>Ask for one</h3>
          <ul className="list">
            {canAsk.map((c) => (
              <li key={c.id}>
                <div className="rec-row">
                  <span className="list-title">{c.name}</span>
                  <button type="button" className="btn small secondary" disabled={busy} onClick={() => ask(c.id)}>
                    Ask
                  </button>
                </div>
              </li>
            ))}
            {waiting.map((rec) => (
              <li key={rec.id}>
                <div className="rec-row">
                  <span className="list-title">{nameOf(rec.author_id)}</span>
                  <span className="chip">Asked {stampDay(rec.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {iWrote.length > 0 && (
        <>
          <h3>Written by you</h3>
          <ul className="list">
            {iWrote.map((rec) => (
              <li key={rec.id}>
                <div className="rec-card">
                  <span className="list-title">About {nameOf(rec.subject_id)}</span>
                  <p className="rec-body">{rec.body}</p>
                  <div className="actions">
                    <button type="button" className="btn small secondary" disabled={busy} onClick={() => change(rec, { status: 'declined' })}>
                      Take it back
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
