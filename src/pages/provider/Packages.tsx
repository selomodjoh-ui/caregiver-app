import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDate, isHomeActive, type HomeInfo } from '../../lib/types';

interface Plan {
  id: string;
  name: string;
  price_usd: number | null;
  blurb: string;
  features: string[];
}

interface Props {
  home: HomeInfo;
  onChanged: () => void;
}

function priceText(plan: Plan): string {
  if (plan.price_usd == null) return 'Price on request';
  if (Number(plan.price_usd) === 0) return 'Free';
  return `$${Number(plan.price_usd).toFixed(2)} a month`;
}

export default function Packages({ home, onChanged }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('plans')
      .select('id, name, price_usd, blurb, features')
      .order('sort')
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setPlans((data ?? []) as Plan[]);
      });
  }, []);

  async function request(planId: string | null) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase
      .from('homes')
      .update({ requested_plan: planId })
      .eq('owner_id', home.owner_id);
    setBusy(false);
    if (err) setError(err.message);
    else onChanged();
  }

  const active = isHomeActive(home);
  const current = plans.find((p) => p.id === home.plan);

  return (
    <section className="section">
      <h2>Your package</h2>

      <div className={`progress ${active ? '' : 'ended'}`}>
        <strong>{current?.name ?? 'Package'}</strong>
        <span>
          {!active && home.plan_until
            ? `Ended on ${formatDate(home.plan_until)}. Ask for a package below to post shifts again.`
            : home.plan_until
              ? `Runs until ${formatDate(home.plan_until)}.`
              : 'No end date.'}
        </span>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ul className="list">
        {plans
          .filter((p) => p.id !== 'pilot')
          .map((plan) => {
            const isCurrent = plan.id === home.plan && active;
            const requested = plan.id === home.requested_plan;
            return (
              <li key={plan.id} className={requested ? 'open' : ''}>
                <div className="plan">
                  <div className="card-top">
                    <span className="list-title">{plan.name}</span>
                    <span className="pay">{priceText(plan)}</span>
                  </div>
                  <span className="hint">{plan.blurb}</span>
                  <ul className="ticks">
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <span className="chip ok">Your current package</span>
                  ) : requested ? (
                    <>
                      <span className="chip warn">Requested. We will send you an invoice.</span>
                      <button type="button" className="link" disabled={busy} onClick={() => request(null)}>
                        Cancel request
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn small" disabled={busy} onClick={() => request(plan.id)}>
                      Ask for {plan.name}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
      </ul>
      <p className="hint">Caregivers never pay. Packages are for homes only.</p>
    </section>
  );
}
