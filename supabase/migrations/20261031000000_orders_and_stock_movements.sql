create sequence if not exists public.madu_order_number_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  whatsapp_number text,
  status text not null default 'pending',
  payment_status text not null default 'pending',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer,
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  processed_at timestamptz,
  processed_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  returned_at timestamptz,
  returned_by uuid references auth.users(id),
  return_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists number text;
alter table public.orders add column if not exists whatsapp_number text;
alter table public.orders add column if not exists processed_at timestamptz;
alter table public.orders add column if not exists processed_by uuid references auth.users(id);
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by uuid references auth.users(id);
alter table public.orders add column if not exists returned_at timestamptz;
alter table public.orders add column if not exists returned_by uuid references auth.users(id);
alter table public.orders add column if not exists return_reason text;
alter table public.orders add column if not exists subtotal_cents integer;
alter table public.orders alter column subtotal_cents set default 0;
update public.orders set subtotal_cents = 0 where subtotal_cents is null;
alter table public.orders alter column subtotal_cents set not null;

update public.orders
set number = 'MADU-' || to_char(created_at, 'YYYYMMDD') || '-' ||
    lpad(rownumber::text, 6, '0')
from (
  select id, row_number() over (order by created_at, id) as rownumber
  from public.orders
  where number is null
) missing
where public.orders.id = missing.id;

create unique index if not exists orders_number_unique on public.orders(number) where number is not null;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.orders drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled',
                    'received', 'preparing', 'shipped', 'delivered'));

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  product_name text not null default '',
  sku text,
  variation text,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists name text;
alter table public.order_items add column if not exists image_url text not null default '';
alter table public.order_items add column if not exists product_url text;
alter table public.order_items add column if not exists total_cents integer;

update public.order_items
set name = coalesce(name, product_name),
    total_cents = coalesce(total_cents, line_total_cents);

alter table public.order_items alter column name set not null;
alter table public.order_items alter column total_cents set not null;
alter table public.order_items alter column product_id drop not null;

do $$
declare constraint_name text;
begin
  if to_regclass('public.inventory_movements') is null then return; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='order_items'
      and column_name='product_id' and data_type='uuid'
  ) then
    for constraint_name in
      select conname from pg_constraint
      where conrelid='public.order_items'::regclass
        and contype='f' and pg_get_constraintdef(oid) ilike '%product_id%'
    loop
      execute format('alter table public.order_items drop constraint %I', constraint_name);
    end loop;
    alter table public.order_items alter column product_id type text using product_id::text;
  end if;
end;
$$;

alter table public.order_items drop constraint if exists order_items_product_id_fkey;
alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  order_id uuid references public.orders(id),
  type text not null check (type in ('entry', 'sale', 'return', 'adjustment')),
  quantity integer not null,
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text,
  responsible_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.stock_movements add column if not exists responsible_user_id uuid references auth.users(id);
alter table public.stock_movements drop constraint if exists stock_movements_product_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete restrict;

do $$
declare constraint_name text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory_movements'
      and column_name='product_id' and data_type='uuid'
  ) then
    for constraint_name in
      select conname from pg_constraint
      where conrelid='public.inventory_movements'::regclass
        and contype='f' and pg_get_constraintdef(oid) ilike '%product_id%'
    loop
      execute format('alter table public.inventory_movements drop constraint %I', constraint_name);
    end loop;
    alter table public.inventory_movements alter column product_id type text using product_id::text;
  end if;
end;
$$;

alter table public.inventory_movements drop constraint if exists inventory_movements_product_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete restrict;

create unique index if not exists stock_movements_unique_order_type_product
  on public.stock_movements(order_id, type, product_id);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id, created_at desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "madu_admin_read_orders" on public.orders;
create policy "madu_admin_read_orders" on public.orders for select to authenticated
  using (private.is_store_admin());
drop policy if exists "madu_admin_read_order_items" on public.order_items;
create policy "madu_admin_read_order_items" on public.order_items for select to authenticated
  using (private.is_store_admin());
drop policy if exists "madu_admin_read_stock_movements" on public.stock_movements;
create policy "madu_admin_read_stock_movements" on public.stock_movements for select to authenticated
  using (private.is_store_admin());

create or replace function public.create_whatsapp_order(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal integer := 0;
  v_item record;
  v_product record;
  v_quantity integer;
  v_variation text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um produto' using errcode = '22023';
  end if;

  v_order_number := 'MADU-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.madu_order_number_seq')::text, 6, '0');

  insert into public.orders(number, customer_name, customer_phone, status, subtotal_cents, total_cents)
  values (v_order_number, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
          'pending', 0, 0)
  returning id into v_order_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
  loop
    v_quantity := v_item.quantity;
    v_variation := nullif(trim(v_item.variation), '');
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantidade invalida' using errcode = '22023';
    end if;

    select id, name, sku, image, slug, stock, coalesce(sale_price_cents, price_cents) as unit_price
      into v_product
    from public.products
    where id = v_item.product_id and is_active = true
    for update;

    if not found then raise exception 'Produto indisponivel' using errcode = 'P0002'; end if;
    if v_quantity > v_product.stock then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;

    insert into public.order_items(
      order_id, product_id, name, product_name, sku, variation, image_url, product_url,
      quantity, unit_price_cents, line_total_cents, total_cents
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.name, v_product.sku, v_variation,
      coalesce(v_product.image, ''), '/produto/' || v_product.slug,
      v_quantity, v_product.unit_price, v_quantity * v_product.unit_price,
      v_quantity * v_product.unit_price
    );
    v_subtotal := v_subtotal + v_quantity * v_product.unit_price;
  end loop;

  update public.orders
  set subtotal_cents = v_subtotal, total_cents = v_subtotal, updated_at = now()
  where id = v_order_id;
  return jsonb_build_object('id', v_order_id, 'number', v_order_number, 'subtotal_cents', v_subtotal);
end;
$$;

revoke all on function public.create_whatsapp_order(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_whatsapp_order(jsonb, text, text) to anon, authenticated;

create or replace function public.confirm_order_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_order record; v_item record; v_product record;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado' using errcode = 'P0002'; end if;
  if v_order.status <> 'pending' then raise exception 'Pedido ja foi processado' using errcode = '23505'; end if;

  for v_item in select * from public.order_items where order_id = p_order_id loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if v_product.stock < v_item.quantity then
      raise exception 'Estoque insuficiente para %', v_item.name using errcode = '22000';
    end if;
    insert into public.stock_movements(
      product_id, order_id, type, quantity, quantity_before, quantity_after, responsible_user_id
    ) values (
      v_item.product_id, p_order_id, 'sale', v_item.quantity, v_product.stock,
      v_product.stock - v_item.quantity, auth.uid()
    );
    update public.products set stock = v_product.stock - v_item.quantity where id = v_item.product_id;
  end loop;

  update public.orders
  set status='confirmed', processed_at=now(), processed_by=auth.uid(), updated_at=now()
  where id=p_order_id;
  return jsonb_build_object('id', p_order_id, 'status', 'confirmed');
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  if not private.is_store_admin() then raise exception 'Administrador autorizado necessario' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then raise exception 'Somente pedidos pendentes podem ser cancelados' using errcode = '22000'; end if;
  update public.orders set status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(), updated_at=now() where id=p_order_id;
  return jsonb_build_object('id', p_order_id, 'status', 'cancelled');
end;
$$;

create or replace function public.return_order_sale(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_order record; v_item record; v_product record;
begin
  if not private.is_store_admin() then raise exception 'Administrador autorizado necessario' using errcode = '42501'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Informe o motivo do estorno' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado' using errcode = 'P0002'; end if;
  if v_order.status <> 'confirmed' then raise exception 'Somente vendas confirmadas podem ser estornadas' using errcode = '22000'; end if;

  for v_item in select * from public.order_items where order_id=p_order_id loop
    select * into v_product from public.products where id=v_item.product_id for update;
    insert into public.stock_movements(
      product_id, order_id, type, quantity, quantity_before, quantity_after, reason, responsible_user_id
    ) values (
      v_item.product_id, p_order_id, 'return', v_item.quantity, v_product.stock,
      v_product.stock + v_item.quantity, trim(p_reason), auth.uid()
    ) on conflict (order_id, type, product_id) do nothing;
    if found then
      update public.products set stock=v_product.stock + v_item.quantity where id=v_item.product_id;
    end if;
  end loop;

  update public.orders
  set status='cancelled', returned_at=now(), returned_by=auth.uid(), return_reason=trim(p_reason), updated_at=now()
  where id=p_order_id and status='confirmed';
  if not found then raise exception 'Estorno ja processado' using errcode='23505'; end if;
  return jsonb_build_object('id', p_order_id, 'status', 'cancelled', 'returned', true);
end;
$$;

revoke all on function public.confirm_order_sale(uuid) from public, anon;
revoke all on function public.cancel_order(uuid) from public, anon;
revoke all on function public.return_order_sale(uuid, text) from public, anon;
grant execute on function public.confirm_order_sale(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.return_order_sale(uuid, text) to authenticated;

notify pgrst, 'reload schema';
