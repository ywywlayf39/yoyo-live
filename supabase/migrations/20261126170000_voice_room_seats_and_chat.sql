create table if not exists public.voice_room_seat_requests (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.voice_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 unique (room_id,user_id)
);
create table if not exists public.voice_room_seats (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.voice_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 seat_number int not null check (seat_number between 1 and 8),
 created_at timestamptz not null default now(),
 unique(room_id,user_id),
 unique(room_id,seat_number)
);
create table if not exists public.voice_room_messages (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.voice_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(body) between 1 and 500),
 created_at timestamptz not null default now()
);
alter table public.voice_room_seat_requests enable row level security;
alter table public.voice_room_seats enable row level security;
alter table public.voice_room_messages enable row level security;
drop policy if exists "voice seat requests visible in live rooms" on public.voice_room_seat_requests;
create policy "voice seat requests visible in live rooms" on public.voice_room_seat_requests for select to authenticated using (exists(select 1 from public.voice_rooms r where r.id=room_id and r.status='live'));
drop policy if exists "members request own voice seat" on public.voice_room_seat_requests;
create policy "members request own voice seat" on public.voice_room_seat_requests for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.voice_rooms r where r.id=room_id and r.status='live'));
drop policy if exists "host manages voice seat requests" on public.voice_room_seat_requests;
create policy "host manages voice seat requests" on public.voice_room_seat_requests for update to authenticated using (exists(select 1 from public.voice_rooms r where r.id=room_id and r.host_id=(select auth.uid()))) with check (exists(select 1 from public.voice_rooms r where r.id=room_id and r.host_id=(select auth.uid())));
drop policy if exists "voice seats visible in live rooms" on public.voice_room_seats;
create policy "voice seats visible in live rooms" on public.voice_room_seats for select to authenticated using (exists(select 1 from public.voice_rooms r where r.id=room_id and r.status='live'));
drop policy if exists "host manages voice seats" on public.voice_room_seats;
create policy "host manages voice seats" on public.voice_room_seats for all to authenticated using (exists(select 1 from public.voice_rooms r where r.id=room_id and r.host_id=(select auth.uid()))) with check (exists(select 1 from public.voice_rooms r where r.id=room_id and r.host_id=(select auth.uid())));
drop policy if exists "voice chat visible in live rooms" on public.voice_room_messages;
create policy "voice chat visible in live rooms" on public.voice_room_messages for select to authenticated using (exists(select 1 from public.voice_rooms r where r.id=room_id and r.status='live'));
drop policy if exists "members send voice chat" on public.voice_room_messages;
create policy "members send voice chat" on public.voice_room_messages for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.voice_rooms r where r.id=room_id and r.status='live'));
grant select,insert,update,delete on public.voice_room_seat_requests,public.voice_room_seats,public.voice_room_messages to authenticated;

drop policy if exists "members retry own voice seat requests" on public.voice_room_seat_requests;
create policy "members retry own voice seat requests" on public.voice_room_seat_requests for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and status='pending');
drop policy if exists "members leave own voice seats" on public.voice_room_seats;
create policy "members leave own voice seats" on public.voice_room_seats for delete to authenticated using (user_id=(select auth.uid()));
do $$ begin alter publication supabase_realtime add table public.voice_room_seat_requests; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.voice_room_seats; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.voice_room_messages; exception when duplicate_object then null; end $$;
