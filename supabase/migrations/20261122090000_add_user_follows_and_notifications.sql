create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_pkey primary key (follower_id, following_id),
  constraint user_follows_no_self check (follower_id <> following_id)
);
create index if not exists user_follows_following_created_idx on public.user_follows (following_id, created_at desc);
create index if not exists user_follows_follower_created_idx on public.user_follows (follower_id, created_at desc);
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  notification_type text not null check (notification_type in ('new_follower')),
  title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists user_notifications_recipient_created_idx on public.user_notifications (recipient_id, created_at desc);
alter table public.user_follows enable row level security;
alter table public.user_notifications enable row level security;
drop policy if exists "Users can view follow relationships involving them" on public.user_follows;
create policy "Users can view follow relationships involving them" on public.user_follows for select to authenticated using ((select auth.uid()) = follower_id or (select auth.uid()) = following_id);
drop policy if exists "Users can follow themselves as follower" on public.user_follows;
create policy "Users can follow themselves as follower" on public.user_follows for insert to authenticated with check (
  (select auth.uid()) = follower_id and follower_id <> following_id
  and not exists (select 1 from public.user_blocks b where (b.blocker_id = follower_id and b.blocked_id = following_id) or (b.blocker_id = following_id and b.blocked_id = follower_id))
);
drop policy if exists "Users can unfollow themselves" on public.user_follows;
create policy "Users can unfollow themselves" on public.user_follows for delete to authenticated using ((select auth.uid()) = follower_id);
drop policy if exists "Users can read their own notifications" on public.user_notifications;
create policy "Users can read their own notifications" on public.user_notifications for select to authenticated using ((select auth.uid()) = recipient_id);
drop policy if exists "Users can mark their own notifications read" on public.user_notifications;
create policy "Users can mark their own notifications read" on public.user_notifications for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
grant select, insert, delete on public.user_follows to authenticated;
grant select, update on public.user_notifications to authenticated;
create or replace function public.notify_new_follower() returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
 select p.display_name into actor_name from public.profiles p where p.id = new.follower_id;
 insert into public.user_notifications(recipient_id,actor_id,notification_type,title,body)
 values(new.following_id,new.follower_id,'new_follower','متابع جديد 💗',coalesce(actor_name,'أحد أعضاء YOYO LIVE') || ' بدأ متابعتك.');
 return new;
end; $$;
drop trigger if exists user_follows_notify_new_follower on public.user_follows;
create trigger user_follows_notify_new_follower after insert on public.user_follows for each row execute function public.notify_new_follower();
do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_notifications') then
  alter publication supabase_realtime add table public.user_notifications;
 end if;
end $$;
