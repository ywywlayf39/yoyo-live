drop policy if exists "Authenticated users can view active live rooms" on public.live_rooms;
create policy "Authenticated users can view unblocked active live rooms"
  on public.live_rooms
  for select
  to authenticated
  using (
    host_id = (select auth.uid())
    or (
      status = 'live'
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = live_rooms.host_id)
           or (b.blocker_id = live_rooms.host_id and b.blocked_id = (select auth.uid()))
      )
    )
  );

drop policy if exists "Users can start calls to other members" on public.live_calls;
create policy "Users can start calls when neither party blocked"
  on public.live_calls
  for insert
  to authenticated
  with check (
    caller_id = (select auth.uid())
    and receiver_id <> (select auth.uid())
    and status = 'ringing'
    and ended_at is null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = caller_id and b.blocked_id = receiver_id)
         or (b.blocker_id = receiver_id and b.blocked_id = caller_id)
    )
  );
