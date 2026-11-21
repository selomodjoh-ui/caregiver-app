import { useState } from 'react';
import { todayText } from '../../lib/types';
import {
  checkWithState,
  isActive,
  looksLikeHomeCareAide,
  sameSurname,
  STATE_SEARCH_PAGE,
  type StateResult,
} from '../../lib/stateRecord';

interface Props {
  number: string | null;
  /** The caregiver's name as "First Surname". */
  name: string;
  /** The expiry date the caregiver typed in, if any. */
  expiresOn: string | null;
}

const fullDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Checks one HCA / CNA credential against Washington's public record. */
export default function StateCheck({ number, name, expiresOn }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StateResult | null>(null);
  const [error, setError] = useState('');

  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const surname = parts.slice(1).join(' ');

  async function run() {
    setBusy(true);
    setError('');
    try {
      setResult(await checkWithState(number, first, surname));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check did not work. Try again.');
    }
    setBusy(false);
  }

  const manual = (
    <a className="link" href={STATE_SEARCH_PAGE} target="_blank" rel="noreferrer">
      Open the Department of Health search
    </a>
  );

  return (
    <div className="state-check">
      <button type="button" className="btn small secondary" disabled={busy} onClick={run}>
        {busy ? 'Checking…' : result ? 'Check again' : 'Check with the state'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && result.by === 'none' && (
        <div className="state-result" role="status">
          <p>
            <strong>No nursing assistant record found</strong> for this number or name.
          </p>
          <p className="hint">
            {looksLikeHomeCareAide(number)
              ? 'This looks like a home care aide number. The state does not publish those for automatic checks, so look it up by hand.'
              : 'If this person is a home care aide, the state does not publish those for automatic checks. Otherwise the number or the name may be wrong.'}{' '}
            {manual}
          </p>
        </div>
      )}
      {result && result.by !== 'none' && (
        <div className="state-result" role="status">
          {result.by === 'name' && (
            <p className="hint">
              The number did not match a record, so these are nursing assistants with the same name. Confirm the
              number with the caregiver before trusting a match.
            </p>
          )}
          <ul>
            {result.records.map((r) => {
              const active = isActive(r);
              const lapsed = r.expires !== '' && r.expires < todayText();
              const nameOk = sameSurname(r, surname);
              const dateDiffers = result.by === 'number' && !!expiresOn && r.expires !== '' && r.expires !== expiresOn;
              return (
                <li key={r.number + r.type}>
                  <span className="list-title">
                    {r.firstName} {r.lastName}
                  </span>
                  <span>
                    {r.type} · {r.number}
                  </span>
                  <span className="chips">
                    <span className={`chip ${active && !lapsed ? 'ok' : 'bad'}`}>State status: {r.status || 'not given'}</span>
                    <span className={`chip ${lapsed ? 'bad' : ''}`}>
                      {r.expires ? `${lapsed ? 'Expired' : 'Expires'} ${fullDate(r.expires)}` : 'No expiry date on record'}
                    </span>
                    <span className={`chip ${nameOk ? 'ok' : 'bad'}`}>{nameOk ? 'Surname matches' : 'Surname is different'}</span>
                    {r.actionTaken && r.actionTaken !== 'No' && (
                      <span className="chip bad">Disciplinary action: {r.actionTaken}</span>
                    )}
                    {dateDiffers && <span className="chip warn">Caregiver entered a different expiry date</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            From Washington's public credential data, updated daily. For the official record or discipline details:{' '}
            {manual}
          </p>
        </div>
      )}
    </div>
  );
}
