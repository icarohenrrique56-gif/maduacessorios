drop trigger if exists madu_grant_named_admin_on_user_insert on auth.users;
drop trigger if exists madu_grant_named_admin_on_email_confirmation on auth.users;
drop function if exists private.grant_admin_to_named_verified_emails();

insert into public.admin_user_permissions (
  user_id,
  email,
  role,
  is_active,
  status
)
select
  users.id,
  lower(users.email),
  'admin',
  true,
  'active'
from auth.users as users
where users.raw_app_meta_data ->> 'role' = 'admin'
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
