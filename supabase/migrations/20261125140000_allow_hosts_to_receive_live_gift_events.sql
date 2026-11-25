drop policy if exists "View live gift events in joined rooms" on public.live_gift_events;
create policy "View live gift events as host or joined viewer"
  on public.live_gift_events for select to authenticated
  using (
    exists (
      select 1
      from public.live_rooms r
      where r.room_name = live_gift_events.room_name
        and r.status = 'live'
        and r.host_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.live_room_viewers v
      join public.live_rooms r on r.room_name = v.room_name
      where v.room_name = live_gift_events.room_name
        and v.user_id = (select auth.uid())
        and v.joined_at > now() - interval '2 hours'
        and r.status = 'live'
    )
  );