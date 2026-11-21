-- Step 17: card payments with Stripe.
-- Homes subscribe on Stripe's own payment page. Stripe then tells our server,
-- and only our server writes to this table or changes a home's package.

alter table public.plans add column if not exists stripe_price_id text;

create table if not exists public.billing (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan text references public.plans (id),
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.billing enable row level security;

-- A home can read its own billing status. Nobody signed in can write to it:
-- there is no insert, update or delete rule, so only the server can.
drop policy if exists "Homes read own billing" on public.billing;
create policy "Homes read own billing" on public.billing
  for select using ((select auth.uid()) = owner_id);

revoke all on public.billing from anon, authenticated;
grant select on public.billing to authenticated;

create index if not exists billing_plan_idx on public.billing (plan);
