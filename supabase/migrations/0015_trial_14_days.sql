-- Step 15: the free trial for homes is 14 days.
-- Applies to homes that join from now on. Homes that already joined keep
-- the end date they were given. Safe to run more than once.

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
      new.plan_until := current_date + 14;
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
set features = array_replace(
  array_replace(features, 'Free for your first 90 days', 'Free for your first 14 days'),
  'Free for your first 30 days', 'Free for your first 14 days')
where id = 'pilot';
