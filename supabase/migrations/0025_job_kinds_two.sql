-- Permanent jobs are live-in or live-out. Shift work stays on the Shifts side.
alter table public.jobs drop constraint if exists jobs_kind_check;
update public.jobs set kind = 'live_out' where kind not in ('live_in', 'live_out');
alter table public.jobs add constraint jobs_kind_check check (kind in ('live_in', 'live_out'));
