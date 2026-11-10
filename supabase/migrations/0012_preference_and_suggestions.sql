-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- A shift can ask for a female or male caregiver, with a stated reason,
-- and the app can suggest caregivers who match a shift.
-- Safe to run more than once.

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
    or (preferred_sex is not null and char_length(btrim(preference_reason)) between 1 and 300)
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
