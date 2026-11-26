create or replace function public.send_profile_gift(
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sender_id uuid := auth.uid();
  v_gift public.gift_catalog%rowtype;
  v_sender_balance bigint;
  v_total_coins bigint;
  v_gross_points bigint;
  v_host_points bigint;
  v_platform_points bigint;
  v_transfer_id uuid;
  v_sender_name text;
begin
  if v_sender_id is null then
    raise exception 'يجب تسجيل الدخول لإرسال هدية';
  end if;
  if p_receiver_id is null or p_receiver_id = v_sender_id then
    raise exception 'لا يمكن إرسال هدية إلى نفسك';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'الكمية يجب أن تكون من 1 إلى 100';
  end if;
  if private.yoyo_is_user_suspended(v_sender_id)
     or private.yoyo_is_user_suspended(p_receiver_id) then
    raise exception 'لا يمكن إرسال الهدايا من أو إلى حساب موقوف';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_receiver_id) then
    raise exception 'العضو غير موجود';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_sender_id and b.blocked_id = p_receiver_id)
       or (b.blocker_id = p_receiver_id and b.blocked_id = v_sender_id)
  ) then
    raise exception 'لا يمكن إرسال هدية بين حسابين محظورين';
  end if;
  select * into v_gift from public.gift_catalog
  where id = p_gift_id and active = true for share;
  if not found then raise exception 'هذه الهدية غير متاحة حاليًا'; end if;

  v_total_coins := v_gift.coin_cost * p_quantity;
  v_gross_points := v_gift.gross_points * p_quantity;
  v_host_points := round(v_gross_points * 0.70)::bigint;
  v_platform_points := v_gross_points - v_host_points;

  insert into public.wallets(user_id) values (v_sender_id)
  on conflict (user_id) do nothing;
  insert into public.wallets(user_id) values (p_receiver_id)
  on conflict (user_id) do nothing;
  select purchased_coins into v_sender_balance
  from public.wallets where user_id = v_sender_id for update;
  if v_sender_balance < v_total_coins then raise exception 'رصيد العملات غير كافٍ'; end if;

  update public.wallets set purchased_coins = purchased_coins - v_total_coins, updated_at = now()
  where user_id = v_sender_id;
  update public.wallets set earned_points = earned_points + v_host_points,
    lifetime_points = lifetime_points + v_host_points, updated_at = now()
  where user_id = p_receiver_id;

  insert into public.gift_transfers
    (sender_id, receiver_id, gift_id, quantity, coins_spent, gross_points, host_points, platform_points, room_name)
  values
    (v_sender_id, p_receiver_id, p_gift_id, p_quantity, v_total_coins, v_gross_points, v_host_points, v_platform_points, null)
  returning id into v_transfer_id;

  insert into public.wallet_transactions
    (user_id, transaction_type, coins, reference_id, description, points, platform_points)
  values
    (v_sender_id, 'gift_sent', -v_total_coins, v_transfer_id, 'إرسال ' || v_gift.name || ' من الملف الشخصي', 0, v_platform_points),
    (p_receiver_id, 'gift_received', 0, v_transfer_id, 'استلام ' || v_gift.name || ' كهدية من الملف الشخصي', v_host_points, 0);

  select coalesce(p.display_name, 'عضو YOYO LIVE') into v_sender_name
  from public.profiles p where p.id = v_sender_id;
  insert into public.user_notifications (recipient_id, actor_id, notification_type, title, body)
  values (p_receiver_id, v_sender_id, 'gift_received', '🎁 وصلك هدية جديدة',
    coalesce(v_sender_name, 'عضو YOYO LIVE') || ' أرسل لك ' || v_gift.name ||
    case when p_quantity > 1 then ' × ' || p_quantity::text else '' end);

  return jsonb_build_object('transfer_id', v_transfer_id, 'gift_name', v_gift.name,
    'quantity', p_quantity, 'coins_spent', v_total_coins, 'host_points', v_host_points,
    'platform_points', v_platform_points);
end;
$function$;

revoke all on function public.send_profile_gift(uuid, uuid, integer) from public;
grant execute on function public.send_profile_gift(uuid, uuid, integer) to authenticated;
