-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Adds availability, home profiles, shifts, applications and chat.
-- Safe to run more than once.

-- Who is asking: 'caregiver' or 'provider'.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_caregiver(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = target and role = 'caregiver');
$$;

-- ---------- Availability ----------
-- day: 0 = Sunday ... 6 = Saturday. part: morning, evening or night.
create table if not exists public.availability (
  user_id uuid not null references auth.users (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  part text not null check (part in ('morning', 'evening', 'night')),
  primary key (user_id, day, part)
);
alter table public.availability enable row level security;

drop policy if exists "Manage own availability" on public.availability;
create policy "Manage own availability" on public.availability
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Providers read availability" on public.availability;
create policy "Providers read availability" on public.availability
  for select using (public.my_role() = 'provider');

-- ---------- Homes ----------
create table if not exists public.homes (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  license_number text,
  address text,
  phone text,
  years_operating integer check (years_operating >= 0),
  bed_bound integer not null default 0 check (bed_bound >= 0),
  assisted integer not null default 0 check (assisted >= 0),
  independent integer not null default 0 check (independent >= 0),
  description text,
  license_verified boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.homes enable row level security;

drop policy if exists "Signed-in users read homes" on public.homes;
create policy "Signed-in users read homes" on public.homes
  for select to authenticated using (true);

drop policy if exists "Providers add own home" on public.homes;
create policy "Providers add own home" on public.homes
  for insert with check (auth.uid() = owner_id and public.my_role() = 'provider');

drop policy if exists "Providers change own home" on public.homes;
create policy "Providers change own home" on public.homes
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Only you (from the Supabase dashboard) can mark a licence as verified.
create or replace function public.protect_home_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.license_verified := false;
    else
      new.license_verified := old.license_verified;
      if new.license_number is distinct from old.license_number then
        new.license_verified := false;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_home_verification on public.homes;
create trigger protect_home_verification
  before insert or update on public.homes
  for each row execute function public.protect_home_verification();

-- ---------- Shifts ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (owner_id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  pay_rate numeric(6, 2) check (pay_rate >= 0),
  requirements text[] not null default '{}',
  notes text,
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.shifts enable row level security;

drop policy if exists "Signed-in users read shifts" on public.shifts;
create policy "Signed-in users read shifts" on public.shifts
  for select to authenticated using (true);

drop policy if exists "Providers add own shifts" on public.shifts;
create policy "Providers add own shifts" on public.shifts
  for insert with check (auth.uid() = home_id);

drop policy if exists "Providers change own shifts" on public.shifts;
create policy "Providers change own shifts" on public.shifts
  for update using (auth.uid() = home_id) with check (auth.uid() = home_id);

-- ---------- Applications ----------
-- applied: the caregiver asked for the shift. offered: the home asked the caregiver.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  caregiver_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'applied'
    check (status in ('applied', 'offered', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (shift_id, caregiver_id)
);
alter table public.applications enable row level security;

create or replace function public.owns_shift(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.shifts where id = target and home_id = auth.uid());
$$;

drop policy if exists "Read own applications" on public.applications;
create policy "Read own applications" on public.applications
  for select using (auth.uid() = caregiver_id or public.owns_shift(shift_id));

drop policy if exists "Caregivers apply" on public.applications;
create policy "Caregivers apply" on public.applications
  for insert with check (
    auth.uid() = caregiver_id
    and status = 'applied'
    and public.my_role() = 'caregiver'
    and exists (select 1 from public.shifts s where s.id = shift_id and s.status = 'open')
  );

drop policy if exists "Providers offer" on public.applications;
create policy "Providers offer" on public.applications
  for insert with check (
    status = 'offered'
    and public.owns_shift(shift_id)
    and public.is_caregiver(caregiver_id)
  );

drop policy if exists "Both sides update applications" on public.applications;
create policy "Both sides update applications" on public.applications
  for update using (auth.uid() = caregiver_id or public.owns_shift(shift_id))
  with check (auth.uid() = caregiver_id or public.owns_shift(shift_id));

-- Who may change an application, and to what.
create or replace function public.check_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_owner boolean;
  ok boolean := false;
begin
  if auth.uid() is null then
    return new; -- changes made from the dashboard
  end if;

  if new.shift_id <> old.shift_id or new.caregiver_id <> old.caregiver_id then
    raise exception 'An application cannot be moved to another shift or person.';
  end if;

  is_owner := exists (
    select 1 from public.shifts where id = old.shift_id and home_id = auth.uid()
  );

  if auth.uid() = old.caregiver_id then
    ok := (old.status = 'applied' and new.status = 'withdrawn')
       or (old.status = 'withdrawn' and new.status = 'applied')
       or (old.status = 'offered' and new.status in ('accepted', 'declined'));
  elsif is_owner then
    ok := (old.status = 'applied' and new.status in ('accepted', 'declined'))
       or (old.status = 'offered' and new.status = 'withdrawn');
  end if;

  if new.status = old.status then
    ok := true;
  end if;

  if not ok then
    raise exception 'That change is not allowed.';
  end if;

  if new.status = 'accepted' and old.status <> 'accepted' then
    if not exists (select 1 from public.shifts where id = new.shift_id and status = 'open') then
      raise exception 'This shift is no longer open.';
    end if;
    update public.shifts set status = 'filled' where id = new.shift_id;
  end if;

  return new;
end;
$$;

drop trigger if exists check_application_change on public.applications;
create trigger check_application_change
  before update on public.applications
  for each row execute function public.check_application_change();

-- ---------- Messages ----------
-- A conversation is one caregiver and one home, about one shift.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  caregiver_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_thread on public.messages (shift_id, caregiver_id, created_at);
alter table public.messages enable row level security;

drop policy if exists "Read own conversations" on public.messages;
create policy "Read own conversations" on public.messages
  for select using (auth.uid() = caregiver_id or public.owns_shift(shift_id));

-- You can only write in a conversation that has an application behind it.
drop policy if exists "Send in own conversations" on public.messages;
create policy "Send in own conversations" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and (auth.uid() = caregiver_id or public.owns_shift(shift_id))
    and exists (
      select 1 from public.applications a
      where a.shift_id = messages.shift_id and a.caregiver_id = messages.caregiver_id
    )
  );

-- ---------- What providers can see about caregivers ----------
-- First name and surname initial only. Phone, address and sex stay private.
create or replace view public.caregiver_cards as
  select id, first_name, left(surname, 1) as surname_initial
  from public.profiles
  where role = 'caregiver';

revoke all on public.caregiver_cards from anon;
grant select on public.caregiver_cards to authenticated;

-- Providers can see which credentials a caregiver holds (not the uploaded files).
drop policy if exists "Providers read credentials" on public.credentials;
create policy "Providers read credentials" on public.credentials
  for select using (public.my_role() = 'provider');

-- Let signed-in users reach these tables at all; the rules above decide which rows.
grant select, insert, update, delete on public.availability to authenticated;
grant select, insert, update on public.homes to authenticated;
grant select, insert, update on public.shifts to authenticated;
grant select, insert, update on public.applications to authenticated;
grant select, insert on public.messages to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.credentials to authenticated;
