import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import type { HomeInfo } from '../../lib/types';

interface Props {
  userId: string;
  home: HomeInfo | null;
  onSaved: () => void;
}

type MixKey = 'bed_bound' | 'assisted' | 'independent';

const MIX: { key: MixKey; label: string }[] = [
  { key: 'bed_bound', label: 'Bed-bound' },
  { key: 'assisted', label: 'Assisted' },
  { key: 'independent', label: 'Independent' },
];

export default function HomeProfile({ userId, home, onSaved }: Props) {
  const [name, setName] = useState('');
  const [license, setLicense] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [years, setYears] = useState('');
  const [mix, setMix] = useState<Record<MixKey, number>>({ bed_bound: 0, assisted: 0, independent: 0 });
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!home) return;
    setName(home.name);
    setLicense(home.license_number ?? '');
    setAddress(home.address ?? '');
    setPhone(home.phone ?? '');
    setYears(home.years_operating != null ? String(home.years_operating) : '');
    setMix({ bed_bound: home.bed_bound, assisted: home.assisted, independent: home.independent });
    setDescription(home.description ?? '');
  }, [home]);

  const total = mix.bed_bound + mix.assisted + mix.independent;

  function step(key: MixKey, by: number) {
    setMix((m) => ({ ...m, [key]: Math.max(0, m[key] + by) }));
    setSaved(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('homes').upsert({
      owner_id: userId,
      name: name.trim(),
      license_number: license.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      years_operating: years === '' ? null : Number(years),
      ...mix,
      description: description.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    onSaved();
  }

  return (
    <section className="section">
      <h2>About your home</h2>
      <p className="hint">Caregivers see this before they apply.</p>
      {home && (
        <span className={`chip ${home.license_verified ? 'ok' : ''}`}>
          {home.license_verified ? 'Licence verified' : 'Licence awaiting review'}
        </span>
      )}

      <form className="form" onSubmit={save}>
        <div className="field">
          <label htmlFor="hp-name">Name of the home</label>
          <input id="hp-name" required value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </div>
        <div className="field">
          <label htmlFor="hp-lic">Adult family home licence number</label>
          <input id="hp-lic" value={license} onChange={(e) => { setLicense(e.target.value); setSaved(false); }} />
          <span className="hint">We check this against the state licence lookup.</span>
        </div>
        <div className="field">
          <label htmlFor="hp-addr">Address of the home</label>
          <input id="hp-addr" autoComplete="street-address" value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false); }} />
        </div>
        <div className="field">
          <label htmlFor="hp-tel">Provider's telephone number</label>
          <input id="hp-tel" type="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="hp-years">Years operating</label>
            <input id="hp-years" type="number" min="0" inputMode="numeric" value={years} onChange={(e) => { setYears(e.target.value); setSaved(false); }} />
          </div>
          <div className="field">
            <span className="legend">Residents now</span>
            <div className="readout">{total}</div>
          </div>
        </div>

        <div className="field">
          <span className="legend">Care mix</span>
          <div className="mix">
            {MIX.map(({ key, label }) => (
              <div key={key} className="stepper" role="group" aria-label={label}>
                <span>{label}</span>
                <div>
                  <button type="button" aria-label={`One fewer ${label.toLowerCase()}`} onClick={() => step(key, -1)}>
                    −
                  </button>
                  <strong>{mix[key]}</strong>
                  <button type="button" aria-label={`One more ${label.toLowerCase()}`} onClick={() => step(key, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="hp-desc">Brief description of residents' needs</label>
          <textarea id="hp-desc" rows={3} value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false); }} />
          <span className="hint">Keep it general. No resident names or details.</span>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving…' : saved ? 'Saved' : 'Save home details'}
        </button>
      </form>
    </section>
  );
}
