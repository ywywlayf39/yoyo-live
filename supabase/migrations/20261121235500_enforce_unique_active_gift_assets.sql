update public.gift_catalog
set animation_key = 'royal-king-crown'
where active
  and name = 'تاج الملوك'
  and animation_key = 'royal-crown';

create unique index if not exists gift_catalog_active_sound_key_unique
  on public.gift_catalog (sound_key)
  where active;

create unique index if not exists gift_catalog_active_animation_key_unique
  on public.gift_catalog (animation_key)
  where active;
