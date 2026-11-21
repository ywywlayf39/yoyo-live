create table if not exists public.coin_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_amount_egp numeric(12,2) not null check (requested_amount_egp > 0),
  requested_coins bigint not null check (requested_coins > 0),
  payment_method text not null check (payment_method in ('vodafone_cash','instapay')),
  transfer_reference text,
  proof_storage_path text,
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected')),
  admin_note text, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint coin_purchase_reference_length check (transfer_reference is null or length(transfer_reference) between 4 and 120),
  constraint coin_purchase_note_length check (admin_note is null or length(admin_note) <= 1000)
);
alter table public.coin_purchase_requests enable row level security;
drop policy if exists "Users view own coin purchase requests" on public.coin_purchase_requests;
create policy "Users view own coin purchase requests" on public.coin_purchase_requests
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users submit own coin purchase requests" on public.coin_purchase_requests;
create policy "Users submit own coin purchase requests" on public.coin_purchase_requests
for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending'
 and reviewed_by is null and reviewed_at is null and admin_note is null);
drop policy if exists "Admins view coin purchase requests" on public.coin_purchase_requests;
create policy "Admins view coin purchase requests" on public.coin_purchase_requests
for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
revoke all on public.coin_purchase_requests from anon, public;
grant select, insert on public.coin_purchase_requests to authenticated;
create or replace function public.yoyo_admin_review_coin_purchase(
 p_request_id uuid, p_decision text, p_admin_note text default null
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_request public.coin_purchase_requests%rowtype; v_admin_id uuid;
begin
 v_admin_id := auth.uid();
 if v_admin_id is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
  raise exception 'غير مصرح: هذه العملية للأدمن فقط';
 end if;
 if p_decision not in ('reviewing','approved','rejected') then raise exception 'حالة المراجعة غير صحيحة'; end if;
 if p_admin_note is not null and length(p_admin_note) > 1000 then raise exception 'ملاحظة الإدارة طويلة جدًا'; end if;
 select * into v_request from public.coin_purchase_requests where id=p_request_id for update;
 if not found then return false; end if;
 if v_request.status in ('approved','rejected') then raise exception 'تمت مراجعة هذا الطلب بالفعل'; end if;
 if p_decision='approved' then
  insert into public.wallets(user_id,purchased_coins) values(v_request.user_id,v_request.requested_coins)
  on conflict(user_id) do update set purchased_coins=public.wallets.purchased_coins+excluded.purchased_coins,updated_at=now();
  insert into public.wallet_transactions(user_id,transaction_type,coins,amount_egp,reference_id,description)
  values(v_request.user_id,'coin_purchase',v_request.requested_coins,v_request.requested_amount_egp,v_request.id,'اعتماد طلب شراء عملات بعد مراجعة الأدمن');
 end if;
 update public.coin_purchase_requests set status=p_decision,admin_note=p_admin_note,reviewed_by=v_admin_id,
  reviewed_at=case when p_decision in ('approved','rejected') then now() else null end where id=p_request_id;
 return true;
end;
$$;
revoke all on function public.yoyo_admin_review_coin_purchase(uuid,text,text) from public,anon;
grant execute on function public.yoyo_admin_review_coin_purchase(uuid,text,text) to authenticated;
