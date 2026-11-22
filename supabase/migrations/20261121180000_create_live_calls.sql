create table public.live_calls (
  id uuid primary key default gen_random_uuid(),
  room_name text not null unique check (room_name ~ '^[A-Za-z0-9_-]{1,128}$'),
  caller_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'rejected', 'ended')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  check (caller_id <> receiver_id)
);

create unique index live_calls_one_active_per_caller_idx
  on public.live_calls (caller_id)
  where status in ('ringing', 'accepted');

create unique index live_calls_one_active_per_receiver_idx
  on public.live_calls (receiver_id)
  where status in ('ringing', 'accepted');

create index live_calls_receiver_created_idx
  on public.live_calls (receiver_id, created_at desc);

alter table public.live_calls enable row level security;
grant select, insert, update on public.live_calls to authenticated;

create policy "Call participants can view their calls"
  on public.live_calls
  for select
  to authenticated
  using (caller_id = (select auth.uid()) or receiver_id = (select auth.uid()));

create policy "Users can start calls to other members"
  on public.live_calls
  for insert
  to authenticated
  with check (
    caller_id = (select auth.uid())
    and receiver_id <> (select auth.uid())
    and status = 'ringing'
    and ended_at is null
  );

create policy "Call participants can update call status"
  on public.live_calls
  for update
  to authenticated
  using (caller_id = (select auth.uid()) or receiver_id = (select auth.uid()))
  with check (caller_id = (select auth.uid()) or receiver_id = (select auth.uid()));

create or replace function public.enforce_live_call_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if new.room_name is distinct from old.room_name
    or new.caller_id is distinct from old.caller_id
    or new.receiver_id is distinct from old.receiver_id
    or new.call_type is distinct from old.call_type
    or new.created_at is distinct from old.created_at then
    raise exception 'Call identity fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'ringing'
      and actor_id = old.receiver_id
      and new.status in ('accepted', 'rejected') then
      if new.status = 'accepted' then
        new.answered_at := now();
      else
        new.ended_at := now();
      end if;
    elsif old.status in ('ringing', 'accepted')
      and actor_id in (old.caller_id, old.receiver_id)
      and new.status = 'ended' then
      new.ended_at := now();
    else
      raise exception 'Invalid call status transition';
    end if;
  elsif new.answered_at is distinct from old.answered_at
    or new.ended_at is distinct from old.ended_at then
    raise exception 'Call timestamps are managed by the database';
  end if;

  return new;
end;
$$;

create trigger live_calls_enforce_transition
  before update on public.live_calls
  for each row execute function public.enforce_live_call_transition();

alter publication supabase_realtime add table public.live_calls;
