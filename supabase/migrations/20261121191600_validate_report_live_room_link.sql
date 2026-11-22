drop policy if exists "Users submit own reports" on public.user_reports;
create policy "Users submit own reports"
on public.user_reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and reported_user_id <> (select auth.uid())
  and (
    live_room_id is null
    or exists (
      select 1
      from public.live_rooms lr
      where lr.id = user_reports.live_room_id
        and lr.host_id = user_reports.reported_user_id
        and lr.status = 'live'
    )
  )
);
