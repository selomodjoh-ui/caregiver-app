-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Lets a provider message a caregiver directly, without a shift behind it.
-- Safe to run more than once.

-- A direct conversation has no shift; it is identified by the home and the caregiver.
alter table public.messages alter column shift_id drop not null;
alter table public.messages
  add column if not exists home_id uuid references auth.users (id) on delete cascade;

alter table public.messages drop constraint if exists messages_has_thread;
alter table public.messages
  add constraint messages_has_thread check (shift_id is not null or home_id is not null);

create index if not exists messages_direct on public.messages (home_id, caregiver_id, created_at)
  where shift_id is null;

-- Has this home already written to this caregiver?
create or replace function public.home_wrote_to(home uuid, caregiver uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.messages
    where shift_id is null and home_id = home and caregiver_id = caregiver and sender_id = home
  );
$$;

drop policy if exists "Read own conversations" on public.messages;
create policy "Read own conversations" on public.messages
  for select using (
    (shift_id is not null and (auth.uid() = caregiver_id or public.owns_shift(shift_id)))
    or (shift_id is null and (auth.uid() = caregiver_id or auth.uid() = home_id))
  );

-- Shift conversations: as before, both sides once there is an application.
-- Direct conversations: the provider starts; the caregiver can reply after that.
drop policy if exists "Send in own conversations" on public.messages;
create policy "Send in own conversations" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and (
      (
        shift_id is not null
        and home_id is null
        and (auth.uid() = caregiver_id or public.owns_shift(shift_id))
        and exists (
          select 1 from public.applications a
          where a.shift_id = messages.shift_id and a.caregiver_id = messages.caregiver_id
        )
      )
      or (
        shift_id is null
        and home_id is not null
        and (
          (auth.uid() = home_id and public.my_role() = 'provider' and public.is_caregiver(caregiver_id))
          or (auth.uid() = caregiver_id and public.home_wrote_to(home_id, caregiver_id))
        )
      )
    )
  );
