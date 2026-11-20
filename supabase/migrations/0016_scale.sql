-- Step 16: getting ready for many users.
-- Nothing here changes what people can see or do. It makes the same rules
-- run faster on big tables and closes doors nobody needs. Safe to run more than once.

-- 1. Indexes, so looking up "this home's shifts" or "this person's messages"
--    stays quick when there are many thousands of rows.
create index if not exists applications_caregiver_idx on public.applications (caregiver_id);
create index if not exists shifts_home_idx on public.shifts (home_id);
create index if not exists shifts_open_date_idx on public.shifts (shift_date) where status = 'open';
create index if not exists messages_caregiver_idx on public.messages (caregiver_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists ratings_ratee_idx on public.ratings (ratee_id);
create index if not exists ratings_rater_idx on public.ratings (rater_id);
create index if not exists homes_plan_idx on public.homes (plan);
create index if not exists homes_requested_plan_idx on public.homes (requested_plan);

-- 2. The privacy rules asked "who is signed in?" once for every row they
--    checked. Ask once per request instead. The rules themselves are unchanged.
do $$
declare
  p record;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
      and coalesce(qual, '') !~* 'select auth\.uid\(\)'
      and coalesce(with_check, '') !~* 'select auth\.uid\(\)'
  loop
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then
      stmt := stmt || ' using (' || replace(p.qual, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    if p.with_check is not null then
      stmt := stmt || ' with check (' || replace(p.with_check, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    execute stmt;
  end loop;
end;
$$;

-- 3. People who are not signed in have no reason to call the app's helper
--    functions, and nobody should call the ones that only run automatically.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype or p.prorettype = 'event_trigger'::regtype as automatic
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.automatic then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end;
$$;
