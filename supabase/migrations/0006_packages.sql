-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Adds packages for homes: a free pilot, Standard and Plus.
-- Safe to run more than once.

create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_usd numeric(8, 2),          -- per month; leave empty until you decide
  blurb text not null,
  features text[] not null default '{}',
  sort integer not null default 0
);
alter table public.plans enable row level security;

drop policy if exists "Signed-in users read plans" on public.plans;
create policy "Signed-in users read plans" on public.plans
  for select to authenticated using (true);

grant select on public.plans to authenticated;

-- The three packages. Running this again will not overwrite prices or wording you changed.
insert into public.plans (id, name, price_usd, blurb, features, sort) values
  ('pilot', 'Founding pilot', 0,
   'Free while we get started.',
   array['Post shifts', 'Search who is free', 'Message caregivers and offer shifts', 'Free for your first 90 days'],
   1),
  ('standard', 'Standard', null,
   'Everything a home needs to fill shifts.',
   array['Post shifts', 'Search who is free', 'Message caregivers and offer shifts', 'See verified credentials and ratings'],
   2),
  ('plus', 'Plus', null,
   'For homes that want to be seen first.',
   array['Everything in Standard', 'Your shifts listed first for caregivers', 'Printable credential reports for caregivers you accept'],
   3)
on conflict (id) do nothing;

-- Each home has a package, an end date, and optionally a package it has asked for.
alter table public.homes add column if not exists plan text not null default 'pilot' references public.plans (id);
alter table public.homes add column if not exists plan_until date;
alter table public.homes add column if not exists requested_plan text references public.plans (id);

-- A home is active while its package has not run out. An empty end date means no end.
create or replace function public.home_active(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.homes
    where owner_id = target and (plan_until is null or plan_until >= current_date)
  );
$$;

-- Providers cannot change their own package, end date or licence check.
-- They can ask for a package (requested_plan). You change the rest from the dashboard.
create or replace function public.protect_home_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.license_verified := false;
      new.plan := 'pilot';
      new.plan_until := current_date + 90;
    else
      new.license_verified := old.license_verified;
      if new.license_number is distinct from old.license_number then
        new.license_verified := false;
      end if;
      new.plan := old.plan;
      new.plan_until := old.plan_until;
    end if;
  end if;
  return new;
end;
$$;

-- Posting a shift and searching who is free need an active package.
drop policy if exists "Providers add own shifts" on public.shifts;
create policy "Providers add own shifts" on public.shifts
  for insert with check (auth.uid() = home_id and public.home_active(home_id));

drop policy if exists "Providers read availability" on public.availability;
create policy "Providers read availability" on public.availability
  for select using (public.my_role() = 'provider' and public.home_active(auth.uid()));
