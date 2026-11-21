import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDate, isHomeActive, type HomeInfo } from '../../lib/types';

interface Plan {
  id: string;
  name: string;
  price_usd: number | null;
  blurb: string;
  features: string[];
  stripe_price_id?: string | null;
}

interface Billing {
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** What Stripe sent the home back with: ?billing=paid, cancelled or back. */
const returned = new URLSearchParams(location.search).get('billing');

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
  const [billing, setBilling] = useState<Billing | null>(null);
  const [notice, setNotice] = useState(
    returned === 'paid'
      ? 'Thank you. Your payment went through. Your package will show here within a minute.'
      : returned === 'cancelled'
        ? 'No payment was taken. You can subscribe whenever you are ready.'
        : '',
  );

  function loadBilling() {
    // Missing until the billing step is run in the database; the screen works without it.
    supabase
      ?.from('billing')
      .select('status, plan, current_period_end, cancel_at_period_end')
      .eq('owner_id', home.owner_id)
      .maybeSingle()
      .then(({ data }) => setBilling((data as Billing | null) ?? null));
  }

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    // Card prices are a newer column. Ask for it, and fall back if the database does not have it yet.
    client
      .from('plans')
      .select('id, name, price_usd, blurb, features, stripe_price_id')
      .order('sort')
      .then(async (first) => {
        const res = first.error
          ? await client.from('plans').select('id, name, price_usd, blurb, features').order('sort')
          : first;
        if (res.error) setError(res.error.message);
        else setPlans((res.data ?? []) as Plan[]);
      });
    loadBilling();
    if (!returned) return;
    history.replaceState(null, '', '/');
    if (returned !== 'paid') return;
    // Stripe tells our server a moment after the home returns, so look again a few times.
    const timers = [3000, 8000, 20000].map((ms) =>
      setTimeout(() => {
        onChanged();
        loadBilling();
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  /** Sends the home to Stripe: the payment page for a new subscription, or the page for managing one. */
  async function goToStripe(action: 'checkout' | 'portal', planId?: string) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setNotice('');
    const { data, error: err } = await supabase.functions.invoke('billing', { body: { action, plan: planId } });
    let message = '';
    if (err) {
      const context = (err as { context?: Response }).context;
      const body = context ? await context.json().catch(() => null) : null;
      message = body?.error ?? 'We could not open the payment page. Please try again in a moment.';
    }
    const url = (data as { url?: string } | null)?.url;
    if (!message && url) {
      window.location.assign(url);
      return;
    }
    setBusy(false);
    setError(message || 'We could not open the payment page. Please try again in a moment.');
  }

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
  const subscribed = !!billing && ['active', 'trialing', 'past_due'].includes(billing.status ?? '');
  const renews = billing?.current_period_end ? formatDate(billing.current_period_end.slice(0, 10)) : '';

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

      {notice && (
        <p className="notice-bar inline" role="status">
          {notice}
        </p>
      )}

      {subscribed && (
        <div className="plan">
          <span className="hint">
            {billing?.status === 'past_due'
              ? 'Your last card payment did not go through. Update your card to keep your package.'
              : billing?.cancel_at_period_end
                ? `Your subscription is cancelled and ends on ${renews}.`
                : `You pay by card each month. Next payment on ${renews}.`}
          </span>
          <button type="button" className="btn small secondary" disabled={busy} onClick={() => goToStripe('portal')}>
            {busy ? 'Opening…' : 'Change card, package or cancel'}
          </button>
        </div>
      )}

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
                  ) : plan.stripe_price_id ? (
                    subscribed ? (
                      <button type="button" className="btn small secondary" disabled={busy} onClick={() => goToStripe('portal')}>
                        Switch to {plan.name}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn small" disabled={busy} onClick={() => goToStripe('checkout', plan.id)}>
                          {busy ? 'Opening the payment page…' : `Subscribe to ${plan.name}`}
                        </button>
                        <span className="hint">Pay by card on Stripe's secure page. Cancel any time.</span>
                      </>
                    )
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
