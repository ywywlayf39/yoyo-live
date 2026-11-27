create or replace function public.yoyo_cancel_own_report(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  changed_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.user_reports
     set status = 'cancelled'
   where id = p_report_id
     and reporter_id = (select auth.uid())
     and status = 'pending';

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$function$;

revoke all on function public.yoyo_cancel_own_report(uuid) from public, anon;
grant execute on function public.yoyo_cancel_own_report(uuid) to authenticated;
