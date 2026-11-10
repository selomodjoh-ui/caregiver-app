-- Everything the app's database needs, in one script.
-- Paste ALL of this into an empty query in Supabase's SQL Editor and click Run.
-- It is safe to run more than once.

-- ===== 0001_profiles.sql =====
-- It creates the profiles table and fills it in automatically when someone signs up.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('caregiver', 'provider')),
  first_name text not null,
  surname text not null,
  sex text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

-- Row level security: each person can see and edit only their own profile.
-- Letting providers view caregiver profiles comes with the shift features.
alter table public.profiles enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Copy the sign-up form's answers into profiles when a new account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, first_name, surname, sex, phone, address)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'provider' then 'provider' else 'caregiver' end,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'surname', ''),
    new.raw_user_meta_data ->> 'sex',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'address'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== 0002_credentials.sql =====
-- It creates the credentials table and a private place to store uploaded documents.

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'hca_cna', 'tb_test', 'cpr_first_aid', 'food_worker',
    'nurse_delegation', 'dementia_mental_health', 'continuing_education'
  )),
  credential_number text,
  expires_on date,
  file_path text,
  status text not null default 'in_review' check (status in ('in_review', 'verified')),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

alter table public.credentials enable row level security;

-- Each caregiver sees and manages only their own credentials.
-- They can never mark one as verified: any save puts it back to "in review".
drop policy if exists "Read own credentials" on public.credentials;
create policy "Read own credentials" on public.credentials
  for select using (auth.uid() = user_id);

drop policy if exists "Add own credentials" on public.credentials;
create policy "Add own credentials" on public.credentials
  for insert with check (auth.uid() = user_id and status = 'in_review');

drop policy if exists "Change own credentials" on public.credentials;
create policy "Change own credentials" on public.credentials
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'in_review');

drop policy if exists "Remove own credentials" on public.credentials;
create policy "Remove own credentials" on public.credentials
  for delete using (auth.uid() = user_id);

-- A private storage bucket. Files live in a folder named after the owner's user id.
insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

drop policy if exists "Read own credential files" on storage.objects;
create policy "Read own credential files" on storage.objects
  for select to authenticated
  using (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Upload own credential files" on storage.objects;
create policy "Upload own credential files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Remove own credential files" on storage.objects;
create policy "Remove own credential files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== 0003_shifts_and_chat.sql =====
-- Adds availability, home profiles, shifts, applications and chat.

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

-- ===== 0004_ratings.sql =====
-- Adds ratings: after a shift, the caregiver rates the home and the home rates the caregiver.

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  rater_id uuid not null references auth.users (id) on delete cascade,
  ratee_id uuid not null references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (shift_id, rater_id)
);
alter table public.ratings enable row level security;

-- You can see ratings you gave and ratings you received.
drop policy if exists "Read own ratings" on public.ratings;
create policy "Read own ratings" on public.ratings
  for select using (auth.uid() = rater_id or auth.uid() = ratee_id);

-- A rating is only allowed between the home and the caregiver who was accepted
-- for that shift, and only from the day of the shift onward. One each, no edits.
drop policy if exists "Rate after a shift" on public.ratings;
create policy "Rate after a shift" on public.ratings
  for insert with check (
    auth.uid() = rater_id
    and exists (
      select 1
      from public.applications a
      join public.shifts s on s.id = a.shift_id
      where a.shift_id = ratings.shift_id
        and a.status = 'accepted'
        and s.shift_date <= current_date
        and (
          (a.caregiver_id = auth.uid() and s.home_id = ratings.ratee_id)
          or (s.home_id = auth.uid() and a.caregiver_id = ratings.ratee_id)
        )
    )
  );

-- Everyone signed in can see each person's or home's average and count.
create or replace view public.rating_summary as
  select ratee_id, round(avg(stars), 1) as average, count(*)::int as total
  from public.ratings
  group by ratee_id;

-- The comments, without saying which caregiver wrote them.
-- A comment about a caregiver shows the name of the home that wrote it.
create or replace view public.rating_feed as
  select r.ratee_id, r.stars, r.comment, r.created_at,
         coalesce(h.name, 'A caregiver') as written_by
  from public.ratings r
  left join public.homes h on h.owner_id = r.rater_id;

revoke all on public.rating_summary, public.rating_feed from anon;
grant select on public.rating_summary, public.rating_feed to authenticated;
grant select, insert on public.ratings to authenticated;

-- ===== 0005_direct_messages.sql =====
-- Lets a provider message a caregiver directly, without a shift behind it.

-- A direct conversation has no shift; it is identified by the home and the caregiver.
alter table public.messages alter column shift_id drop not null;
alter table public.messages
  add column if not exists home_id uuid references auth.users (id) on delete cascade;

alter table public.messages drop constraint if exists messages_has_thread;
alter table public.messages
  add constraint messages_has_thread check (shift_id is not null or home_id is not null);

create index if not exists messages_direct on public.messages (home_id, caregiver_id, created_at)
  where shift_id is null;

-- Has this home already written to this caregiver?
create or replace function public.home_wrote_to(home uuid, caregiver uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.messages
    where shift_id is null and home_id = home and caregiver_id = caregiver and sender_id = home
  );
$$;

drop policy if exists "Read own conversations" on public.messages;
create policy "Read own conversations" on public.messages
  for select using (
    (shift_id is not null and (auth.uid() = caregiver_id or public.owns_shift(shift_id)))
    or (shift_id is null and (auth.uid() = caregiver_id or auth.uid() = home_id))
  );

-- Shift conversations: as before, both sides once there is an application.
-- Direct conversations: the provider starts; the caregiver can reply after that.
drop policy if exists "Send in own conversations" on public.messages;
create policy "Send in own conversations" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and (
      (
        shift_id is not null
        and home_id is null
        and (auth.uid() = caregiver_id or public.owns_shift(shift_id))
        and exists (
          select 1 from public.applications a
          where a.shift_id = messages.shift_id and a.caregiver_id = messages.caregiver_id
        )
      )
      or (
        shift_id is null
        and home_id is not null
        and (
          (auth.uid() = home_id and public.my_role() = 'provider' and public.is_caregiver(caregiver_id))
          or (auth.uid() = caregiver_id and public.home_wrote_to(home_id, caregiver_id))
        )
      )
    )
  );

-- ===== 0006_packages.sql =====
-- Adds packages for homes: a free pilot, Standard and Plus.

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
   array['Post shifts', 'Search who is free', 'Message caregivers and offer shifts', 'Free for your first 30 days'],
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
      new.plan_until := current_date + 30;
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

-- ===== 0007_pilot_30_days.sql =====
-- Changes the free pilot from 90 days to 30 days for homes that join from now on.

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
      new.plan_until := current_date + 30;
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

update public.plans
set features = array_replace(features, 'Free for your first 90 days', 'Free for your first 30 days')
where id = 'pilot';

-- ===== 0008_day_and_night.sql =====
-- Free times become Day and Night only (was morning, evening, night).
-- Existing entries are carried over: morning becomes day, evening becomes night.

alter table public.availability drop constraint if exists availability_part_check;

insert into public.availability (user_id, day, part)
  select user_id, day, 'day' from public.availability where part = 'morning'
  on conflict do nothing;

insert into public.availability (user_id, day, part)
  select user_id, day, 'night' from public.availability where part = 'evening'
  on conflict do nothing;

delete from public.availability where part in ('morning', 'evening');

alter table public.availability
  add constraint availability_part_check check (part in ('day', 'night'));

-- ===== 0009_caregivers_needed.sql =====
-- A shift can now need more than one caregiver.

alter table public.shifts add column if not exists spots integer not null default 1;
alter table public.shifts drop constraint if exists shifts_spots_check;
alter table public.shifts add constraint shifts_spots_check check (spots between 1 and 20);

-- A home with several caregivers on one shift rates each of them.
alter table public.ratings drop constraint if exists ratings_shift_id_rater_id_key;
alter table public.ratings drop constraint if exists ratings_one_per_pair;
alter table public.ratings add constraint ratings_one_per_pair unique (shift_id, rater_id, ratee_id);

-- Who may change an application, and to what.
-- A shift is marked filled once it has as many accepted caregivers as it needs.
create or replace function public.check_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_owner boolean;
  ok boolean := false;
  needed integer;
  taken integer;
begin
  if auth.uid() is null then
    return new;
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
    select spots into needed from public.shifts
      where id = new.shift_id and status = 'open' for update;
    if needed is null then
      raise exception 'This shift is no longer open.';
    end if;
    select count(*) into taken from public.applications
      where shift_id = new.shift_id and status = 'accepted';
    if taken + 1 >= needed then
      update public.shifts set status = 'filled' where id = new.shift_id;
    end if;
  end if;

  return new;
end;
$$;

-- ===== 0010_pay_per_hour_or_shift.sql =====
-- A shift's pay can be an hourly rate or a flat amount for the whole shift.

alter table public.shifts add column if not exists pay_type text not null default 'hour';
alter table public.shifts drop constraint if exists shifts_pay_type_check;
alter table public.shifts add constraint shifts_pay_type_check check (pay_type in ('hour', 'shift'));

-- A flat amount for a shift can be larger than an hourly rate.
alter table public.shifts alter column pay_rate type numeric(8, 2);

-- ===== 0011_shift_definition.sql =====
-- Lets a home say in its own words what its shift covers, or the hours it is asking for.

alter table public.shifts add column if not exists pay_note text;
alter table public.shifts drop constraint if exists shifts_pay_note_check;
alter table public.shifts add constraint shifts_pay_note_check check (char_length(pay_note) <= 300);

-- ===== 0012_preference_and_suggestions.sql =====
-- A shift can ask for a female or male caregiver, with a stated reason,
-- and the app can suggest caregivers who match a shift.

alter table public.shifts add column if not exists preferred_sex text;
alter table public.shifts add column if not exists preference_reason text;

alter table public.shifts drop constraint if exists shifts_preferred_sex_check;
alter table public.shifts add constraint shifts_preferred_sex_check
  check (preferred_sex is null or preferred_sex in ('female', 'male'));

-- A preference must come with its reason, and the reason is shown to caregivers.
alter table public.shifts drop constraint if exists shifts_preference_reason_check;
alter table public.shifts add constraint shifts_preference_reason_check
  check (
    (preferred_sex is null and preference_reason is null)
    or (
      preferred_sex is not null
      and preference_reason is not null
      and char_length(btrim(preference_reason)) between 1 and 300
    )
  );

-- Caregivers who match a shift, best first. Only the shift's own home may ask.
-- A match is free at the shift's day and time and has no application for it yet.
-- If the shift asks for a female or male caregiver, only caregivers who gave that answer are included.
-- Ranked by fewest missing credentials, then by rating.
drop function if exists public.suggest_caregivers(uuid);
create function public.suggest_caregivers(target uuid)
returns table (
  id uuid,
  first_name text,
  surname_initial text,
  missing integer,
  average numeric,
  total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.first_name,
    left(p.surname, 1),
    (
      select count(*)::int
      from unnest(s.requirements) as needed(kind)
      where not exists (
        select 1 from public.credentials c
        where c.user_id = p.id
          and c.kind = needed.kind
          and (c.expires_on is null or c.expires_on >= current_date)
      )
    ) as missing,
    r.average,
    coalesce(r.total, 0)
  from public.shifts s
  join public.profiles p on p.role = 'caregiver'
  join public.availability a
    on a.user_id = p.id
   and a.day = extract(dow from s.shift_date)::int
   and a.part = case when s.start_time >= time '06:00' and s.start_time < time '18:00' then 'day' else 'night' end
  left join public.rating_summary r on r.ratee_id = p.id
  where s.id = target
    and s.home_id = auth.uid()
    and s.status = 'open'
    and public.home_active(s.home_id)
    and (s.preferred_sex is null or p.sex = s.preferred_sex)
    and not exists (
      select 1 from public.applications x where x.shift_id = s.id and x.caregiver_id = p.id
    )
  order by 4 asc, r.average desc nulls last, 6 desc, p.first_name
  limit 10;
$$;

revoke all on function public.suggest_caregivers(uuid) from public, anon;
grant execute on function public.suggest_caregivers(uuid) to authenticated;
