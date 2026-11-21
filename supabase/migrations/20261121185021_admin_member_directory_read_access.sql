-- Allow admins (trusted app_metadata role only) to review member directory data.
drop policy if exists "Admins can view all member profiles" on public.profiles;
create policy "Admins can view all member profiles"
on public.profiles
for select
to authenticated
using (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

drop policy if exists "Admins can view all user reports" on public.user_reports;
create policy "Admins can view all user reports"
on public.user_reports
for select
to authenticated
using (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);
