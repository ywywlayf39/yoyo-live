-- Allow admin approval of a coin purchase when the uploaded payment proof
-- exists in the private payment-proofs bucket, even when no bank reference was supplied.
-- Credit the wallet and insert the ledger entry atomically, exactly once.
create or replace function public.yoyo_admin_review_coin_purchase(
  p_request_id uuid,
  p_decision text,
  p_admin_note text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.coin_purchase_requests%rowtype;
  v_admin_id uuid := auth.uid();
  v_proof_exists boolean := false;
begin
  if v_admin_id is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
    raise exception 'غير مصرح: هذه العملية للأدمن فقط';
  end if;
  if p_decision is null or p_decision not in ('reviewing','approved','rejected') then
    raise exception 'حالة المراجعة غير صحيحة';
  end if;
  if p_admin_note is not null and length(p_admin_note) > 1000 then
    raise exception 'ملاحظة الإدارة طويلة جدًا';
  end if;

  select * into v_request
  from public.coin_purchase_requests
  where id = p_request_id
  for update;
  if not found then return false; end if;
  if v_request.status in ('approved','rejected') then
    raise exception 'تمت مراجعة هذا الطلب بالفعل';
  end if;

  if p_decision = 'approved' then
    if v_request.proof_storage_path is not null then
      select exists (
        select 1 from storage.objects
        where bucket_id = 'payment-proofs'
          and name = v_request.proof_storage_path
      ) into v_proof_exists;
    end if;
    if not v_proof_exists
       and (v_request.transfer_reference is null
            or length(btrim(v_request.transfer_reference)) < 4) then
      raise exception 'لا يوجد إيصال تحويل محفوظ أو رقم مرجعي صالح؛ لا يمكن اعتماد الطلب';
    end if;
    if exists (
      select 1 from public.wallet_transactions
      where reference_id = v_request.id
        and transaction_type = 'coin_purchase'
    ) then
      raise exception 'تم تسجيل إضافة العملات لهذا الطلب من قبل؛ راجع سجل المحفظة';
    end if;

    insert into public.wallets(user_id, purchased_coins)
    values (v_request.user_id, v_request.requested_coins)
    on conflict (user_id) do update
      set purchased_coins = public.wallets.purchased_coins + excluded.purchased_coins,
          updated_at = now();

    insert into public.wallet_transactions
      (user_id, transaction_type, coins, amount_egp, reference_id, description)
    values
      (v_request.user_id, 'coin_purchase', v_request.requested_coins,
       v_request.requested_amount_egp, v_request.id,
       'اعتماد طلب شراء عملات بعد مراجعة الأدمن');
  end if;

  update public.coin_purchase_requests
  set status = p_decision,
      admin_note = p_admin_note,
      reviewed_by = v_admin_id,
      reviewed_at = case when p_decision in ('approved','rejected') then now() else null end
  where id = p_request_id;
  return true;
end;
$function$;

revoke all on function public.yoyo_admin_review_coin_purchase(uuid,text,text) from public, anon;
grant execute on function public.yoyo_admin_review_coin_purchase(uuid,text,text) to authenticated;
