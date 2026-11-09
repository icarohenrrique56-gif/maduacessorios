create table if not exists public.store_settings (
  id text primary key,
  store_name text not null default '',
  whatsapp_number text not null default '',
  instagram_url text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id, store_name, whatsapp_number, instagram_url)
values ('main', '', '', '')
on conflict (id) do nothing;

alter table public.products
  add column if not exists is_active boolean not null default true;

update public.products
set is_active = true
where is_active is null;

alter table public.products
  alter column is_active set default true,
  alter column is_active set not null;

create table if not exists public.admin_user_permissions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'operator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_user_permissions
  add column if not exists email text,
  add column if not exists is_active boolean not null default true,
  add column if not exists status text not null default 'active';

insert into public.admin_user_permissions (user_id, email, role, is_active, status)
select
  users.id,
  lower(users.email),
  'admin',
  true,
  'active'
from auth.users as users
where users.email is not null
  and users.raw_app_meta_data ->> 'role' = 'admin'
on conflict (user_id) do nothing;

alter table public.store_settings enable row level security;
alter table public.admin_user_permissions enable row level security;

revoke all on public.store_settings from public, anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant insert, update on public.store_settings to authenticated;

revoke all on public.admin_user_permissions from public, anon, authenticated;
grant select on public.admin_user_permissions to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

drop policy if exists "madu_user_read_own_permission" on public.admin_user_permissions;
create policy "madu_user_read_own_permission"
  on public.admin_user_permissions for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_store_admin()
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
  );
$$;

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
      and role in ('admin', 'operator')
  );
$$;

revoke all on function private.is_store_admin() from public, anon;
revoke all on function private.is_store_staff() from public, anon;
grant execute on function private.is_store_admin() to authenticated, service_role;
grant execute on function private.is_store_staff() to authenticated, service_role;

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
  admin_count integer;
begin
  perform pg_advisory_xact_lock(8510341);

  if p_actor_user_id is null or not exists (
    select 1
    from public.admin_user_permissions
    where user_id = p_actor_user_id and role = 'admin'
  ) then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  if p_user_id is null or (p_role is not null and p_role not in ('admin', 'operator')) then
    raise exception 'Invalid user role change' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  select role into current_role
  from public.admin_user_permissions
  where user_id = p_user_id
  for update;

  if current_role = 'admin' and p_role is distinct from 'admin' then
    select count(*) into admin_count
    from public.admin_user_permissions
    where role = 'admin';

    if admin_count <= 1 then
      raise exception 'At least one administrator must remain' using errcode = '23514';
    end if;
  end if;

  if p_role is null then
    delete from public.admin_user_permissions where user_id = p_user_id;
  else
    insert into public.admin_user_permissions (user_id, role, updated_at)
    values (p_user_id, p_role, now())
    on conflict (user_id) do update
      set role = excluded.role, updated_at = now();
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

create or replace function public.admin_set_user_role(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.admin_set_user_role(p_actor_user_id, p_user_id, p_role);
end;
$$;

revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;

drop policy if exists "madu_public_read_products" on public.products;
drop policy if exists "madu_admin_insert_products" on public.products;
drop policy if exists "madu_admin_update_products" on public.products;
drop policy if exists "madu_admin_delete_products" on public.products;
drop policy if exists "Admins can delete products" on public.products;
drop policy if exists "Admins can insert products" on public.products;
drop policy if exists "Admins can update products" on public.products;
drop policy if exists "Admins can view all products" on public.products;
drop policy if exists "Public can view active products" on public.products;

create policy "madu_public_read_active_products"
  on public.products for select to anon, authenticated
  using (is_active = true);
create policy "madu_staff_read_all_products"
  on public.products for select to authenticated
  using ((select private.is_store_staff()));
create policy "madu_staff_insert_products"
  on public.products for insert to authenticated
  with check ((select private.is_store_staff()));
create policy "madu_staff_update_products"
  on public.products for update to authenticated
  using ((select private.is_store_staff()))
  with check ((select private.is_store_staff()));
create policy "madu_admin_delete_products"
  on public.products for delete to authenticated
  using ((select private.is_store_admin()));

do $$
begin
  if to_regclass('public.categories') is not null then
    execute 'drop policy if exists "madu_admin_insert_categories" on public.categories';
    execute 'drop policy if exists "madu_admin_update_categories" on public.categories';
    execute 'drop policy if exists "madu_admin_delete_categories" on public.categories';
    execute 'create policy "madu_admin_insert_categories" on public.categories for insert to authenticated with check ((select private.is_store_admin()))';
    execute 'create policy "madu_admin_update_categories" on public.categories for update to authenticated using ((select private.is_store_admin())) with check ((select private.is_store_admin()))';
    execute 'create policy "madu_admin_delete_categories" on public.categories for delete to authenticated using ((select private.is_store_admin()))';
  end if;

  if to_regclass('public.customers') is not null then
    execute 'drop policy if exists "madu_admin_read_customers" on public.customers';
    execute 'create policy "madu_admin_read_customers" on public.customers for select to authenticated using ((select private.is_store_admin()))';
  end if;

  if to_regclass('public.orders') is not null then
    execute 'drop policy if exists "madu_admin_manage_orders" on public.orders';
    execute 'create policy "madu_admin_manage_orders" on public.orders for all to authenticated using ((select private.is_store_admin())) with check ((select private.is_store_admin()))';
  end if;

  if to_regclass('public.order_items') is not null then
    execute 'drop policy if exists "madu_admin_manage_order_items" on public.order_items';
    execute 'create policy "madu_admin_manage_order_items" on public.order_items for all to authenticated using ((select private.is_store_admin())) with check ((select private.is_store_admin()))';
  end if;

  if to_regclass('public.inventory_movements') is not null then
    execute 'drop policy if exists "madu_admin_manage_inventory_movements" on public.inventory_movements';
    execute 'create policy "madu_admin_manage_inventory_movements" on public.inventory_movements for all to authenticated using ((select private.is_store_admin())) with check ((select private.is_store_admin()) and admin_user_id = (select auth.uid()))';
  end if;
end
$$;

drop policy if exists "madu_public_read_public_store_settings" on public.store_settings;
drop policy if exists "madu_admin_read_store_settings" on public.store_settings;
drop policy if exists "madu_admin_insert_store_settings" on public.store_settings;
drop policy if exists "madu_admin_update_store_settings" on public.store_settings;
drop policy if exists "madu_admin_delete_store_settings" on public.store_settings;

create policy "madu_public_read_whatsapp_setting"
  on public.store_settings for select to anon, authenticated
  using (id = 'main');
create policy "madu_admin_read_store_settings"
  on public.store_settings for select to authenticated
  using ((select private.is_store_admin()));
create policy "madu_admin_insert_store_settings"
  on public.store_settings for insert to authenticated
  with check ((select private.is_store_admin()));
create policy "madu_admin_update_store_settings"
  on public.store_settings for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "madu_admin_delete_store_settings"
  on public.store_settings for delete to authenticated
  using ((select private.is_store_admin()));

drop policy if exists "madu_admin_upload_product_images" on storage.objects;
drop policy if exists "MADU admins upload product images" on storage.objects;
drop policy if exists "MADU admins update product images" on storage.objects;
drop policy if exists "MADU admins delete product images" on storage.objects;
drop policy if exists "MADU admins list product images" on storage.objects;

create policy "madu_staff_upload_product_images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (select private.is_store_staff())
  );
create policy "madu_staff_update_product_images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and (select private.is_store_staff())
  )
  with check (
    bucket_id = 'product-images'
    and (select private.is_store_staff())
  );
create policy "madu_admin_delete_product_images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (select private.is_store_admin())
  );
create policy "madu_admin_list_product_images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-images'
    and (select private.is_store_admin())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
