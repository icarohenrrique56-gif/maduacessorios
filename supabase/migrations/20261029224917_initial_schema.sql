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
  stock integer not null default 0 check (stock >= 0),
  variations text[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists products_sku_unique
  on public.products (sku)
  where sku is not null;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.categories (name, slug, position)
values
  ('Brincos', 'brincos', 1),
  ('Colares', 'colares', 2),
  ('Anéis', 'aneis', 3),
  ('Pulseiras', 'pulseiras', 4),
  ('Conjuntos', 'conjuntos', 5),
  ('Tornozeleiras', 'tornozeleiras', 6),
  ('Pingentes', 'pingentes', 7),
  ('Lançamentos', 'lancamentos', 8),
  ('Promoções', 'promocoes', 9)
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

grant select on public.products, public.categories to anon, authenticated;
grant insert, update, delete on public.products, public.categories to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, update, delete on public.orders, public.order_items to authenticated;
grant select, insert on public.inventory_movements to authenticated;
grant select, insert, update on public.store_settings to authenticated;
grant select on public.store_settings to anon;

drop policy if exists "madu_public_read_products" on public.products;
create policy "madu_public_read_products"
  on public.products for select to anon, authenticated using (true);
drop policy if exists "madu_admin_insert_products" on public.products;
create policy "madu_admin_insert_products"
  on public.products for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_admin_update_products" on public.products;
create policy "madu_admin_update_products"
  on public.products for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_admin_delete_products" on public.products;
create policy "madu_admin_delete_products"
  on public.products for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "madu_public_read_categories" on public.categories;
create policy "madu_public_read_categories"
  on public.categories for select to anon, authenticated using (true);
drop policy if exists "madu_admin_insert_categories" on public.categories;
create policy "madu_admin_insert_categories"
  on public.categories for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_admin_update_categories" on public.categories;
create policy "madu_admin_update_categories"
  on public.categories for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_admin_delete_categories" on public.categories;
create policy "madu_admin_delete_categories"
  on public.categories for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "madu_admin_read_customers" on public.customers;
create policy "madu_admin_read_customers"
  on public.customers for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
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
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_customer_read_own_orders" on public.orders;
create policy "madu_customer_read_own_orders"
  on public.orders for select to authenticated using (customer_id = auth.uid());

drop policy if exists "madu_admin_manage_order_items" on public.order_items;
create policy "madu_admin_manage_order_items"
  on public.order_items for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
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
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and admin_user_id = auth.uid()
  );

drop policy if exists "madu_public_read_public_store_settings" on public.store_settings;
create policy "madu_public_read_public_store_settings"
  on public.store_settings for select to anon, authenticated
  using (id = 'main');
drop policy if exists "madu_admin_read_store_settings" on public.store_settings;
create policy "madu_admin_read_store_settings"
  on public.store_settings for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_admin_insert_store_settings" on public.store_settings;
create policy "madu_admin_insert_store_settings"
  on public.store_settings for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_admin_update_store_settings" on public.store_settings;
create policy "madu_admin_update_store_settings"
  on public.store_settings for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "madu_admin_delete_store_settings" on public.store_settings;
create policy "madu_admin_delete_store_settings"
  on public.store_settings for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
