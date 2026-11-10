-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- A shift's pay can be an hourly rate or a flat amount for the whole shift.
-- Safe to run more than once.

alter table public.shifts add column if not exists pay_type text not null default 'hour';
alter table public.shifts drop constraint if exists shifts_pay_type_check;
alter table public.shifts add constraint shifts_pay_type_check check (pay_type in ('hour', 'shift'));

-- A flat amount for a shift can be larger than an hourly rate.
alter table public.shifts alter column pay_rate type numeric(8, 2);
