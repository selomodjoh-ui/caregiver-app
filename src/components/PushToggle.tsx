import { useEffect, useState } from 'react';
import { pushState, turnOffPush, turnOnPush, type PushState } from '../lib/push';

/** Lets a person turn phone notifications for new messages on or off for this device. */
export default function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    pushState().then(setState);
  }, []);

  if (!state || state === 'unsupported') return null;

  async function on() {
    setBusy(true);
    setNote('');
    const problem = await turnOnPush().catch(() => 'We could not turn notifications on. Please try again.');
    setNote(problem ?? '');
    setState(await pushState());
    setBusy(false);
  }

  async function off() {
    setBusy(true);
    await turnOffPush().catch(() => undefined);
    setState(await pushState());
    setBusy(false);
  }

  return (
    <div className="push-toggle">
      {state === 'on' && (
        <>
          <p className="hint">Notifications are on for this device. You'll also get an email when a message arrives.</p>
          <button type="button" className="link" disabled={busy} onClick={off}>
            Turn off on this device
          </button>
        </>
      )}
      {state === 'off' && (
        <>
          <p className="hint">Get a notification on this device when someone messages you.</p>
          <button type="button" className="btn secondary small" disabled={busy} onClick={on}>
            {busy ? 'Turning on…' : 'Turn on notifications'}
          </button>
        </>
      )}
      {state === 'blocked' && (
        <p className="hint">
          Notifications are blocked for ShiftKind on this device. To get them, allow notifications for this site in
          your browser or phone settings. You'll still get an email when a message arrives.
        </p>
      )}
      {state === 'needs-install' && (
        <p className="hint">
          To get notifications on an iPhone, add ShiftKind to your Home Screen first: tap the Share button, choose
          "Add to Home Screen", then open ShiftKind from there. You'll still get an email when a message arrives.
        </p>
      )}
      {note && (
        <p className="error" role="alert">
          {note}
        </p>
      )}
    </div>
  );
}
