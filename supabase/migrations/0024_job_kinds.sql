-- Job types become live-in, live-out and shifts.
alter table public.jobs drop constraint if exists jobs_kind_check;
update public.jobs set kind = 'live_out' where kind = 'full_time';
update public.jobs set kind = 'shifts' where kind = 'part_time';
alter table public.jobs add constraint jobs_kind_check check (kind in ('live_in', 'live_out', 'shifts'));
