-- Coin purchase requests with proof screenshots do not yet have a bank transfer reference.
-- Keep transfer_reference NULL until an administrator verifies and records the real reference.
-- This avoids reusing the old literal "proof-upload" value against the unique reference index.
create or replace function public.yoyo_create_coin_purchase_request(
  p_package_id uuid,
  p_payment_method text,
  p_transfer_reference text,
  p_proof_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_package public.coin_packages%rowtype;
  v_request_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if p_payment_method not in ('vodafone_cash','instapay','bank_transfer') then
    raise exception 'invalid_payment_method';
  end if;
  if p_proof_storage_path is null
     or split_part(p_proof_storage_path,'/',1) <> v_user_id::text
     or p_proof_storage_path not like v_user_id::text || '/%' then
    raise exception 'invalid_payment_proof';
  end if;

  select * into v_package
  from public.coin_packages
  where id = p_package_id and active = true;
  if not found then
    raise exception 'package_unavailable';
  end if;

  insert into public.coin_purchase_requests
    (user_id, package_id, requested_amount_egp, requested_coins,
     payment_method, transfer_reference, proof_storage_path, status)
  values
    (v_user_id, v_package.id, v_package.price_egp,
     v_package.coins + v_package.bonus_coins,
     p_payment_method, null, p_proof_storage_path, 'pending')
  returning id into v_request_id;

  return v_request_id;
end;
$function$;

revoke all on function public.yoyo_create_coin_purchase_request(uuid,text,text,text) from public, anon;
grant execute on function public.yoyo_create_coin_purchase_request(uuid,text,text,text) to authenticated;
