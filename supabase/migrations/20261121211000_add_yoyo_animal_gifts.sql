insert into public.gift_catalog
  (name, coin_cost, gross_points, active, category, emoji, description, animation_key, sound_key, sort_order)
select v.name, v.coin_cost, v.gross_points, true, 'animals', v.emoji, v.description, v.animation_key, v.sound_key, v.sort_order
from (values
  ('قطة لطيفة',10,10,'🐱','قطة صغيرة تظهر وسط قلوب وردية','cute-cat-bounce','cat-meow',101),
  ('قطة مرحة',25,25,'🐈','قطة تلعب بكرة صوف ملونة','playful-cat-yarn','playful-meow',102),
  ('القط الأسود',50,50,'🐈‍⬛','قط أسود بعيون ذهبية وهلال مضيء','black-cat-moon','mystic-purr',103),
  ('النمر الأبيض',120,120,'🐅','نمر أبيض يندفع وسط وهج أزرق','white-tiger-leap','tiger-roar',104),
  ('النمر الملكي',300,300,'🐯','نمر ذهبي يقفز وسط شرارات','royal-tiger-leap','tiger-roar',105),
  ('النمر الأسود',500,500,'🐆','فهد أسود يظهر وسط دخان أزرق','black-panther-smoke','panther-growl',106),
  ('عائلة النمور',1000,1000,'🐅','عائلة نمور تظهر معًا في مشهد الغابة','tiger-family-entrance','jungle-ambience',107),
  ('القطة الساحرة',1500,1500,'🐈‍⬛','قطة بنفسجية سحرية مع هالة متوهجة','magic-cat-aura','magic-purr',108),
  ('ملك الغابة',3000,3000,'🦁','أسد ملكي يزأر تحت تاج ذهبي','lion-king-roar','lion-roar',109),
  ('النمر الأسطوري',5000,5000,'🐅','نمر أسطوري يظهر وسط برق بنفسجي','legendary-tiger-storm','epic-tiger-roar',110),
  ('الملك الأسود',10000,10000,'🦁','أسد أسود ملكي على عرش من الذهب','black-king-throne','epic-lion-roar',111)
) as v(name,coin_cost,gross_points,emoji,description,animation_key,sound_key,sort_order)
where not exists (select 1 from public.gift_catalog g where g.name = v.name);
