-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- A shift can now need more than one caregiver.
-- Safe to run more than once.

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
