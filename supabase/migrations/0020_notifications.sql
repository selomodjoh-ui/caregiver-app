-- Message notifications: an unread badge, and what is needed to send an email
-- and a phone notification when a message arrives.
-- Safe to run more than once.

-- 1. When the other person has read a message.
-- Messages sent before this feature existed count as already read,
-- so nobody opens the app to a pile of old "new" messages.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'read_at'
  ) then
    alter table public.messages add column read_at timestamptz;
    update public.messages set read_at = created_at;
  end if;
end $$;
create index if not exists messages_unread_idx on public.messages (caregiver_id) where read_at is null;

-- Marks everything the other person sent in one conversation as read.
-- A shift conversation is named by its shift; a direct one by the home.
create or replace function public.mark_thread_read(p_shift uuid, p_home uuid, p_caregiver uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages m
     set read_at = now()
   where m.read_at is null
     and m.sender_id <> auth.uid()
     and m.caregiver_id = p_caregiver
     and (
       (p_shift is not null and m.shift_id = p_shift
          and (auth.uid() = m.caregiver_id or public.owns_shift(m.shift_id)))
       or (p_shift is null and m.shift_id is null and m.home_id = p_home
          and (auth.uid() = m.caregiver_id or auth.uid() = m.home_id))
     );
$$;
revoke execute on function public.mark_thread_read(uuid, uuid, uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid, uuid, uuid) to authenticated;

-- 2. Phones and browsers that asked for notifications.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "See own devices" on public.push_subscriptions;
create policy "See own devices" on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);
drop policy if exists "Remove own devices" on public.push_subscriptions;
create policy "Remove own devices" on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Saves this device for the signed-in person. If someone else used the same
-- phone before, the device now belongs to whoever is signed in.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- 3. Server-only records. The app itself can read neither.
-- The key pair that signs phone notifications; the server creates it on first use.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- When we last emailed someone about a conversation, so a busy chat sends one email.
create table if not exists public.notify_log (
  recipient_id uuid not null references auth.users (id) on delete cascade,
  thread_key text not null,
  emailed_at timestamptz not null default now(),
  primary key (recipient_id, thread_key)
);
alter table public.notify_log enable row level security;
revoke all on public.notify_log from anon, authenticated;
