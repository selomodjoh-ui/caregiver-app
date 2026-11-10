-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Free times become Day and Night only (was morning, evening, night).
-- Existing entries are carried over: morning becomes day, evening becomes night.
-- Safe to run more than once.

alter table public.availability drop constraint if exists availability_part_check;

insert into public.availability (user_id, day, part)
  select user_id, day, 'day' from public.availability where part = 'morning'
  on conflict do nothing;

insert into public.availability (user_id, day, part)
  select user_id, day, 'night' from public.availability where part = 'evening'
  on conflict do nothing;

delete from public.availability where part in ('morning', 'evening');

alter table public.availability
  add constraint availability_part_check check (part in ('day', 'night'));
