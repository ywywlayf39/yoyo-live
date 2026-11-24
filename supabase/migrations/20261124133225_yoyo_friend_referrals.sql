create schema if not exists private;

create table if not exists private.yoyo_referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists private.yoyo_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'registered'
    check (status in ('registered', 'qualified', 'rejected')),
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  constraint yoyo_referrals_no_self check (referrer_id <> referred_user_id)
);

create index if not exists yoyo_referrals_referrer_created_idx
  on private.yoyo_referrals (referrer_id, created_at desc);

alter table private.yoyo_referral_codes enable row level security;
alter table private.yoyo_referrals enable row level security;
revoke all on private.yoyo_referral_codes from anon, authenticated;
revoke all on private.yoyo_referrals from anon, authenticated;

create or replace function private.yoyo_ensure_referral_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.yoyo_referral_codes (user_id, code)
  values (
    new.id,
    upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.yoyo_ensure_referral_code() from public, anon, authenticated;

drop trigger if exists yoyo_create_referral_code_after_profile_insert on public.profiles;
create trigger yoyo_create_referral_code_after_profile_insert
after insert on public.profiles
for each row execute function private.yoyo_ensure_referral_code();

insert into private.yoyo_referral_codes (user_id, code)
select p.id,
       upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10))
from public.profiles p
on conflict (user_id) do nothing;

create or replace function public.yoyo_apply_referral_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_referrer_id uuid;
begin
  if v_user_id is null or nullif(pg_catalog.btrim(p_code), '') is null then
    return false;
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    return false;
  end if;

  select c.user_id
    into v_referrer_id
  from private.yoyo_referral_codes c
  where c.code = pg_catalog.upper(pg_catalog.btrim(p_code))
  limit 1;

  if v_referrer_id is null or v_referrer_id = v_user_id then
    return false;
  end if;

  insert into private.yoyo_referrals (
    referrer_id, referred_user_id, referral_code, status
  )
  values (
    v_referrer_id, v_user_id, pg_catalog.upper(pg_catalog.btrim(p_code)), 'registered'
  )
  on conflict (referred_user_id) do nothing;

  return found;
end;
$$;

revoke all on function public.yoyo_apply_referral_code(text) from public, anon;
grant execute on function public.yoyo_apply_referral_code(text) to authenticated;

create or replace function public.yoyo_get_referral_summary()
returns table (
  referral_code text,
  total_invites bigint,
  qualified_invites bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    c.code,
    count(r.id)::bigint,
    count(r.id) filter (where r.status = 'qualified')::bigint
  from private.yoyo_referral_codes c
  left join private.yoyo_referrals r on r.referrer_id = c.user_id
  where c.user_id = v_user_id
  group by c.code;
end;
$$;

revoke all on function public.yoyo_get_referral_summary() from public, anon;
grant execute on function public.yoyo_get_referral_summary() to authenticated;
