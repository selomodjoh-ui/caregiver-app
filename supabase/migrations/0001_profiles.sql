-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It creates the profiles table and fills it in automatically when someone signs up.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('caregiver', 'provider')),
  first_name text not null,
  surname text not null,
  sex text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

-- Row level security: each person can see and edit only their own profile.
-- Letting providers view caregiver profiles comes with the shift features.
alter table public.profiles enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Copy the sign-up form's answers into profiles when a new account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, first_name, surname, sex, phone, address)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'provider' then 'provider' else 'caregiver' end,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'surname', ''),
    new.raw_user_meta_data ->> 'sex',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'address'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
