-- One-off changes to a caregiver's usual week: "away this Saturday" or
-- "free this Friday night only". The weekly grid stays the base; a row here
-- wins for that one date.
-- Safe to run more than once.

create table if not exists public.availability_dates (
  user_id uuid not null references auth.users (id) on delete cascade,
  on_date date not null,
  part text not null check (part in ('day', 'night')),
  free boolean not null,
  primary key (user_id, on_date, part)
);
create index if not exists availability_dates_date_idx on public.availability_dates (on_date);
alter table public.availability_dates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'availability_dates' and policyname = 'Manage own free dates') then
    create policy "Manage own free dates" on public.availability_dates
      for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'availability_dates' and policyname = 'Providers read free dates') then
    create policy "Providers read free dates" on public.availability_dates
      for select using (public.my_role() = 'provider' and public.home_active((select auth.uid())));
  end if;
end $$;

grant select, insert, update, delete on public.availability_dates to authenticated;

-- Caregivers who match a shift now go by the shift's actual date:
-- the usual week, unless the caregiver changed that date.
create or replace function public.suggest_caregivers(target uuid)
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
  cross join lateral (
    select case when s.start_time >= time '06:00' and s.start_time < time '18:00' then 'day' else 'night' end as part
  ) slot
  join public.profiles p on p.role = 'caregiver'
  left join public.availability_dates d
    on d.user_id = p.id and d.on_date = s.shift_date and d.part = slot.part
  left join public.rating_summary r on r.ratee_id = p.id
  where s.id = target
    and s.home_id = auth.uid()
    and s.status = 'open'
    and public.home_active(s.home_id)
    and coalesce(
      d.free,
      exists (
        select 1 from public.availability a
        where a.user_id = p.id
          and a.day = extract(dow from s.shift_date)::int
          and a.part = slot.part
      )
    )
    and (s.preferred_sex is null or p.sex = s.preferred_sex)
    and not exists (
      select 1 from public.applications x where x.shift_id = s.id and x.caregiver_id = p.id
    )
  order by 4 asc, r.average desc nulls last, 6 desc, p.first_name
  limit 10;
$$;

revoke all on function public.suggest_caregivers(uuid) from public, anon;
grant execute on function public.suggest_caregivers(uuid) to authenticated;
