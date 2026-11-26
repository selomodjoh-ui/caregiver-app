-- Caregivers pick the kinds of work they would take: day shift, night shift,
-- live-in, live-out, reliever, on-call. Homes see the picks on the caregiver's card.
-- Choosing live-in or live-out is what marks someone as open to a permanent job.
-- Safe to run more than once.

alter table public.profiles add column if not exists shift_types text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_shift_types_check') then
    alter table public.profiles add constraint profiles_shift_types_check
      check (shift_types <@ array['day', 'night', 'live_in', 'live_out', 'reliever', 'on_call']::text[]);
  end if;
end $$;

-- People who had ticked "open to a permanent job" keep that meaning.
update public.profiles
   set shift_types = array['live_in', 'live_out']
 where open_to_permanent and shift_types = '{}';

create or replace function public.sync_open_to_permanent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.shift_types is distinct from old.shift_types then
    new.open_to_permanent := new.shift_types && array['live_in', 'live_out']::text[];
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'sync_open_to_permanent' and tgrelid = 'public.profiles'::regclass) then
    create trigger sync_open_to_permanent before insert or update on public.profiles
      for each row execute function public.sync_open_to_permanent();
  end if;
end $$;

grant update (shift_types) on public.profiles to authenticated;

create or replace view public.caregiver_cards as
  select id, first_name, left(surname, 1) as surname_initial, looking_for, open_to_permanent, shift_types
  from public.profiles
  where role = 'caregiver';

revoke all on public.caregiver_cards from anon;
grant select on public.caregiver_cards to authenticated;
