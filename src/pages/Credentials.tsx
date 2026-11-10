import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Kind =
  | 'hca_cna'
  | 'tb_test'
  | 'cpr_first_aid'
  | 'food_worker'
  | 'nurse_delegation'
  | 'dementia_mental_health'
  | 'continuing_education';

interface Credential {
  id: string;
  kind: Kind;
  credential_number: string | null;
  expires_on: string | null;
  file_path: string | null;
  status: 'in_review' | 'verified';
}

const KINDS: { kind: Kind; label: string; hasNumber?: boolean }[] = [
  { kind: 'hca_cna', label: 'HCA or CNA credential', hasNumber: true },
  { kind: 'tb_test', label: 'TB test result' },
  { kind: 'cpr_first_aid', label: 'CPR / First Aid card' },
  { kind: 'food_worker', label: 'Food worker card' },
  { kind: 'nurse_delegation', label: 'Nurse delegation certificate' },
  { kind: 'dementia_mental_health', label: 'Dementia and mental health training' },
  { kind: 'continuing_education', label: 'Continuing education hours' },
];

const MAX_BYTES = 5 * 1024 * 1024;
const WARN_DAYS = 30;

function daysUntil(dateText: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateText}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function statusOf(c: Credential | undefined): { text: string; tone: 'ok' | 'warn' | 'bad' | 'plain' } {
  if (!c) return { text: 'Not added', tone: 'plain' };
  if (c.expires_on) {
    const days = daysUntil(c.expires_on);
    if (days < 0) return { text: 'Expired', tone: 'bad' };
    if (days <= WARN_DAYS) return { text: days === 0 ? 'Expires today' : `Expires in ${days} days`, tone: 'warn' };
  }
  return c.status === 'verified' ? { text: 'Verified', tone: 'ok' } : { text: 'In review', tone: 'plain' };
}

interface Props {
  userId: string;
}

export default function Credentials({ userId }: Props) {
  const [items, setItems] = useState<Credential[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Kind | null>(null);
  const [number, setNumber] = useState('');
  const [expires, setExpires] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from('credentials')
      .select('id, kind, credential_number, expires_on, file_path, status');
    if (err) setError(err.message);
    else setItems((data ?? []) as Credential[]);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(kind: Kind) {
    const current = items.find((c) => c.kind === kind);
    setEditing(kind);
    setNumber(current?.credential_number ?? '');
    setExpires(current?.expires_on ?? '');
    setFile(null);
    setError('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !editing) return;
    const current = items.find((c) => c.kind === editing);
    setError('');

    if (file && file.size > MAX_BYTES) {
      setError('That file is larger than 5 MB. Please choose a smaller one.');
      return;
    }
    if (!file && !current?.file_path) {
      setError('Please choose a photo or PDF of the document.');
      return;
    }

    setBusy(true);
    let filePath = current?.file_path ?? null;

    if (file) {
      const ext = (file.name.split('.').pop() ?? 'file').toLowerCase().replace(/[^a-z0-9]/g, '');
      const newPath = `${userId}/${editing}-${Date.now()}.${ext || 'file'}`;
      const { error: upErr } = await supabase.storage.from('credentials').upload(newPath, file);
      if (upErr) {
        setBusy(false);
        setError(upErr.message);
        return;
      }
      if (filePath) await supabase.storage.from('credentials').remove([filePath]);
      filePath = newPath;
    }

    const { error: dbErr } = await supabase.from('credentials').upsert(
      {
        user_id: userId,
        kind: editing,
        credential_number: number.trim() || null,
        expires_on: expires || null,
        file_path: filePath,
        status: 'in_review',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,kind' },
    );
    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setEditing(null);
    load();
  }

  async function viewFile(path: string) {
    if (!supabase) return;
    const { data, error: err } = await supabase.storage.from('credentials').createSignedUrl(path, 60);
    if (err || !data) setError(err?.message ?? 'Could not open the file.');
    else window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <section className="section">
      <h2>Your credentials</h2>
      <p className="hint">
        Add each document with its expiry date. Testing stage: upload sample documents only, not
        your real ones.
      </p>

      {error && !editing && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loaded ? (
        <p className="hint">Loading…</p>
      ) : (
        <ul className="list">
          {KINDS.map(({ kind, label, hasNumber }) => {
            const current = items.find((c) => c.kind === kind);
            const status = statusOf(current);
            const open = editing === kind;
            return (
              <li key={kind}>
                <div className="list-row">
                  <div className="list-main">
                    <span className="list-title">{label}</span>
                    {current?.expires_on && <span className="hint">Expires {current.expires_on}</span>}
                  </div>
                  <span className={`chip ${status.tone}`}>{status.text}</span>
                  {!open && (
                    <button type="button" className="btn small secondary" onClick={() => startEdit(kind)}>
                      {current ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>

                {open && (
                  <form className="form inset" onSubmit={save}>
                    {hasNumber && (
                      <div className="field">
                        <label htmlFor={`${kind}-num`}>Credential number</label>
                        <input
                          id={`${kind}-num`}
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor={`${kind}-exp`}>Expiry date (if it has one)</label>
                      <input
                        id={`${kind}-exp`}
                        type="date"
                        value={expires}
                        onChange={(e) => setExpires(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`${kind}-file`}>
                        {current?.file_path ? 'Replace the document (optional)' : 'Photo or PDF of the document'}
                      </label>
                      <input
                        id={`${kind}-file`}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                      <span className="hint">Up to 5 MB.</span>
                    </div>
                    {current?.file_path && (
                      <button type="button" className="link" onClick={() => viewFile(current.file_path!)}>
                        View the current document
                      </button>
                    )}
                    {error && (
                      <p className="error" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="row">
                      <button type="button" className="btn secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn" disabled={busy}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
