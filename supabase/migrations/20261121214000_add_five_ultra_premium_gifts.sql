insert into public.gift_catalog
  (name, coin_cost, gross_points, active, category, emoji, description, animation_key, sound_key, sort_order)
select v.name, v.coin_cost, v.gross_points, true, 'legendary', v.emoji, v.description, v.animation_key, v.sound_key, v.sort_order
from (values
  ('أسد العاصفة الملكي',15000,15000,'🦁','أسد مهيب يدخل وسط برق ذهبي وعاصفة من الضوء','storm-lion-royal-entry','thunder-lion-roar',201),
  ('نمر مجرة الألماس',20000,20000,'🐅','نمر مرصع بالألماس يعبر مجرة متلألئة','diamond-galaxy-tiger','cosmic-tiger-roar',202),
  ('تنين العرش الذهبي',30000,30000,'🐉','تنين ذهبي يلتف حول عرش مضيء','golden-throne-dragon','golden-dragon-roar',203),
  ('إمبراطور الغابة',50000,50000,'👑','أسد أسطوري يعتلي عرشًا وسط غابة ذهبية','jungle-emperor-throne','emperor-lion-roar',204),
  ('مجرة YOYO الخالدة',100000,100000,'🌌','مشهد كوني ضخم تتوسطه شارة YOYO LIVE وتاج من النجوم','yoyo-eternal-galaxy','yoyo-epic-stinger',205)
) as v(name,coin_cost,gross_points,emoji,description,animation_key,sound_key,sort_order)
where not exists (select 1 from public.gift_catalog g where g.name = v.name);
