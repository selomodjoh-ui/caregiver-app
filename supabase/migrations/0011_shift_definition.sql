-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Lets a home say in its own words what its shift covers, or the hours it is asking for.
-- Safe to run more than once.

alter table public.shifts add column if not exists pay_note text;
alter table public.shifts drop constraint if exists shifts_pay_note_check;
alter table public.shifts add constraint shifts_pay_note_check check (char_length(pay_note) <= 300);
