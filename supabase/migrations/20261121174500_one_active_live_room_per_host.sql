create unique index live_rooms_one_active_per_host_idx on public.live_rooms (host_id) where status = 'live';
