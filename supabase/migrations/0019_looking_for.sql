-- Lets a caregiver say what kind of work they want ("nights only", "weekends"),
-- and lets homes read that note on the caregiver's card.

alter table public.profiles add column if not exists looking_for text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_looking_for_length') then
    alter table public.profiles
      add constraint profiles_looking_for_length check (looking_for is null or char_length(looking_for) <= 300);
  end if;
end $$;

-- People may edit their own note, alongside the details 0018 already allows.
grant update (looking_for) on public.profiles to authenticated;

-- Homes see first name, surname initial and the note. Phone, address and sex stay private.
create or replace view public.caregiver_cards as
  select id, first_name, left(surname, 1) as surname_initial, looking_for
  from public.profiles
  where role = 'caregiver';

revoke all on public.caregiver_cards from anon;
grant select on public.caregiver_cards to authenticated;
