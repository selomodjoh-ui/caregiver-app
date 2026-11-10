-- Run this once in the Supabase dashboard, after the packages script.
-- Changes the free pilot from 90 days to 30 days for homes that join from now on.
-- Safe to run more than once.

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
