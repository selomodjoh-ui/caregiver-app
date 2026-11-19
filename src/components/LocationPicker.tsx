import { useState } from 'react';
import MapView from './MapView';
import { findAddress, whereAmI, type Point } from '../lib/geo';

interface Props {
  value: Point | null;
  onChange: (p: Point | null) => void;
  /** 'area' keeps only a rough position and draws a circle. */
  mode: 'pin' | 'area';
  /** When given, shows a button that looks this address up. */
  address?: string;
  label: string;
}

export default function LocationPicker({ value, onChange, mode, address, label }: Props) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  async function run(kind: 'here' | 'address') {
    setBusy(kind);
    setNote('');
    try {
      const p = kind === 'here' ? await whereAmI() : await findAddress(address ?? '');
      if (p) onChange(p);
      else setNote('We could not find that address. Tap the map to place the pin yourself.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not work. Tap the map instead.');
    }
    setBusy('');
  }

  return (
    <div className="picker">
      <div className="picker-actions">
        <button type="button" className="btn secondary small" disabled={busy !== ''} onClick={() => run('here')}>
          {busy === 'here' ? 'Finding you…' : 'Use where I am now'}
        </button>
        {address !== undefined && (
          <button
            type="button"
            className="btn secondary small"
            disabled={busy !== '' || address.trim().length < 5}
            onClick={() => run('address')}
          >
            {busy === 'address' ? 'Searching…' : 'Find the address above'}
          </button>
        )}
        {value && (
          <button type="button" className="link" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      <MapView
        label={label}
        picked={value}
        pickedAsArea={mode === 'area'}
        onPick={(p) => {
          setNote('');
          onChange(p);
        }}
      />
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
