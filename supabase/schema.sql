-- MADU schema bootstrap. Review existing tables and RLS policies before running.
-- This script is additive: it does not delete existing data or legacy policies.

create table if not exists public.products (
  id text primary key default ('prod-'::text || gen_random_uuid()::text),
  slug text not null unique,
  name text not null,
  description text not null default '',
  category text not null,
  price_cents integer not null check (price_cents >= 0),
  sale_price_cents integer check (
    sale_price_cents is null or
    (sale_price_cents >= 0 and sale_price_cents < price_cents)
  ),
  sku text,
  image text not null,
  featured boolean not null default false,
  is_active boolean not null default true,
  stock integer not null default 0 check (stock >= 0),
  variations text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists is_active boolean not null default true;
update public.products set is_active = true where is_active is null;
alter table public.products alter column is_active set default true;
alter table public.products alter column is_active set not null;

create unique index if not exists products_sku_unique
  on public.products (sku)
  where sku is not null;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  image_url text not null default '',
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.categories (name, slug, description, image_url, is_active, position)
values
  ('Brincos', 'brincos', 'Semijoias delicadas e elegantes.', '', true, 1),
  ('Colares', 'colares', 'Peças para compor o visual do dia a dia.', '', true, 2),
  ('Anéis', 'aneis', 'Acessórios em formatos clássicos e modernos.', '', true, 3),
  ('Pulseiras', 'pulseiras', 'Modelos leves para uso diário e ocasiões especiais.', '', true, 4),
  ('Conjuntos', 'conjuntos', 'Combinações prontas com identidade visual.', '', true, 5),
  ('Tornozeleiras', 'tornozeleiras', 'Acessórios femininos com acabamento refinado.', '', true, 6),
  ('Sandálias', 'sandalias', 'Calçados femininos com conforto e estilo.', '', true, 7),
  ('Bolsas', 'bolsas', 'Acessórios para compor looks e uso cotidiano.', '', true, 8),
  ('Roupas', 'roupas', 'Peças de moda para diferentes ocasiões.', '', true, 9),
  ('Outros', 'outros', 'Categorias personalizadas da MADU.', '', true, 10)
on conflict (slug) do nothing;

create table if not exists public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users (id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  status text not null default 'received'
    check (status in ('received', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'refunded', 'cancelled')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer check (shipping_cents is null or shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text references public.products (id) on delete set null,
  product_name text not null,
  sku text,
  variation text,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products (id) on delete restrict,
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  movement_type text not null check (movement_type in ('entry', 'exit', 'adjustment')),
  quantity integer not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id text primary key,
  store_name text not null default '',
  whatsapp_number text not null default '',
  instagram_url text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_user_permissions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null check (role = 'admin'),
  is_active boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_user_permissions
  add column if not exists email text,
  add column if not exists is_active boolean not null default true,
  add column if not exists status text not null default 'active';

update public.admin_user_permissions as permissions
set email = lower(users.email)
from auth.users as users
where users.id = permissions.user_id
  and users.email is not null;

insert into public.admin_user_permissions (user_id, email, role, is_active, status)
select id, lower(email), 'admin', true, 'active'
from auth.users
where raw_app_meta_data ->> 'role' = 'admin'
on conflict (user_id) do update
  set email = excluded.email,
      role = 'admin',
      is_active = true,
      status = 'active',
      updated_at = now();

insert into public.store_settings (id, store_name, whatsapp_number, instagram_url)
values ('main', '', '', '')
on conflict (id) do nothing;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

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

drop trigger if exists madu_grant_named_admin_on_user_insert on auth.users;
drop trigger if exists madu_grant_named_admin_on_email_confirmation on auth.users;
drop function if exists private.grant_admin_to_named_verified_emails();

create or replace function private.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_local_development_jwt())
    or exists (
      select 1 from public.admin_user_permissions
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
      select 1 from public.admin_user_permissions
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
    select 1 from public.admin_user_permissions
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
  from public.admin_user_permissions where user_id = p_user_id for update;

  if current_role = 'admin'
    and current_is_active = true
    and current_status = 'active'
    and p_role is distinct from 'admin'
  then
    select count(*) into admin_count
    from public.admin_user_permissions
    where role = 'admin' and is_active = true and status = 'active';
    if admin_count <= 1 then
      raise exception 'At least one administrator must remain' using errcode = '23514';
    end if;
  end if;

  if p_role is null then
    delete from public.admin_user_permissions where user_id = p_user_id;
  else
    insert into public.admin_user_permissions (
      user_id, email, role, is_active, status, updated_at
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

create index if not exists orders_customer_id_created_at_idx
  on public.orders (customer_id, created_at desc);
create index if not exists order_items_order_id_idx
  on public.order_items (order_id);
create index if not exists inventory_movements_product_id_created_at_idx
  on public.inventory_movements (product_id, created_at desc);

alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.store_settings enable row level security;
alter table public.admin_user_permissions enable row level security;

grant select on public.products, public.categories to anon, authenticated;
grant insert, update, delete on public.products, public.categories to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, update, delete on public.orders, public.order_items to authenticated;
grant select, insert on public.inventory_movements to authenticated;
grant select, insert, update on public.store_settings to authenticated;
grant select on public.store_settings to anon;
revoke all on public.store_settings from public;
revoke all on public.admin_user_permissions from public, anon, authenticated;
grant select on public.admin_user_permissions to authenticated;

revoke all on function private.is_store_admin() from public, anon;
revoke all on function private.is_store_staff() from public, anon;
revoke all on function private.is_local_development_jwt() from public, anon, authenticated;
grant execute on function private.is_store_admin() to authenticated, service_role;
grant execute on function private.is_store_staff() to authenticated, service_role;
grant execute on function private.is_local_development_jwt() to authenticated, service_role;
revoke all on function private.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.admin_set_user_role(uuid, uuid, text) to service_role;
revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;

drop policy if exists "madu_user_read_own_permission" on public.admin_user_permissions;
create policy "madu_user_read_own_permission"
  on public.admin_user_permissions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "madu_public_read_products" on public.products;
drop policy if exists "Admins can delete products" on public.products;
drop policy if exists "Admins can insert products" on public.products;
drop policy if exists "Admins can update products" on public.products;
drop policy if exists "Admins can view all products" on public.products;
drop policy if exists "Public can view active products" on public.products;
create policy "madu_public_read_products"
  on public.products for select to anon, authenticated using (is_active = true);
drop policy if exists "madu_staff_read_all_products" on public.products;
create policy "madu_staff_read_all_products"
  on public.products for select to authenticated
  using ((select private.is_store_staff()));
drop policy if exists "madu_admin_insert_products" on public.products;
drop policy if exists "madu_staff_insert_products" on public.products;
create policy "madu_staff_insert_products"
  on public.products for insert to authenticated
  with check ((select private.is_store_staff()));
drop policy if exists "madu_admin_update_products" on public.products;
drop policy if exists "madu_staff_update_products" on public.products;
create policy "madu_staff_update_products"
  on public.products for update to authenticated
  using ((select private.is_store_staff()))
  with check ((select private.is_store_staff()));
drop policy if exists "madu_admin_delete_products" on public.products;
create policy "madu_admin_delete_products"
  on public.products for delete to authenticated
  using ((select private.is_store_admin()));

drop policy if exists "madu_public_read_categories" on public.categories;
create policy "madu_public_read_categories"
  on public.categories for select to anon, authenticated using (true);
drop policy if exists "madu_admin_insert_categories" on public.categories;
create policy "madu_admin_insert_categories"
  on public.categories for insert to authenticated
  with check ((select private.is_store_admin()));
drop policy if exists "madu_admin_update_categories" on public.categories;
create policy "madu_admin_update_categories"
  on public.categories for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
drop policy if exists "madu_admin_delete_categories" on public.categories;
create policy "madu_admin_delete_categories"
  on public.categories for delete to authenticated
  using ((select private.is_store_admin()));

drop policy if exists "madu_admin_read_customers" on public.customers;
create policy "madu_admin_read_customers"
  on public.customers for select to authenticated
  using ((select private.is_store_admin()));
drop policy if exists "madu_customer_read_own_profile" on public.customers;
create policy "madu_customer_read_own_profile"
  on public.customers for select to authenticated using (id = auth.uid());
drop policy if exists "madu_customer_insert_own_profile" on public.customers;
create policy "madu_customer_insert_own_profile"
  on public.customers for insert to authenticated with check (id = auth.uid());
drop policy if exists "madu_customer_update_own_profile" on public.customers;
create policy "madu_customer_update_own_profile"
  on public.customers for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "madu_admin_manage_orders" on public.orders;
create policy "madu_admin_manage_orders"
  on public.orders for all to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
drop policy if exists "madu_customer_read_own_orders" on public.orders;
create policy "madu_customer_read_own_orders"
  on public.orders for select to authenticated using (customer_id = auth.uid());

drop policy if exists "madu_admin_manage_order_items" on public.order_items;
create policy "madu_admin_manage_order_items"
  on public.order_items for all to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
drop policy if exists "madu_customer_read_own_order_items" on public.order_items;
create policy "madu_customer_read_own_order_items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists "madu_admin_manage_inventory_movements" on public.inventory_movements;
create policy "madu_admin_manage_inventory_movements"
  on public.inventory_movements for all to authenticated
  using ((select private.is_store_admin()))
  with check (
    (select private.is_store_admin())
    and admin_user_id = (select auth.uid())
  );

drop policy if exists "madu_public_read_public_store_settings" on public.store_settings;
create policy "madu_public_read_public_store_settings"
  on public.store_settings for select to anon, authenticated
  using (id = 'main');
drop policy if exists "madu_admin_read_store_settings" on public.store_settings;
create policy "madu_admin_read_store_settings"
  on public.store_settings for select to authenticated
  using ((select private.is_store_admin()));
drop policy if exists "madu_admin_insert_store_settings" on public.store_settings;
create policy "madu_admin_insert_store_settings"
  on public.store_settings for insert to authenticated
  with check ((select private.is_store_admin()));
drop policy if exists "madu_admin_update_store_settings" on public.store_settings;
create policy "madu_admin_update_store_settings"
  on public.store_settings for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
drop policy if exists "madu_admin_only_insert_store_settings" on public.store_settings;
create policy "madu_admin_only_insert_store_settings"
  on public.store_settings as restrictive for insert to authenticated
  with check ((select private.is_store_admin()));
drop policy if exists "madu_admin_only_update_store_settings" on public.store_settings;
create policy "madu_admin_only_update_store_settings"
  on public.store_settings as restrictive for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
drop policy if exists "madu_admin_delete_store_settings" on public.store_settings;
create policy "madu_admin_delete_store_settings"
  on public.store_settings for delete to authenticated
  using ((select private.is_store_admin()));

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

drop policy if exists "madu_admin_upload_product_images" on storage.objects;
drop policy if exists "MADU admins upload product images" on storage.objects;
drop policy if exists "MADU admins update product images" on storage.objects;
drop policy if exists "MADU admins delete product images" on storage.objects;
drop policy if exists "MADU admins list product images" on storage.objects;
create policy "madu_staff_upload_product_images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (select private.is_store_staff())
  );

drop policy if exists "madu_staff_update_product_images" on storage.objects;
create policy "madu_staff_update_product_images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select private.is_store_staff()))
  with check (bucket_id = 'product-images' and (select private.is_store_staff()));
drop policy if exists "madu_admin_delete_product_images" on storage.objects;
create policy "madu_admin_delete_product_images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select private.is_store_admin()));
drop policy if exists "madu_admin_list_product_images" on storage.objects;
create policy "madu_admin_list_product_images"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select private.is_store_admin()));

notify pgrst, 'reload schema';
