drop policy if exists "View gifts in joined live rooms" on public.gift_transfers;

create table if not exists public.live_gift_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null unique references public.gift_transfers(id) on delete cascade,
  room_name text not null,
  sender_id uuid references auth.users(id) on delete set null,
  receiver_id uuid references auth.users(id) on delete set null,
  gift_id uuid references public.gift_catalog(id) on delete set null,
  quantity integer not null check (quantity between 1 and 100),
  created_at timestamptz not null default now()
);

create index if not exists live_gift_events_room_created_idx
  on public.live_gift_events (room_name, created_at desc);

alter table public.live_gift_events enable row level security;
revoke all on public.live_gift_events from anon, public, authenticated;
grant select on public.live_gift_events to authenticated;

drop policy if exists "View live gift events in joined rooms" on public.live_gift_events;
create policy "View live gift events in joined rooms"
  on public.live_gift_events for select to authenticated
  using (
    exists (
      select 1
      from public.live_room_viewers v
      join public.live_rooms r on r.room_name = v.room_name
      where v.room_name = live_gift_events.room_name
        and v.user_id = (select auth.uid())
        and v.joined_at > now() - interval '2 hours'
        and r.status = 'live'
    )
  );

create or replace function private.yoyo_publish_live_gift_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.room_name is not null then
    insert into public.live_gift_events
      (transfer_id, room_name, sender_id, receiver_id, gift_id, quantity, created_at)
    values
      (new.id, new.room_name, new.sender_id, new.receiver_id, new.gift_id, new.quantity, new.created_at)
    on conflict (transfer_id) do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function private.yoyo_publish_live_gift_event() from public, anon, authenticated;

drop trigger if exists yoyo_publish_live_gift_event on public.gift_transfers;
create trigger yoyo_publish_live_gift_event
  after insert on public.gift_transfers
  for each row execute function private.yoyo_publish_live_gift_event();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_gift_events'
  ) then
    alter publication supabase_realtime add table public.live_gift_events;
  end if;
end $$;
