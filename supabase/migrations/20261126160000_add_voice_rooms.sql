create table if not exists public.voice_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null unique,
  title text not null check (char_length(title) between 2 and 80),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'live' check (status in ('live','ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.voice_rooms enable row level security;
drop policy if exists "Authenticated users can view live voice rooms" on public.voice_rooms;
create policy "Authenticated users can view live voice rooms"
on public.voice_rooms for select to authenticated using (status = 'live' or host_id = (select auth.uid()));
drop policy if exists "Users can create own voice rooms" on public.voice_rooms;
create policy "Users can create own voice rooms"
on public.voice_rooms for insert to authenticated with check (host_id = (select auth.uid()));
drop policy if exists "Hosts can update own voice rooms" on public.voice_rooms;
create policy "Hosts can update own voice rooms"
on public.voice_rooms for update to authenticated using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
grant select, insert, update on public.voice_rooms to authenticated;
