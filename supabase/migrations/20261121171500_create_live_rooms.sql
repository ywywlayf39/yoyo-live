create table public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null unique
    check (room_name ~ '^[A-Za-z0-9_-]{1,128}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null check (length(trim(host_name)) between 1 and 80),
  title text not null default 'بث مباشر' check (length(trim(title)) between 1 and 120),
  status text not null default 'live' check (status in ('live', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index live_rooms_active_created_idx
  on public.live_rooms (created_at desc)
  where status = 'live';

alter table public.live_rooms enable row level security;

grant select, insert, update on public.live_rooms to authenticated;

create policy "Authenticated users can view active live rooms"
  on public.live_rooms
  for select
  to authenticated
  using (status = 'live' or host_id = (select auth.uid()));

create policy "Users can start their own live rooms"
  on public.live_rooms
  for insert
  to authenticated
  with check (
    host_id = (select auth.uid())
    and status = 'live'
    and ended_at is null
  );

create policy "Hosts can update their own live rooms"
  on public.live_rooms
  for update
  to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));
