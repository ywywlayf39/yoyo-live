alter table public.admin_user_actions
  drop constraint if exists admin_user_actions_admin_id_fkey,
  drop constraint if exists admin_user_actions_target_user_id_fkey;

alter table public.user_suspensions
  drop constraint if exists user_suspensions_suspended_by_fkey,
  drop constraint if exists user_suspensions_revoked_by_fkey;

comment on table public.admin_user_actions is
  'Append-only moderation audit trail. User UUIDs are intentionally not foreign keys so account deletion does not erase or block the audit history.';
