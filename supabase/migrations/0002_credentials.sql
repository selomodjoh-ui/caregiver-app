-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It creates the credentials table and a private place to store uploaded documents.

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'hca_cna', 'tb_test', 'cpr_first_aid', 'food_worker',
    'nurse_delegation', 'dementia_mental_health', 'continuing_education'
  )),
  credential_number text,
  expires_on date,
  file_path text,
  status text not null default 'in_review' check (status in ('in_review', 'verified')),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

alter table public.credentials enable row level security;

-- Each caregiver sees and manages only their own credentials.
-- They can never mark one as verified: any save puts it back to "in review".
drop policy if exists "Read own credentials" on public.credentials;
create policy "Read own credentials" on public.credentials
  for select using (auth.uid() = user_id);

drop policy if exists "Add own credentials" on public.credentials;
create policy "Add own credentials" on public.credentials
  for insert with check (auth.uid() = user_id and status = 'in_review');

drop policy if exists "Change own credentials" on public.credentials;
create policy "Change own credentials" on public.credentials
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'in_review');

drop policy if exists "Remove own credentials" on public.credentials;
create policy "Remove own credentials" on public.credentials
  for delete using (auth.uid() = user_id);

-- A private storage bucket. Files live in a folder named after the owner's user id.
insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

drop policy if exists "Read own credential files" on storage.objects;
create policy "Read own credential files" on storage.objects
  for select to authenticated
  using (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Upload own credential files" on storage.objects;
create policy "Upload own credential files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Remove own credential files" on storage.objects;
create policy "Remove own credential files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);
