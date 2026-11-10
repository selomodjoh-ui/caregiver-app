-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Adds ratings: after a shift, the caregiver rates the home and the home rates the caregiver.
-- Safe to run more than once.

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
