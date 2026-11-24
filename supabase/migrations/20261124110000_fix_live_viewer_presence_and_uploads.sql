-- Reliable live viewer presence and stale broadcaster cleanup.
alter table public.live_room_viewers
  add column if not exists last_seen_at timestamptz not null default now();

-- Existing rows predate viewer heartbeats; expire them rather than treating
-- old sessions as currently watching.
update public.live_room_viewers
set last_seen_at = now() - interval '10 minutes';

create index if not exists live_room_viewers_room_last_seen_idx
  on public.live_room_viewers (room_name, last_seen_at desc);

create or replace function public.yoyo_live_viewer_heartbeat(p_room_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_host uuid;
  v_count integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  select r.host_id into v_host
  from public.live_rooms r
  where r.room_name = p_room_name
    and r.status = 'live'
    and r.last_heartbeat_at > now() - interval '45 seconds';
  if not found then raise exception 'البث غير متصل حاليًا'; end if;
  if v_host = v_user then
    delete from public.live_room_viewers
    where room_name = p_room_name and user_id = v_user;
    select count(*)::integer into v_count
    from public.live_room_viewers v
    where v.room_name = p_room_name
      and v.last_seen_at > now() - interval '45 seconds';
    return v_count;
  end if;
  if private.yoyo_is_user_suspended(v_user) then raise exception 'الحساب موقوف حاليًا'; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_user and b.blocked_id = v_host)
       or (b.blocker_id = v_host and b.blocked_id = v_user)
  ) then raise exception 'لا يمكنك مشاهدة هذا البث'; end if;

  insert into public.live_room_viewers(room_name, user_id, joined_at, last_seen_at)
  values (p_room_name, v_user, now(), now())
  on conflict (room_name, user_id)
  do update set last_seen_at = excluded.last_seen_at;

  delete from public.live_room_viewers
  where room_name = p_room_name
    and last_seen_at < now() - interval '45 seconds';

  select count(*)::integer into v_count
  from public.live_room_viewers v
  where v.room_name = p_room_name
    and v.last_seen_at > now() - interval '45 seconds';
  return v_count;
end;
$function$;

create or replace function public.yoyo_live_viewer_leave(p_room_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  delete from public.live_room_viewers
  where room_name = p_room_name and user_id = v_user;
end;
$function$;

create or replace function public.yoyo_expire_stale_live_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.live_rooms
  set status = 'ended', ended_at = now()
  where status = 'live'
    and last_heartbeat_at < now() - interval '45 seconds';
  get diagnostics v_count = row_count;

  delete from public.live_room_viewers v
  where v.last_seen_at < now() - interval '45 seconds'
     or not exists (
       select 1 from public.live_rooms r
       where r.room_name = v.room_name and r.status = 'live'
     );
  return v_count;
end;
$function$;

-- Ensure stale viewer rows cannot authorize a gift transfer. A trigger exception
-- rolls back the entire gift transaction, including wallet balance changes.
create or replace function private.yoyo_validate_live_gift_viewer_presence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.room_name is not null and not exists (
    select 1
    from public.live_room_viewers v
    join public.live_rooms r on r.room_name = v.room_name
    where v.room_name = new.room_name
      and v.user_id = new.sender_id
      and v.last_seen_at > now() - interval '45 seconds'
      and r.status = 'live'
      and r.last_heartbeat_at > now() - interval '45 seconds'
  ) then
    raise exception 'يجب أن تكون داخل البث حاليًا لإرسال هدية';
  end if;
  return new;
end;
$function$;

drop trigger if exists yoyo_validate_live_gift_viewer_presence on public.gift_transfers;
create trigger yoyo_validate_live_gift_viewer_presence
before insert on public.gift_transfers
for each row execute function private.yoyo_validate_live_gift_viewer_presence();

revoke all on function public.yoyo_live_viewer_heartbeat(text) from public, anon;
revoke all on function public.yoyo_live_viewer_leave(text) from public, anon;
revoke all on function public.yoyo_expire_stale_live_rooms() from public, anon;
grant execute on function public.yoyo_live_viewer_heartbeat(text) to authenticated;
grant execute on function public.yoyo_live_viewer_leave(text) to authenticated;
grant execute on function public.yoyo_expire_stale_live_rooms() to authenticated;
