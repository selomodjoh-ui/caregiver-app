-- What the public website (getshiftkind.com, served by worker/index.ts) may read
-- without anyone signing in: package prices, and open shifts at verified homes.

-- 1. The town a home is in, shown on the public shift board instead of the address.
alter table public.homes add column if not exists town text;

-- 2. Package names and prices are public, so the website can show them.
drop policy if exists "Anyone reads plans" on public.plans;
create policy "Anyone reads plans" on public.plans for select to anon using (true);
grant select on public.plans to anon;

-- 3. Open shifts, with only what is safe to show to anyone: no home name, address,
--    phone, notes or preferences. Only homes whose licence has been verified.
create or replace function public.public_open_shifts()
returns table (
  shift_date date,
  start_time time,
  end_time time,
  pay_rate numeric,
  pay_type text,
  spots integer,
  requirements text[],
  town text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.shift_date, s.start_time, s.end_time, s.pay_rate, s.pay_type, s.spots,
         s.requirements, nullif(trim(h.town), '')
  from shifts s
  join homes h on h.owner_id = s.home_id
  where s.status = 'open'
    and h.license_verified
    and s.shift_date >= (now() at time zone 'America/Los_Angeles')::date
  order by s.shift_date, s.start_time
  limit 200;
$$;

revoke all on function public.public_open_shifts() from public;
grant execute on function public.public_open_shifts() to anon, authenticated;
