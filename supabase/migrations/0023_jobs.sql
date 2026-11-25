-- Permanent and long-term jobs, posted by homes and applied for by caregivers.
-- Shifts cover one day; a job is an ongoing position.
-- Safe to run more than once.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (owner_id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  kind text not null check (kind in ('full_time', 'part_time', 'live_in')),
  schedule text check (char_length(schedule) <= 200),
  pay_amount numeric(8, 2) check (pay_amount >= 0),
  pay_unit text not null default 'hour' check (pay_unit in ('hour', 'day', 'month')),
  start_date date,
  requirements text[] not null default '{}',
  description text check (char_length(description) <= 1500),
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_at timestamptz not null default now(),
  -- A post drops off the list after 30 days unless the home renews it.
  expires_on date not null default (current_date + 30)
);
create index if not exists jobs_home_idx on public.jobs (home_id);
create index if not exists jobs_open_idx on public.jobs (expires_on) where status = 'open';
alter table public.jobs enable row level security;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  caregiver_id uuid not null references auth.users (id) on delete cascade,
  note text check (char_length(note) <= 500),
  status text not null default 'applied'
    check (status in ('applied', 'shortlisted', 'hired', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (job_id, caregiver_id)
);
create index if not exists job_applications_caregiver_idx on public.job_applications (caregiver_id);
alter table public.job_applications enable row level security;

create or replace function public.owns_job(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jobs where id = target and home_id = auth.uid());
$$;

create or replace function public.applied_to_job(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.job_applications where job_id = target and caregiver_id = auth.uid());
$$;

-- How many jobs a home may have open at once: five on Plus, one otherwise.
create or replace function public.job_limit(target uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select plan from public.homes where owner_id = target) = 'plus' then 5 else 1 end;
$$;

create or replace function public.guard_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_now integer;
begin
  -- Changes made from the dashboard are not limited.
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.home_id <> old.home_id then
      raise exception 'A job cannot be moved to another home.';
    end if;
  end if;
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open' or old.expires_on < current_date) then
    if new.expires_on > current_date + 30 then
      new.expires_on := current_date + 30;
    end if;
    select count(*) into open_now
      from public.jobs
     where home_id = new.home_id and status = 'open' and expires_on >= current_date
       and id <> new.id;
    if open_now >= public.job_limit(new.home_id) then
      raise exception 'Your plan allows % open job(s) at a time. Close one first, or move to Plus.', public.job_limit(new.home_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_job on public.jobs;
create trigger guard_job before insert or update on public.jobs
  for each row execute function public.guard_job();

-- Who may change a job application, and to what.
create or replace function public.guard_job_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.job_id <> old.job_id or new.caregiver_id <> old.caregiver_id then
    raise exception 'An application cannot be moved.';
  end if;
  if auth.uid() = old.caregiver_id then
    if new.status not in ('applied', 'withdrawn') or old.status not in ('applied', 'withdrawn', 'shortlisted') then
      raise exception 'You can only withdraw or re-send your own application.';
    end if;
  else
    if new.note is distinct from old.note then
      raise exception 'Only the caregiver can change their note.';
    end if;
    if new.status not in ('applied', 'shortlisted', 'hired', 'declined') or old.status = 'withdrawn' then
      raise exception 'That change is not allowed.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_job_application on public.job_applications;
create trigger guard_job_application before update on public.job_applications
  for each row execute function public.guard_job_application();

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'Read open jobs and own jobs') then
    create policy "Read open jobs and own jobs" on public.jobs
      for select to authenticated using (
        (select auth.uid()) = home_id
        or (status = 'open' and expires_on >= current_date and public.home_active(home_id))
        or public.applied_to_job(id)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'Homes post own jobs') then
    create policy "Homes post own jobs" on public.jobs
      for insert to authenticated with check (
        (select auth.uid()) = home_id
        and public.my_role() = 'provider'
        and public.home_active(home_id)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'Homes change own jobs') then
    create policy "Homes change own jobs" on public.jobs
      for update to authenticated
      using ((select auth.uid()) = home_id) with check ((select auth.uid()) = home_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_applications' and policyname = 'Read own job applications') then
    create policy "Read own job applications" on public.job_applications
      for select to authenticated using ((select auth.uid()) = caregiver_id or public.owns_job(job_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_applications' and policyname = 'Caregivers apply for jobs') then
    create policy "Caregivers apply for jobs" on public.job_applications
      for insert to authenticated with check (
        (select auth.uid()) = caregiver_id
        and status = 'applied'
        and public.my_role() = 'caregiver'
        and exists (
          select 1 from public.jobs j
          where j.id = job_id and j.status = 'open' and j.expires_on >= current_date
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_applications' and policyname = 'Both sides update job applications') then
    create policy "Both sides update job applications" on public.job_applications
      for update to authenticated
      using ((select auth.uid()) = caregiver_id or public.owns_job(job_id))
      with check ((select auth.uid()) = caregiver_id or public.owns_job(job_id));
  end if;
end $$;

revoke all on public.jobs from anon;
revoke all on public.job_applications from anon;
grant select, insert, update on public.jobs to authenticated;
grant select, insert, update on public.job_applications to authenticated;
revoke execute on function public.owns_job(uuid) from public, anon;
revoke execute on function public.applied_to_job(uuid) from public, anon;
revoke execute on function public.job_limit(uuid) from public, anon;
grant execute on function public.owns_job(uuid) to authenticated;
grant execute on function public.applied_to_job(uuid) to authenticated;
grant execute on function public.job_limit(uuid) to authenticated;

-- Caregivers can say they are open to permanent work; homes see it on their card.
alter table public.profiles add column if not exists open_to_permanent boolean not null default false;
grant update (open_to_permanent) on public.profiles to authenticated;

create or replace view public.caregiver_cards as
  select id, first_name, left(surname, 1) as surname_initial, looking_for, open_to_permanent
  from public.profiles
  where role = 'caregiver';

revoke all on public.caregiver_cards from anon;
grant select on public.caregiver_cards to authenticated;
