alter table public.gift_catalog
  add column if not exists category text not null default 'starter',
  add column if not exists emoji text not null default '🎁',
  add column if not exists description text not null default '',
  add column if not exists animation_key text not null default 'pop',
  add column if not exists sound_key text not null default 'soft-pop',
  add column if not exists sort_order integer not null default 100;

insert into public.gift_catalog
  (name, coin_cost, gross_points, active, category, emoji, description, animation_key, sound_key, sort_order)
values
  ('قلب دافئ',1,1,true,'starter','💗','قلب صغير ينبض','heart-pulse','heart-pop',1),
  ('وردة ناعمة',5,5,true,'starter','🌹','وردة تتفتح','rose-bloom','soft-chime',2),
  ('نجمة لامعة',10,10,true,'starter','⭐','نجمة تلمع حول الشاشة','star-sparkle','star-ding',3),
  ('تصفيق YOYO',10,10,true,'starter','👏','تصفيق احتفالي','clap-burst','clap',4),
  ('فراشة سحرية',20,20,true,'popular','🦋','فراشة مضيئة تطير','butterfly-flight','fairy-bell',5),
  ('قمر ونجوم',30,30,true,'popular','🌙','هلال ونجوم متلألئة','moon-drift','moon-chime',6),
  ('أرنب مرح',50,50,true,'popular','🐰','أرنب يقفز بمرح','bunny-hop','bunny-pop',7),
  ('نيزك ملون',100,100,true,'popular','☄️','نيزك يترك أثرًا ضوئيًا','meteor-trail','whoosh',8),
  ('بالون السعادة',150,150,true,'popular','🎈','بالونات تصعد بألوان مبهجة','balloon-rise','balloon-ping',9),
  ('قلبان متعانقان',200,200,true,'popular','💕','قلبان يلتقيان في المنتصف','double-heart','romantic-chime',10),
  ('تاج ملكي',300,300,true,'premium','👑','تاج ذهبي يهبط وسط بريق','royal-crown','royal-hit',11),
  ('حصان ذهبي',500,500,true,'premium','🐎','حصان ذهبي يعبر الشاشة','golden-horse','horse-gallop',12),
  ('سيارة الأحلام',700,700,true,'premium','🏎️','سيارة مضيئة تنطلق بسرعة','dream-car','engine-rev',13),
  ('يخت اللؤلؤ',1000,1000,true,'premium','🛥️','يخت فاخر وسط أمواج لامعة','pearl-yacht','ocean-swell',14),
  ('قصر الكريستال',1500,1500,true,'premium','🏰','قصر كريستالي يظهر تدريجيًا','crystal-castle','crystal-rise',15),
  ('تنين الضوء',2000,2000,true,'legendary','🐉','تنين من الضوء يحلق حول البث','light-dragon','dragon-roar',16),
  ('شلال الماس',3000,3000,true,'legendary','💎','شلال من الألماس يملأ الشاشة','diamond-fall','diamond-shimmer',17),
  ('بوابة المجرة',5000,5000,true,'legendary','🌌','بوابة كونية تفتح على مجرة','galaxy-gate','cosmic-portal',18),
  ('كسوف كوني',7500,7500,true,'legendary','🌑','كسوف مضيء مع هالة كونية','cosmic-eclipse','eclipse-boom',19),
  ('عرش الملوك',10000,10000,true,'legendary','🪐','عرش أسطوري مع انفجار نجمي','royal-throne','epic-fanfare',20)
on conflict do nothing;

create or replace function public.send_live_gift(
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_gift public.gift_catalog%rowtype;
  v_sender_balance bigint;
  v_total_coins bigint;
  v_gross_points bigint;
  v_host_points bigint;
  v_platform_points bigint;
  v_transfer_id uuid;
begin
  if v_sender_id is null then raise exception 'يجب تسجيل الدخول لإرسال هدية'; end if;
  if p_receiver_id is null or p_receiver_id = v_sender_id then raise exception 'لا يمكن إرسال هدية إلى نفسك'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'الكمية يجب أن تكون من 1 إلى 100'; end if;

  if exists (select 1 from public.user_blocks b
    where (b.blocker_id = v_sender_id and b.blocked_id = p_receiver_id)
       or (b.blocker_id = p_receiver_id and b.blocked_id = v_sender_id)) then
    raise exception 'لا يمكن إرسال هدية بين حسابين محظورين';
  end if;

  select * into v_gift from public.gift_catalog
  where id = p_gift_id and active = true for share;
  if not found then raise exception 'هذه الهدية غير متاحة حاليًا'; end if;

  v_total_coins := v_gift.coin_cost * p_quantity;
  v_gross_points := v_gift.gross_points * p_quantity;
  v_host_points := floor(v_gross_points * 0.70)::bigint;
  v_platform_points := v_gross_points - v_host_points;

  insert into public.wallets(user_id) values (v_sender_id) on conflict (user_id) do nothing;
  insert into public.wallets(user_id) values (p_receiver_id) on conflict (user_id) do nothing;
  select purchased_coins into v_sender_balance from public.wallets where user_id = v_sender_id for update;
  if v_sender_balance < v_total_coins then raise exception 'رصيد العملات غير كافٍ'; end if;

  update public.wallets set purchased_coins = purchased_coins - v_total_coins, updated_at = now()
  where user_id = v_sender_id;
  update public.wallets set earned_points = earned_points + v_host_points,
    lifetime_points = lifetime_points + v_host_points, updated_at = now()
  where user_id = p_receiver_id;

  insert into public.gift_transfers
    (sender_id, receiver_id, gift_id, quantity, coins_spent, gross_points, host_points, platform_points)
  values (v_sender_id, p_receiver_id, p_gift_id, p_quantity, v_total_coins, v_gross_points, v_host_points, v_platform_points)
  returning id into v_transfer_id;

  insert into public.wallet_transactions
    (user_id, transaction_type, coins, reference_id, description, points, platform_points)
  values
    (v_sender_id, 'gift_sent', -v_total_coins, v_transfer_id, 'إرسال ' || v_gift.name, 0, v_platform_points),
    (p_receiver_id, 'gift_received', 0, v_transfer_id, 'استلام ' || v_gift.name, v_host_points, 0);

  return jsonb_build_object('transfer_id', v_transfer_id, 'gift_name', v_gift.name,
    'emoji', v_gift.emoji, 'quantity', p_quantity, 'coins_spent', v_total_coins,
    'host_points', v_host_points, 'platform_points', v_platform_points);
end;
$$;

revoke all on function public.send_live_gift(uuid, uuid, integer) from public, anon;
grant execute on function public.send_live_gift(uuid, uuid, integer) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gift_transfers') then
    alter publication supabase_realtime add table public.gift_transfers;
  end if;
end $$;
