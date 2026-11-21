drop policy if exists "Users view own blocks" on public.user_blocks;
create policy "Users view blocks involving themselves"
  on public.user_blocks
  for select
  to authenticated
  using (
    blocker_id = (select auth.uid())
    or blocked_id = (select auth.uid())
  );

drop policy if exists "Participants can read direct messages" on public.direct_messages;
create policy "Participants can read unblocked direct messages"
  on public.direct_messages
  for select
  to authenticated
  using (
    ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id)
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.sender_id
        and b.blocked_id = direct_messages.recipient_id
    )
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.recipient_id
        and b.blocked_id = direct_messages.sender_id
    )
  );

drop policy if exists "Users can send direct messages" on public.direct_messages;
create policy "Users can send messages when neither party blocked"
  on public.direct_messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and sender_id <> recipient_id
    and exists (
      select 1 from public.member_public_profiles p
      where p.id = direct_messages.recipient_id
    )
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.sender_id
        and b.blocked_id = direct_messages.recipient_id
    )
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.recipient_id
        and b.blocked_id = direct_messages.sender_id
    )
  );

drop policy if exists "Recipients mark direct messages as read" on public.direct_messages;
create policy "Recipients mark unblocked direct messages as read"
  on public.direct_messages
  for update
  to authenticated
  using (
    (select auth.uid()) = recipient_id
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.sender_id
        and b.blocked_id = direct_messages.recipient_id
    )
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.recipient_id
        and b.blocked_id = direct_messages.sender_id
    )
  )
  with check (
    (select auth.uid()) = recipient_id
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.sender_id
        and b.blocked_id = direct_messages.recipient_id
    )
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = direct_messages.recipient_id
        and b.blocked_id = direct_messages.sender_id
    )
  );
