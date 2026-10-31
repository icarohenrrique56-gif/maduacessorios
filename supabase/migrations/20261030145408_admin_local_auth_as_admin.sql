create or replace function private.is_local_development_jwt()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(
      (select auth.jwt() ->> 'iss') in (
        'http://127.0.0.1:54321/auth/v1',
        'http://localhost:54321/auth/v1'
      ),
      false
    );
$$;

revoke all on function private.is_local_development_jwt() from public, anon, authenticated;
grant execute on function private.is_local_development_jwt() to authenticated, service_role;

create or replace function private.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_local_development_jwt())
    or exists (
      select 1
      from public.admin_user_permissions
      where user_id = (select auth.uid())
        and role = 'admin'
        and is_active = true
        and status = 'active'
    );
$$;

create or replace function private.is_store_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_local_development_jwt())
    or exists (
      select 1
      from public.admin_user_permissions
      where user_id = (select auth.uid())
        and role = 'admin'
        and is_active = true
        and status = 'active'
    );
$$;

revoke all on function private.is_store_admin() from public, anon;
revoke all on function private.is_store_staff() from public, anon;
grant execute on function private.is_store_admin() to authenticated, service_role;
grant execute on function private.is_store_staff() to authenticated, service_role;

notify pgrst, 'reload schema';