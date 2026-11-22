create or replace function public.expire_stale_live_calls_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.live_calls
  set status = 'ended'
  where status = 'ringing'
    and created_at < now() - interval '60 seconds'
    and (
      caller_id = (select auth.uid())
      or receiver_id = (select auth.uid())
    );

  return new;
end;
$$;

create trigger live_calls_expire_stale_before_insert
  before insert on public.live_calls
  for each row execute function public.expire_stale_live_calls_before_insert();
