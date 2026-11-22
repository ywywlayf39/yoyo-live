-- Give the two repeated animal/dragon gift variants their own audio identities.
update public.gift_catalog
set sound_key = 'royal-tiger-roar'
where animation_key = 'royal-tiger-leap' and sound_key = 'tiger-roar';

update public.gift_catalog
set sound_key = 'mega-dragon-roar'
where animation_key = 'mega-galaxy-dragon' and sound_key = 'dragon-roar';

do $$
begin
  if exists (
    select 1 from public.gift_catalog
    where active
    group by sound_key
    having count(*) > 1
  ) then
    raise exception 'Active gift sound keys must be unique';
  end if;
end $$;
