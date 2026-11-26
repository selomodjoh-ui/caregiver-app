-- Star ratings are replaced by written recommendations that someone asked for.
-- A person asks someone they have worked with; that person writes a few sentences
-- or declines; the person it is about decides whether it shows on their profile.
-- Also adds a private "report a problem" route that only the ShiftKind team reads.
-- Safe to run more than once.

-- ---------- Recommendations ----------

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text check (char_length(body) between 20 and 1000),
  status text not null default 'requested'
    check (status in ('requested', 'declined', 'written', 'shown', 'hidden')),
  created_at timestamptz not null default now(),
  written_at timestamptz,
  unique (subject_id, author_id),
  check (subject_id <> author_id)
);
create index if not exists recommendations_author_idx on public.recommendations (author_id);
create index if not exists recommendations_shown_idx on public.recommendations (subject_id) where status = 'shown';
alter table public.recommendations enable row level security;

-- Two people have worked together when one was accepted on the other's shift and
-- the shift date has come, or one hired the other for a permanent job.
create or replace function public.worked_together(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications x
    join public.shifts s on s.id = x.shift_id
    where x.status = 'accepted'
      and s.shift_date <= current_date
      and ((s.home_id = a and x.caregiver_id = b) or (s.home_id = b and x.caregiver_id = a))
  ) or exists (
    select 1
    from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
    where ja.status = 'hired'
      and ((j.home_id = a and ja.caregiver_id = b) or (j.home_id = b and ja.caregiver_id = a))
  );
$$;

-- The people the signed-in person has worked with, by the name the app shows for them.
create or replace function public.recommendation_contacts()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  with pairs as (
    select case when s.home_id = auth.uid() then x.caregiver_id else s.home_id end as other
    from public.applications x
    join public.shifts s on s.id = x.shift_id
    where x.status = 'accepted'
      and s.shift_date <= current_date
      and (s.home_id = auth.uid() or x.caregiver_id = auth.uid())
    union
    select case when j.home_id = auth.uid() then ja.caregiver_id else j.home_id end
    from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
    where ja.status = 'hired'
      and (j.home_id = auth.uid() or ja.caregiver_id = auth.uid())
    union
    select case when r.subject_id = auth.uid() then r.author_id else r.subject_id end
    from public.recommendations r
    where r.subject_id = auth.uid() or r.author_id = auth.uid()
  )
  select pairs.other,
         coalesce(h.name, nullif(btrim(p.first_name || ' ' || left(p.surname, 1) || '.'), '.'), 'Someone')
  from pairs
  left join public.homes h on h.owner_id = pairs.other
  left join public.profiles p on p.id = pairs.other
  order by 2;
$$;

create or replace function public.guard_recommendation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.subject_id <> old.subject_id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'A recommendation cannot be moved.';
  end if;
  if auth.uid() = old.author_id then
    if new.status = 'declined' then
      new.body := null;
      new.written_at := null;
    elsif new.status = 'written' and old.status in ('requested', 'declined', 'written') then
      if new.body is null then
        raise exception 'Write a few sentences first.';
      end if;
      new.written_at := now();
    else
      raise exception 'That change is not allowed.';
    end if;
  elsif auth.uid() = old.subject_id then
    if new.body is distinct from old.body or new.written_at is distinct from old.written_at then
      raise exception 'Only the person who wrote it can change the words.';
    end if;
    if not (old.status in ('written', 'shown', 'hidden') and new.status in ('shown', 'hidden')) then
      raise exception 'That change is not allowed.';
    end if;
  else
    raise exception 'That change is not allowed.';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'guard_recommendation' and tgrelid = 'public.recommendations'::regclass) then
    create trigger guard_recommendation before update on public.recommendations
      for each row execute function public.guard_recommendation();
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recommendations' and policyname = 'Read own recommendations') then
    create policy "Read own recommendations" on public.recommendations
      for select to authenticated
      using ((select auth.uid()) = subject_id or (select auth.uid()) = author_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recommendations' and policyname = 'Ask someone you worked with') then
    create policy "Ask someone you worked with" on public.recommendations
      for insert to authenticated with check (
        (select auth.uid()) = subject_id
        and status = 'requested'
        and body is null
        and written_at is null
        and public.worked_together(subject_id, author_id)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recommendations' and policyname = 'Both sides update recommendations') then
    create policy "Both sides update recommendations" on public.recommendations
      for update to authenticated
      using ((select auth.uid()) = subject_id or (select auth.uid()) = author_id)
      with check ((select auth.uid()) = subject_id or (select auth.uid()) = author_id);
  end if;
end $$;

-- What everyone signed in can see: only recommendations the person chose to show.
create or replace view public.recommendation_feed as
  select r.subject_id, r.body, r.written_at,
         coalesce(h.name, p.first_name || ' ' || left(p.surname, 1) || '.') as written_by
  from public.recommendations r
  left join public.homes h on h.owner_id = r.author_id
  left join public.profiles p on p.id = r.author_id
  where r.status = 'shown';

create or replace view public.recommendation_summary as
  select subject_id, count(*)::int as total
  from public.recommendations
  where status = 'shown'
  group by subject_id;

revoke all on public.recommendations from anon;
revoke all on public.recommendation_feed, public.recommendation_summary from anon;
grant select, insert, update on public.recommendations to authenticated;
grant select on public.recommendation_feed, public.recommendation_summary to authenticated;
revoke execute on function public.worked_together(uuid, uuid) from public, anon;
revoke execute on function public.recommendation_contacts() from public, anon;
grant execute on function public.worked_together(uuid, uuid) to authenticated;
grant execute on function public.recommendation_contacts() to authenticated;

-- ---------- Star ratings go out of sight ----------
-- The old ratings stay in the database, but nobody can read them or add new ones.

revoke all on public.ratings from authenticated;
revoke all on public.rating_summary, public.rating_feed from authenticated;

-- Suggested caregivers are ranked by credentials, then by recommendations shown.
-- The last two columns keep their old names so an app that is already open keeps
-- working: "average" is always empty and "total" now counts recommendations.
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
    null::numeric,
    (select count(*)::int from public.recommendations r where r.subject_id = p.id and r.status = 'shown')
  from public.shifts s
  cross join lateral (
    select case when s.start_time >= time '06:00' and s.start_time < time '18:00' then 'day' else 'night' end as part
  ) slot
  join public.profiles p on p.role = 'caregiver'
  left join public.availability_dates d
    on d.user_id = p.id and d.on_date = s.shift_date and d.part = slot.part
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
  order by 4 asc, 6 desc, p.first_name
  limit 10;
$$;

update public.plans
   set features = array_replace(features, 'See verified credentials and ratings', 'See verified credentials and recommendations')
 where 'See verified credentials and ratings' = any (features);

-- ---------- Private problem reports ----------

create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  about text check (char_length(about) <= 120),
  body text not null check (char_length(body) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists problem_reports_reporter_idx on public.problem_reports (reporter_id);
alter table public.problem_reports enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'problem_reports' and policyname = 'Send a problem report') then
    create policy "Send a problem report" on public.problem_reports
      for insert to authenticated with check ((select auth.uid()) = reporter_id and status = 'open');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'problem_reports' and policyname = 'Read own problem reports') then
    create policy "Read own problem reports" on public.problem_reports
      for select to authenticated using ((select auth.uid()) = reporter_id);
  end if;
end $$;

revoke all on public.problem_reports from anon;
grant select, insert on public.problem_reports to authenticated;

-- What the admin screen reads about recommendations and reports.
create or replace function public.admin_trust()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return json_build_object(
    'recommendations_shown', (select count(*) from public.recommendations where status = 'shown'),
    'recommendations_waiting', (select count(*) from public.recommendations where status = 'requested'),
    'reports', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json)
      from (
        select pr.id, pr.about, pr.body, pr.status, pr.created_at,
               coalesce(h.name, nullif(btrim(p.first_name || ' ' || p.surname), ''), '(account deleted)') as reporter,
               u.email::text as email
        from public.problem_reports pr
        left join public.profiles p on p.id = pr.reporter_id
        left join public.homes h on h.owner_id = pr.reporter_id
        left join auth.users u on u.id = pr.reporter_id
        order by (pr.status = 'open') desc, pr.created_at desc
        limit 200
      ) t
    )
  );
end;
$$;

create or replace function public.admin_close_report(target uuid, reopen boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  update public.problem_reports set status = case when reopen then 'open' else 'closed' end where id = target;
end;
$$;

revoke execute on function public.admin_trust() from public, anon;
revoke execute on function public.admin_close_report(uuid, boolean) from public, anon;
grant execute on function public.admin_trust() to authenticated;
grant execute on function public.admin_close_report(uuid, boolean) to authenticated;
