-- Step 14: the map.
-- Homes can place a pin where they are. Caregivers can choose to share a
-- general area (never an exact address) so homes can see who is nearby.

alter table public.homes add column if not exists lat double precision;
alter table public.homes add column if not exists lng double precision;

alter table public.homes drop constraint if exists homes_lat_range;
alter table public.homes add constraint homes_lat_range check (lat is null or (lat between -90 and 90));
alter table public.homes drop constraint if exists homes_lng_range;
alter table public.homes add constraint homes_lng_range check (lng is null or (lng between -180 and 180));
alter table public.homes drop constraint if exists homes_pin_complete;
alter table public.homes add constraint homes_pin_complete check ((lat is null) = (lng is null));

-- A caregiver's area. The columns hold two decimal places only, which is
-- about one kilometre, so the database cannot store a precise position
-- even if the app sent one.
create table if not exists public.caregiver_areas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lat numeric(5, 2) not null check (lat between -90 and 90),
  lng numeric(6, 2) not null check (lng between -180 and 180),
  updated_at timestamptz not null default now()
);

alter table public.caregiver_areas enable row level security;

drop policy if exists "Caregivers manage own area" on public.caregiver_areas;
create policy "Caregivers manage own area" on public.caregiver_areas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.my_role() = 'caregiver');

drop policy if exists "Active homes read areas" on public.caregiver_areas;
create policy "Active homes read areas" on public.caregiver_areas
  for select using (public.my_role() = 'provider' and public.home_active(auth.uid()));

revoke all on public.caregiver_areas from anon;
grant select, insert, update, delete on public.caregiver_areas to authenticated;
