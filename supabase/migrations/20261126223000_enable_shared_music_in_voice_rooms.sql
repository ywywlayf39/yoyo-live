-- Extend the existing shared-music system to audio-only voice rooms.
-- Keep the same storage bucket and synchronized client playback used by video lives.

create or replace function private.yoyo_live_music_control_impl(
  p_room_name text,
  p_action text,
  p_storage_path text default null,
  p_track_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.live_room_music%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_action is null or p_action not in ('play','pause','resume','stop') then
    raise exception 'invalid_music_action';
  end if;

  -- Only the owner of an active video live OR voice room may control its music.
  if not (
    exists (
      select 1 from public.live_rooms lr
      where lr.room_name = p_room_name and lr.host_id = v_uid and lr.status = 'live'
    )
    or exists (
      select 1 from public.voice_rooms vr
      where vr.room_name = p_room_name and vr.host_id = v_uid and vr.status = 'live'
    )
  ) then
    raise exception 'host_only_live_room_required';
  end if;

  if p_action = 'play' then
    if p_storage_path is null or p_storage_path not like v_uid::text || '/%' then
      raise exception 'invalid_music_file_path';
    end if;
    if length(trim(coalesce(p_track_name,''))) not between 1 and 140 then
      raise exception 'invalid_music_track_name';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'live-music' and o.name = p_storage_path
    ) then
      raise exception 'music_file_not_found';
    end if;
    insert into public.live_room_music(
      room_name,host_id,storage_path,track_name,status,started_at,position_seconds,updated_at
    )
    values(p_room_name,v_uid,p_storage_path,trim(p_track_name),'playing',now(),0,now())
    on conflict(room_name) do update
    set host_id=excluded.host_id,
        storage_path=excluded.storage_path,
        track_name=excluded.track_name,
        status='playing',
        started_at=now(),
        position_seconds=0,
        updated_at=now()
    returning * into v_row;
  elsif p_action = 'pause' then
    update public.live_room_music
    set position_seconds=case
          when status='playing' and started_at is not null
          then position_seconds + greatest(0,extract(epoch from (now()-started_at)))
          else position_seconds
        end,
        status='paused',
        started_at=null,
        updated_at=now()
    where room_name=p_room_name and host_id=v_uid
    returning * into v_row;
  elsif p_action = 'resume' then
    update public.live_room_music
    set status='playing',started_at=now(),updated_at=now()
    where room_name=p_room_name and host_id=v_uid and status='paused'
    returning * into v_row;
  else
    update public.live_room_music
    set status='stopped',started_at=null,position_seconds=0,updated_at=now()
    where room_name=p_room_name and host_id=v_uid
    returning * into v_row;
  end if;

  if not found then raise exception 'shared_music_not_found_or_wrong_state'; end if;
  return to_jsonb(v_row);
end;
$function$;

drop policy if exists "Live room members can read shared music" on public.live_room_music;
create policy "Live room members can read shared music"
on public.live_room_music
for select
to authenticated
using (
  host_id = (select auth.uid())
  or exists (
    select 1 from public.live_room_viewers v
    where v.room_name = live_room_music.room_name
      and v.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.voice_rooms vr
    join public.voice_room_members vm on vm.room_id = vr.id
    where vr.room_name = live_room_music.room_name
      and vr.status = 'live'
      and vm.user_id = (select auth.uid())
  )
);

drop policy if exists "Live room members can read shared music files" on storage.objects;
create policy "Live room members can read shared music files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'live-music'
  and exists (
    select 1 from public.live_room_music m
    where m.storage_path = objects.name
  )
);
