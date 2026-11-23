-- Profile pictures for caregivers and homes.
-- The picture itself is a file at avatars/<user id>/photo.jpg. This table only
-- records who has one, so the app does not go looking for pictures that are not there.
-- Safe to run more than once.

create table if not exists public.profile_photos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.profile_photos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profile_photos' and policyname = 'Signed-in people see who has a picture') then
    create policy "Signed-in people see who has a picture" on public.profile_photos
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profile_photos' and policyname = 'Manage own picture record') then
    create policy "Manage own picture record" on public.profile_photos
      for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;

revoke all on public.profile_photos from anon;
grant select, insert, update, delete on public.profile_photos to authenticated;

-- A private place for the pictures: small JPEG files only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Signed-in people see profile pictures') then
    create policy "Signed-in people see profile pictures" on storage.objects
      for select to authenticated using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Upload own profile picture') then
    create policy "Upload own profile picture" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Replace own profile picture') then
    create policy "Replace own profile picture" on storage.objects
      for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Remove own profile picture') then
    create policy "Remove own profile picture" on storage.objects
      for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
