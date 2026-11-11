-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Adds the admin screen's data and actions. Only people listed in the admins table can use them.
-- Safe to run more than once.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_guard()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do this.';
  end if;
end;
$$;

-- Admin changes to a home's licence check and package are allowed through.
create or replace function public.protect_home_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.admin_action', true) = '1' then
    return new;
  end if;
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

-- ---------- What the admin screen reads ----------

create or replace function public.admin_overview()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return json_build_object(
    'caregivers', (select count(*) from public.profiles where role = 'caregiver'),
    'providers', (select count(*) from public.profiles where role = 'provider'),
    'homes', (select count(*) from public.homes),
    'new_accounts_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'unconfirmed_accounts', (select count(*) from auth.users where email_confirmed_at is null),
    'credentials_waiting', (select count(*) from public.credentials where status = 'in_review'),
    'credentials_expiring', (select count(*) from public.credentials
                             where expires_on between current_date and current_date + 30),
    'homes_unverified', (select count(*) from public.homes where not license_verified),
    'package_requests', (select count(*) from public.homes where requested_plan is not null),
    'packages_ending', (select count(*) from public.homes
                        where plan_until between current_date and current_date + 7),
    'packages_ended', (select count(*) from public.homes where plan_until < current_date),
    'shifts_open', (select count(*) from public.shifts where status = 'open' and shift_date >= current_date),
    'shifts_filled', (select count(*) from public.shifts where status = 'filled'),
    'shifts_unfilled_past', (select count(*) from public.shifts where status = 'open' and shift_date < current_date),
    'applications', (select count(*) from public.applications),
    'messages', (select count(*) from public.messages),
    'ratings', (select count(*) from public.ratings),
    'average_rating', (select round(avg(stars), 1) from public.ratings)
  );
end;
$$;

create or replace function public.admin_credentials()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select c.id, c.user_id, p.first_name || ' ' || p.surname as name, u.email::text as email,
             p.phone, c.kind, c.credential_number, c.expires_on, c.file_path, c.status, c.updated_at
      from public.credentials c
      join public.profiles p on p.id = c.user_id
      join auth.users u on u.id = c.user_id
      order by (c.status = 'in_review') desc, c.updated_at desc
    ) t
  );
end;
$$;

create or replace function public.admin_homes()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select h.owner_id, h.name, p.first_name || ' ' || p.surname as owner_name, u.email::text as email,
             h.phone, h.address, h.license_number, h.license_verified, h.years_operating,
             h.bed_bound + h.assisted + h.independent as residents,
             h.plan, h.plan_until, h.requested_plan,
             (select count(*) from public.shifts s where s.home_id = h.owner_id) as shifts_posted,
             (select count(*) from public.shifts s where s.home_id = h.owner_id and s.status = 'filled') as shifts_filled,
             r.average as rating, coalesce(r.total, 0) as ratings
      from public.homes h
      join public.profiles p on p.id = h.owner_id
      join auth.users u on u.id = h.owner_id
      left join public.rating_summary r on r.ratee_id = h.owner_id
      order by (h.requested_plan is not null) desc, (not h.license_verified) desc, h.name
    ) t
  );
end;
$$;

create or replace function public.admin_people()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select u.id, coalesce(p.role, 'none') as role,
             coalesce(nullif(btrim(p.first_name || ' ' || p.surname), ''), '(no name)') as name,
             u.email::text as email, p.phone, u.created_at,
             (u.email_confirmed_at is not null) as confirmed, u.last_sign_in_at,
             (select count(*) from public.credentials c where c.user_id = u.id) as credentials,
             (select count(*) from public.applications a where a.caregiver_id = u.id and a.status = 'accepted') as shifts_worked,
             r.average as rating
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.rating_summary r on r.ratee_id = u.id
      order by u.created_at desc
    ) t
  );
end;
$$;

create or replace function public.admin_shifts()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select s.id, h.name as home, s.shift_date, s.start_time, s.end_time, s.pay_rate, s.pay_type,
             s.status, s.spots,
             (select count(*) from public.applications a where a.shift_id = s.id and a.status = 'accepted') as accepted,
             (select count(*) from public.applications a where a.shift_id = s.id and a.status in ('applied', 'offered')) as waiting
      from public.shifts s
      join public.homes h on h.owner_id = s.home_id
      where s.shift_date >= current_date - 60
      order by s.shift_date desc, s.start_time desc
      limit 200
    ) t
  );
end;
$$;

-- ---------- What the admin can change ----------

create or replace function public.admin_review_credential(target uuid, verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  update public.credentials set status = case when verified then 'verified' else 'in_review' end where id = target;
end;
$$;

create or replace function public.admin_verify_home(target uuid, verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  perform set_config('app.admin_action', '1', true);
  update public.homes set license_verified = verified where owner_id = target;
end;
$$;

create or replace function public.admin_set_plan(target uuid, new_plan text, until date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  perform set_config('app.admin_action', '1', true);
  update public.homes
  set plan = new_plan, plan_until = until, requested_plan = null
  where owner_id = target;
end;
$$;

create or replace function public.admin_set_price(plan_id text, price numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  if price is not null and price < 0 then
    raise exception 'A price cannot be negative.';
  end if;
  update public.plans set price_usd = price where id = plan_id;
end;
$$;

-- The admin can open uploaded credential documents to check them.
drop policy if exists "Admins read credential files" on storage.objects;
create policy "Admins read credential files" on storage.objects
  for select to authenticated
  using (bucket_id = 'credentials' and public.is_admin());

revoke all on function
  public.admin_guard(), public.admin_overview(), public.admin_credentials(), public.admin_homes(),
  public.admin_people(), public.admin_shifts(), public.admin_review_credential(uuid, boolean),
  public.admin_verify_home(uuid, boolean), public.admin_set_plan(uuid, text, date),
  public.admin_set_price(text, numeric)
from public, anon;

grant execute on function
  public.is_admin(), public.admin_overview(), public.admin_credentials(), public.admin_homes(),
  public.admin_people(), public.admin_shifts(), public.admin_review_credential(uuid, boolean),
  public.admin_verify_home(uuid, boolean), public.admin_set_plan(uuid, text, date),
  public.admin_set_price(text, numeric)
to authenticated;
