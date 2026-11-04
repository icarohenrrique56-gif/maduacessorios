alter table public.admin_user_permissions
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.rls_auto_enable()
returns void
language plpgsql
set search_path = ''
as $$
begin
  null;
end;
$$;