import { useRef, useState, type ChangeEvent } from 'react';
import Avatar from './Avatar';
import { removePhoto, savePhoto, usePhoto } from '../lib/photos';

interface Props {
  userId: string;
  name: string;
  isProvider: boolean;
}

/** Lets someone add, change or remove their picture. */
export default function PhotoPicker({ userId, name, isProvider }: Props) {
  const photo = usePhoto(userId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function chosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError((await savePhoto(userId, file)) ?? '');
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError((await removePhoto(userId)) ?? '');
    setBusy(false);
  }

  return (
    <section className="section">
      <h2>{isProvider ? "Your home's picture" : 'Your picture'}</h2>
      <div className="photo-picker">
        <Avatar userId={userId} name={name} size="large" />
        <div className="photo-actions">
          <p className="hint">
            {isProvider
              ? 'A photo of the home or its logo. Caregivers see it beside your shifts and messages.'
              : 'A clear photo of your face helps a home know who is coming. Homes see it beside your name.'}
          </p>
          <input ref={input} id="photo-file" type="file" accept="image/*" className="visually-hidden" onChange={chosen} />
          <div className="photo-buttons">
            <button type="button" className="btn secondary small" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Saving…' : photo ? 'Change picture' : 'Add a picture'}
            </button>
            {photo && !busy && (
              <button type="button" className="link" onClick={remove}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
