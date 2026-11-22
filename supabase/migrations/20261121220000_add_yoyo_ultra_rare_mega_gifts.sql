-- Add a new ultra-rare gift tier for YOYO LIVE.
-- Idempotent by gift name; does not alter existing gifts or balances.
INSERT INTO public.gift_catalog
  (name, coin_cost, gross_points, active, category, emoji, description, animation_key, sound_key, sort_order)
SELECT v.name, v.coin_cost, v.gross_points, true, 'legendary', v.emoji, v.description,
       v.animation_key, v.sound_key, v.sort_order
FROM (VALUES
  ('تاج الملوك', 150000::bigint, 150000::bigint, '👑', 'تاج ملكي نادر يضيء البث', 'royal-crown', 'royal-fanfare', 201),
  ('يخت الياقوت', 200000::bigint, 200000::bigint, '🛥️', 'يخت فاخر يشق أمواج المجرة', 'ruby-yacht', 'yacht-horn', 202),
  ('قلعة الملوك', 300000::bigint, 300000::bigint, '🏰', 'قلعة ذهبية مهيبة', 'royal-castle', 'castle-impact', 203),
  ('صاروخ المجرة', 500000::bigint, 500000::bigint, '🚀', 'انطلاق صاروخ عبر النجوم', 'galaxy-rocket', 'rocket-launch', 204),
  ('تنين المجرة العملاق', 750000::bigint, 750000::bigint, '🐉', 'تنين أسطوري يحلق حول الشاشة', 'mega-galaxy-dragon', 'dragon-roar', 205),
  ('عرش الإمبراطور', 1000000::bigint, 1000000::bigint, '🪑', 'عرش الإمبراطور الذهبي', 'emperor-throne', 'imperial-hit', 206),
  ('كوكب YOYO الذهبي', 1500000::bigint, 1500000::bigint, '🌍', 'كوكب ذهبي يملأ سماء البث', 'golden-yoyo-planet', 'planet-boom', 207),
  ('مجرة YOYO الأسطورية', 2000000::bigint, 2000000::bigint, '🌌', 'أضخم هدية في عالم YOYO LIVE', 'yoyo-legendary-galaxy', 'galaxy-finale', 208)
) AS v(name, coin_cost, gross_points, emoji, description, animation_key, sound_key, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gift_catalog g WHERE g.name = v.name
);
