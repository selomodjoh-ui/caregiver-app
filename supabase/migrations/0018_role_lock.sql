-- Stops a signed-in person changing their own account type.
-- Before this, a caregiver could switch their profile to "provider" from outside
-- the app and then read what only homes are meant to see.
-- People may still correct their own name, sex, phone and address.

revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;
grant update (first_name, surname, sex, phone, address) on public.profiles to authenticated;
