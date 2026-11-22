-- Prevent duplicate reuse of a transfer reference for the same payment method.
-- This does not prove settlement; an administrator must independently verify receipt.
create unique index if not exists coin_purchase_transfer_reference_unique
on public.coin_purchase_requests (payment_method, lower(btrim(transfer_reference)))
where transfer_reference is not null and btrim(transfer_reference) <> '';

comment on index public.coin_purchase_transfer_reference_unique is
'Prevents reuse of the same normalized transfer reference for the same payment method across YOYO LIVE coin purchase requests. This is an anti-duplicate control, not proof of payment settlement.';
