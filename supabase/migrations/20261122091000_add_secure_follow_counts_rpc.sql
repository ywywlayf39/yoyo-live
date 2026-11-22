create or replace function public.get_follow_counts(p_user_id uuid)
returns table (followers_count bigint, following_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
 if auth.uid() is null or p_user_id is null then raise exception 'Authentication required'; end if;
 if exists (select 1 from public.user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p_user_id) or (b.blocker_id=p_user_id and b.blocked_id=auth.uid())) then
  return query select 0::bigint,0::bigint; return;
 end if;
 return query select (select count(*) from public.user_follows f where f.following_id=p_user_id),(select count(*) from public.user_follows f where f.follower_id=p_user_id);
end; $$;
revoke all on function public.get_follow_counts(uuid) from public;
grant execute on function public.get_follow_counts(uuid) to authenticated;
