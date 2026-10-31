update public.admin_user_permissions
set role = 'admin',
    updated_at = now()
where role = 'operator';

update auth.users as users
set raw_app_meta_data = case
  when permissions.is_active = true and permissions.status = 'active' then
    (coalesce(users.raw_app_meta_data, '{}'::jsonb) - 'role')
    || jsonb_build_object('role', 'admin')
  else coalesce(users.raw_app_meta_data, '{}'::jsonb) - 'role'
end
from public.admin_user_permissions as permissions
where permissions.user_id = users.id;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
where raw_app_meta_data ->> 'role' = 'operator';

alter table public.admin_user_permissions
  drop constraint if exists admin_user_permissions_role_check,
  add constraint admin_user_permissions_role_check check (role = 'admin');

create or replace function private.is_store_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_user_permissions
    where user_id = (select auth.uid())
      and role = 'admin'
      and is_active = true
      and status = 'active'
  );
$$;

create or replace function private.admin_set_user_role(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
  current_is_active boolean;
  current_status text;
  admin_count integer;
  target_email text;
begin
  perform pg_advisory_xact_lock(8510341);

  if p_actor_user_id is null or not exists (
    select 1
    from public.admin_user_permissions
    where user_id = p_actor_user_id
      and role = 'admin'
      and is_active = true
      and status = 'active'
  ) then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  if p_user_id is null or (p_role is not null and p_role <> 'admin') then
    raise exception 'Invalid user role change' using errcode = '22023';
  end if;

  select lower(email) into target_email
  from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if p_role is not null and target_email is null then
    raise exception 'User must have an email address to receive panel access' using errcode = '22023';
  end if;

  select role, is_active, status
    into current_role, current_is_active, current_status
  from public.admin_user_permissions
  where user_id = p_user_id
  for update;

  if current_role = 'admin'
    and current_is_active = true
    and current_status = 'active'
    and p_role is distinct from 'admin'
  then
    select count(*) into admin_count
    from public.admin_user_permissions
    where role = 'admin'
      and is_active = true
      and status = 'active';

    if admin_count <= 1 then
      raise exception 'At least one administrator must remain' using errcode = '23514';
    end if;
  end if;

  if p_role is null then
    delete from public.admin_user_permissions where user_id = p_user_id;
  else
    insert into public.admin_user_permissions (
      user_id,
      email,
      role,
      is_active,
      status,
      updated_at
    )
    values (p_user_id, target_email, p_role, true, 'active', now())
    on conflict (user_id) do update
      set email = excluded.email,
          role = excluded.role,
          is_active = true,
          status = 'active',
          updated_at = now();
  end if;

  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'role')
    || case when p_role is null then '{}'::jsonb else jsonb_build_object('role', p_role) end
  where id = p_user_id;
end;
$$;

revoke all on function private.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.admin_set_user_role(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';