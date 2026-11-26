-- Explicitly remove Supabase default anon grants from voice-room RPCs.
-- These endpoints require an authenticated member and validate auth.uid().
revoke all on function public.yoyo_initialize_voice_room_seats() from public, anon;
revoke all on function public.request_voice_room_seat(uuid) from public, anon;
revoke all on function public.manage_voice_room_seat(uuid, integer, text, uuid) from public, anon;
revoke all on function public.send_voice_room_gift(uuid, uuid, integer, uuid, uuid) from public, anon;
revoke all on function public.reject_voice_room_seat_request(uuid, uuid) from public, anon;
revoke all on function public.leave_voice_room_seat(uuid) from public, anon;
revoke all on function public.join_voice_room(uuid) from public, anon;
revoke all on function public.leave_voice_room(uuid) from public, anon;

grant execute on function public.request_voice_room_seat(uuid) to authenticated;
grant execute on function public.manage_voice_room_seat(uuid, integer, text, uuid) to authenticated;
grant execute on function public.send_voice_room_gift(uuid, uuid, integer, uuid, uuid) to authenticated;
grant execute on function public.reject_voice_room_seat_request(uuid, uuid) to authenticated;
grant execute on function public.leave_voice_room_seat(uuid) to authenticated;
grant execute on function public.join_voice_room(uuid) to authenticated;
grant execute on function public.leave_voice_room(uuid) to authenticated;
