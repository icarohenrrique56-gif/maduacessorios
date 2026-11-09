-- Hardening incremental da operação da loja.
-- Não remove nem reescreve pedidos, produtos ou saldos existentes.

alter table public.products
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders
  add column if not exists idempotency_fingerprint text;

alter table public.stock_movements
  add column if not exists unit_price_cents integer,
  add column if not exists total_price_cents integer;

-- Mantém estoque físico separado das reservas temporárias de pedidos pendentes.
create table if not exists public.order_stock_reservations (
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (order_id, product_id)
);
alter table public.order_stock_reservations enable row level security;
revoke all on public.order_stock_reservations from public, anon, authenticated;
grant all on public.order_stock_reservations to service_role;
create index if not exists order_stock_reservations_product_expiry_idx
  on public.order_stock_reservations(product_id, expires_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stock_movements'::regclass
      and conname = 'stock_movements_unit_price_nonnegative'
  ) then
    alter table public.stock_movements
      add constraint stock_movements_unit_price_nonnegative
      check (unit_price_cents is null or unit_price_cents >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stock_movements'::regclass
      and conname = 'stock_movements_total_price_nonnegative'
  ) then
    alter table public.stock_movements
      add constraint stock_movements_total_price_nonnegative
      check (total_price_cents is null or total_price_cents >= 0);
  end if;
end
$$;

-- A vitrine pública não pode ler categorias inativas por meio da API direta.
drop policy if exists "madu_public_read_categories" on public.categories;
drop policy if exists "madu_admin_read_all_categories" on public.categories;
create policy "madu_public_read_categories"
  on public.categories for select to anon, authenticated
  using (is_active = true);
create policy "madu_admin_read_all_categories"
  on public.categories for select to authenticated
  using ((select private.is_store_admin()));

-- Produtos inativos também deixam de ser consultáveis por visitantes.
drop policy if exists "madu_public_read_products" on public.products;
drop policy if exists "madu_staff_read_all_products" on public.products;
create policy "madu_public_read_products"
  on public.products for select to anon
  using (is_active = true);
create policy "madu_staff_read_all_products"
  on public.products for select to authenticated
  using ((select private.is_store_staff()));

-- A tabela interna não é consultável anonimamente; a view expõe apenas a vitrine.
revoke select on public.products from public, anon;
grant select on public.products to authenticated;
create or replace view public.storefront_products with (security_barrier = true) as
select
  id, slug, name, description, category, price_cents, sale_price_cents,
  image, featured, is_active, variations, material, measurements,
  p.characteristics, p.care, p.warranty, p.created_at,
  (p.stock - coalesce((
    select sum(r.quantity)::integer
    from public.order_stock_reservations r
    where r.product_id = p.id and r.expires_at > clock_timestamp()
  ), 0) > 0) as is_available
from public.products p
where p.is_active = true
  and not exists (
    select 1
    from public.categories c
    where c.is_active = false
      and (lower(c.name) = lower(p.category) or lower(c.slug) = lower(p.category))
  );
grant select on public.storefront_products to anon, authenticated;

-- Estoque só muda por RPC transacional; campos não relacionados continuam editáveis.
revoke update on public.products from public, anon, authenticated;
grant update (
  slug, name, description, category, price_cents, sale_price_cents,
  sku, image, featured, is_active, variations, material, measurements,
  characteristics, care, warranty
) on public.products to authenticated;

-- Tabelas de pedidos e movimentos ficam somente para leitura pelo cliente autenticado.
-- Escritas permanecem encapsuladas em funções SECURITY DEFINER validadas.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_items', 'stock_movements')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;

revoke all on public.orders, public.order_items, public.stock_movements
  from public, anon, authenticated;
grant select on public.orders, public.order_items, public.stock_movements to authenticated;

create policy "madu_admin_read_orders"
  on public.orders for select to authenticated
  using ((select private.is_store_admin()));
create policy "madu_admin_read_order_items"
  on public.order_items for select to authenticated
  using ((select private.is_store_admin()));
create policy "madu_admin_read_stock_movements"
  on public.stock_movements for select to authenticated
  using ((select private.is_store_admin()));

-- Analytics: clientes não podem enviar IDs ou timestamps arbitrários.
alter table public.storefront_events enable row level security;
revoke all on public.storefront_events from public, anon, authenticated;
grant insert (event_name, product_id, search_term) on public.storefront_events to anon, authenticated;
grant select on public.storefront_events to authenticated;
drop policy if exists "madu_public_record_storefront_event" on public.storefront_events;
drop policy if exists "madu_admin_read_storefront_events" on public.storefront_events;
create policy "madu_public_record_storefront_event"
  on public.storefront_events for insert to anon, authenticated
  with check (char_length(coalesce(search_term, '')) <= 100);
create policy "madu_admin_read_storefront_events"
  on public.storefront_events for select to authenticated
  using ((select private.is_store_admin()));

-- A criação pública de pedidos é roteada por Edge Function, que aplica limite por IP.
create table if not exists public.whatsapp_order_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_order_rate_limits enable row level security;
revoke all on public.whatsapp_order_rate_limits from public, anon, authenticated;
grant all on public.whatsapp_order_rate_limits to service_role;
create index if not exists whatsapp_order_rate_limits_window_idx
  on public.whatsapp_order_rate_limits(window_started_at);

create or replace function public.consume_whatsapp_order_rate_limit(
  p_ip_hash text,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_started_at timestamptz;
  v_request_count integer;
  v_retry_after integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit < 1 or p_limit > 120 then
    raise exception 'Origem inválida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_ip_hash));
  select window_started_at, request_count
    into v_window_started_at, v_request_count
  from public.whatsapp_order_rate_limits
  where ip_hash = p_ip_hash
  for update;

  if not found then
    insert into public.whatsapp_order_rate_limits(ip_hash, window_started_at, request_count)
    values (p_ip_hash, now(), 1);
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  if v_window_started_at <= now() - interval '1 minute' then
    update public.whatsapp_order_rate_limits
    set window_started_at = now(), request_count = 1, updated_at = now()
    where ip_hash = p_ip_hash;
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  if v_request_count >= p_limit then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_window_started_at + interval '1 minute' - now())))::integer);
    return jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after);
  end if;

  update public.whatsapp_order_rate_limits
  set request_count = request_count + 1, updated_at = now()
  where ip_hash = p_ip_hash;
  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;
revoke all on function public.consume_whatsapp_order_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_whatsapp_order_rate_limit(text, integer) to service_role;

create or replace function public.validate_cart_stock(
  p_items jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_product record;
  v_own_order_id uuid;
  v_unavailable_ids text[] := array[]::text[];
begin
  if p_idempotency_key is not null and length(p_idempotency_key) > 128 then
    raise exception 'Chave de checkout inválida' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Informe uma lista de itens válida' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Informe entre 1 e 30 itens válidos' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    where product_id is null or btrim(product_id) = ''
       or quantity is null or quantity <= 0 or quantity > 25
       or (variation is not null and length(variation) > 80)
  ) then
    raise exception 'Produto, variação ou quantidade inválida' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    join public.products p on p.id = x.product_id
    where (
      cardinality(coalesce(p.variations, array[]::text[])) = 0
      and nullif(btrim(coalesce(x.variation, '')), '') is not null
    ) or (
      cardinality(coalesce(p.variations, array[]::text[])) > 0
      and (
        nullif(btrim(coalesce(x.variation, '')), '') is null
        or not (nullif(btrim(coalesce(x.variation, '')), '') = any(p.variations))
      )
    )
  ) then
    raise exception 'Uma ou mais variações não pertencem ao produto' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    group by product_id
    having sum(quantity) > 25
  ) then
    raise exception 'O carrinho excede o limite de 25 unidades por produto' using errcode = '22023';
  end if;
  if (
    select sum(quantity)
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
  ) > 100 then
    raise exception 'O carrinho excede o limite de 100 unidades' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is not null then
    select o.id into v_own_order_id
    from public.orders o
    where o.idempotency_key = p_idempotency_key
      and o.status = 'pending'
      and exists (
        select 1 from public.order_stock_reservations r
        where r.order_id = o.id and r.expires_at > clock_timestamp()
      )
    limit 1;
  end if;

  for v_item in
    select product_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    group by product_id
  loop
    select p.id,
           p.stock - coalesce((
             select sum(r.quantity)::integer
             from public.order_stock_reservations r
             where r.product_id = p.id and r.expires_at > clock_timestamp()
               and (v_own_order_id is null or r.order_id <> v_own_order_id)
           ), 0) as available_stock,
           p.is_active
      into v_product
    from public.products p
    where p.id = v_item.product_id;
    if not found then
      v_unavailable_ids := array_append(v_unavailable_ids, v_item.product_id);
    elsif not v_product.is_active or v_product.available_stock < v_item.quantity then
      v_unavailable_ids := array_append(v_unavailable_ids, v_item.product_id);
    end if;
  end loop;

  return jsonb_build_object(
    'available', cardinality(v_unavailable_ids) = 0,
    'unavailable_product_ids', to_jsonb(v_unavailable_ids)
  );
end;
$$;
revoke all on function public.validate_cart_stock(jsonb, text) from public, anon, authenticated;
grant execute on function public.validate_cart_stock(jsonb, text) to service_role;

create or replace function public.release_whatsapp_order_reservation(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_key text;
begin
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is null or length(v_key) > 128 then
    raise exception 'Chave de checkout inválida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_key));
  select id, status into v_order
  from public.orders
  where idempotency_key = v_key
  limit 1
  for update;
  if not found or v_order.status <> 'pending' then
    return jsonb_build_object('released', false);
  end if;

  update public.orders
  set status = 'cancelled', payment_status = 'cancelled',
      cancelled_at = now(), updated_at = now()
  where id = v_order.id;
  delete from public.order_stock_reservations where order_id = v_order.id;

  return jsonb_build_object('released', true);
end;
$$;
revoke all on function public.release_whatsapp_order_reservation(text) from public, anon, authenticated;
grant execute on function public.release_whatsapp_order_reservation(text) to service_role;

create or replace function public.create_whatsapp_order(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal bigint := 0;
  v_total bigint := 0;
  v_line_total bigint;
  v_total_units bigint := 0;
  v_item record;
  v_product record;
  v_reserved bigint;
  v_quantity integer;
  v_variation text;
  v_key text;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_existing_status text;
begin
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is null or length(v_key) > 128 then
    raise exception 'Chave idempotente ausente ou inválida' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_customer_name, ''))) > 120 then
    raise exception 'Nome do cliente muito longo' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_customer_phone, ''))) > 32 then
    raise exception 'Telefone muito longo' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Informe uma lista de produtos válida' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'O pedido deve conter entre 1 e 30 itens' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    where product_id is null or btrim(product_id) = ''
       or quantity is null or quantity <= 0 or quantity > 25
       or length(coalesce(variation, '')) > 80
  ) then
    raise exception 'Um ou mais itens do pedido são inválidos' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    join public.products p on p.id = x.product_id
    where (
      cardinality(coalesce(p.variations, array[]::text[])) = 0
      and nullif(btrim(coalesce(x.variation, '')), '') is not null
    ) or (
      cardinality(coalesce(p.variations, array[]::text[])) > 0
      and (
        nullif(btrim(coalesce(x.variation, '')), '') is null
        or not (nullif(btrim(coalesce(x.variation, '')), '') = any(p.variations))
      )
    )
  ) then
    raise exception 'Uma ou mais variações não pertencem ao produto' using errcode = '22023';
  end if;

  select coalesce(sum(quantity), 0) into v_total_units
  from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text);
  if v_total_units > 100 then
    raise exception 'O pedido excede o limite de 100 unidades' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    group by product_id
    having sum(quantity) > 25
  ) then
    raise exception 'O pedido excede o limite de 25 unidades por produto' using errcode = '22023';
  end if;

  v_fingerprint := md5(p_items::text);
  perform pg_advisory_xact_lock(hashtext(v_key));
  select o.id, o.number, o.subtotal_cents, o.total_cents,
         o.idempotency_fingerprint, o.status
    into v_order_id, v_order_number, v_subtotal, v_total,
         v_existing_fingerprint, v_existing_status
  from public.orders o
  where o.idempotency_key = v_key
  limit 1
  for update;

  if v_order_id is not null then
    if v_existing_fingerprint is not null and v_existing_fingerprint <> v_fingerprint then
      raise exception 'A chave idempotente já foi usada em outro pedido' using errcode = '23505';
    end if;
    if v_existing_status <> 'pending' then
      raise exception 'Este pedido já foi processado; inicie um novo checkout' using errcode = '23505';
    end if;
    if v_existing_status = 'pending' and exists (
      select 1
      from public.order_items oi
      left join public.order_stock_reservations r
        on r.order_id = oi.order_id and r.product_id = oi.product_id
      where oi.order_id = v_order_id and oi.product_id is not null
      group by oi.product_id
      having coalesce(max(r.quantity), 0) < sum(oi.quantity)
          or max(r.expires_at) <= clock_timestamp()
    ) then
      raise exception 'A reserva deste pedido expirou; atualize o carrinho e tente novamente' using errcode = '22000';
    end if;
    if v_existing_status = 'pending' then
      update public.order_stock_reservations
      set expires_at = clock_timestamp() + interval '30 minutes'
      where order_id = v_order_id and expires_at > clock_timestamp();
    end if;
    update public.orders
    set customer_name = coalesce(nullif(btrim(coalesce(p_customer_name, '')), ''), customer_name),
        customer_phone = coalesce(nullif(btrim(coalesce(p_customer_phone, '')), ''), customer_phone),
        updated_at = now()
    where id = v_order_id;
    return jsonb_build_object(
      'id', v_order_id, 'number', v_order_number,
      'subtotal_cents', v_subtotal, 'total_cents', v_total, 'idempotent', true
    );
  end if;

  -- Bloqueia cada produto uma vez, em ordem determinística, e valida estoque agregado
  -- antes de gravar qualquer item (incluindo variações repetidas do mesmo produto).
  for v_item in
    select product_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
    group by product_id
    order by product_id
  loop
    select p.id, p.name, p.stock into v_product
    from public.products p
    where p.id = v_item.product_id and p.is_active = true
    for update;
    if not found then
      raise exception 'Produto indisponível' using errcode = 'P0002';
    end if;
    select coalesce(sum(quantity), 0) into v_reserved
    from public.order_stock_reservations
    where product_id = v_item.product_id and expires_at > clock_timestamp();
    if v_item.quantity > v_product.stock - v_reserved then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;
  end loop;

  v_order_number := 'MADU-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.madu_order_number_seq')::text, 6, '0');
  insert into public.orders(
    number, customer_name, customer_phone, status,
    subtotal_cents, shipping_cents, total_cents,
    idempotency_key, idempotency_fingerprint
  ) values (
    v_order_number,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    'pending', 0, 0, 0, v_key, v_fingerprint
  ) returning id into v_order_id;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(product_id text, quantity integer, variation text)
  loop
    v_quantity := v_item.quantity;
    v_variation := nullif(btrim(coalesce(v_item.variation, '')), '');
    select id, name, sku, image, slug, stock,
           coalesce(sale_price_cents, price_cents) as unit_price
      into v_product
    from public.products
    where id = v_item.product_id and is_active = true
    for update;
    if not found then
      raise exception 'Produto indisponível' using errcode = 'P0002';
    end if;
    if v_quantity > v_product.stock then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;
    if v_product.unit_price is null or v_product.unit_price < 0 then
      raise exception 'Preço inválido para %', v_product.name using errcode = '22000';
    end if;

    v_line_total := v_quantity::bigint * v_product.unit_price::bigint;
    v_subtotal := v_subtotal + v_line_total;
    if v_line_total > 2147483647 or v_subtotal > 2147483647 then
      raise exception 'O valor do pedido excede o limite permitido' using errcode = '22003';
    end if;

    insert into public.order_items(
      order_id, product_id, name, product_name, sku, variation,
      image_url, product_url, quantity, unit_price_cents,
      line_total_cents, total_cents
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.name, v_product.sku, v_variation,
      coalesce(v_product.image, ''), '/produto/' || v_product.slug,
      v_quantity, v_product.unit_price, v_line_total::integer, v_line_total::integer
    );
  end loop;

  select v_subtotal + coalesce(shipping_cents, 0)
    into v_total
  from public.orders
  where id = v_order_id;
  if v_total > 2147483647 then
    raise exception 'O valor do pedido excede o limite permitido' using errcode = '22003';
  end if;

  update public.orders
  set subtotal_cents = v_subtotal::integer,
      total_cents = v_total::integer,
      updated_at = now()
  where id = v_order_id;

  insert into public.order_stock_reservations(order_id, product_id, quantity, expires_at)
  select v_order_id, x.product_id, sum(x.quantity)::integer, clock_timestamp() + interval '30 minutes'
  from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
  group by x.product_id;

  return jsonb_build_object(
    'id', v_order_id, 'number', v_order_number,
    'subtotal_cents', v_subtotal, 'total_cents', v_total, 'idempotent', false
  );
end;
$$;
revoke all on function public.create_whatsapp_order(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_whatsapp_order(jsonb, text, text, text) to service_role;

create or replace function public.confirm_order_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
  v_product record;
  v_reservation record;
  v_item_total bigint;
  v_item_count integer;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessário' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'Pedido já foi processado' using errcode = '23505';
  end if;

  select count(*), coalesce(sum(total_cents), 0)
    into v_item_count, v_item_total
  from public.order_items
  where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception 'Pedido sem itens não pode ser confirmado' using errcode = '22000';
  end if;
  if exists (
    select 1
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and (oi.product_id is null or p.id is null)
  ) then
    raise exception 'Pedido precisa de revisão: existe produto removido ou inválido' using errcode = '22000';
  end if;
  if exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and (quantity <= 0
        or unit_price_cents < 0
        or line_total_cents <> quantity::bigint * unit_price_cents::bigint
        or total_cents <> quantity::bigint * unit_price_cents::bigint
        or line_total_cents <> total_cents)
  ) then
    raise exception 'Pedido precisa de revisão: existe divergência entre itens e totais' using errcode = '22000';
  end if;
  if coalesce(v_order.subtotal_cents, 0)::bigint <> v_item_total
     or coalesce(v_order.total_cents, 0)::bigint <> v_item_total + coalesce(v_order.shipping_cents, 0) then
    raise exception 'Pedido precisa de revisão: total persistido diverge dos itens' using errcode = '22000';
  end if;

  for v_item in
    select product_id, sum(quantity)::bigint as quantity,
           sum(total_cents)::bigint as total_price_cents
    from public.order_items
    where order_id = p_order_id
    group by product_id
    order by product_id
  loop
    if v_item.quantity > 2147483647 or v_item.total_price_cents > 2147483647 then
      raise exception 'Pedido excede a capacidade de estoque ou valor' using errcode = '22003';
    end if;
    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;
    if not found then
      raise exception 'Produto indisponível' using errcode = 'P0002';
    end if;
    select quantity, expires_at into v_reservation
    from public.order_stock_reservations
    where order_id = p_order_id and product_id = v_item.product_id
    for update;
    if found then
      if v_reservation.expires_at <= clock_timestamp() then
        raise exception 'A reserva deste pedido expirou; cancele e crie um novo pedido' using errcode = '22000';
      end if;
      if v_reservation.quantity <> v_item.quantity then
        raise exception 'Pedido precisa de revisão: reserva diverge dos itens' using errcode = '22000';
      end if;
    elsif v_product.stock - coalesce((
      select sum(r.quantity)::integer
      from public.order_stock_reservations r
      where r.product_id = v_item.product_id and r.expires_at > clock_timestamp()
    ), 0) < v_item.quantity then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;
    if v_product.stock < v_item.quantity then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;

    insert into public.stock_movements(
      product_id, order_id, type, quantity, quantity_before,
      quantity_after, total_price_cents, responsible_user_id
    ) values (
      v_item.product_id, p_order_id, 'sale', v_item.quantity::integer,
      v_product.stock, v_product.stock - v_item.quantity::integer,
      v_item.total_price_cents::integer, auth.uid()
    );

    update public.products
    set stock = v_product.stock - v_item.quantity::integer,
        updated_at = now()
    where id = v_item.product_id;

    delete from public.order_stock_reservations
    where order_id = p_order_id and product_id = v_item.product_id;
  end loop;

  update public.orders
  set status = 'confirmed', payment_status = 'paid',
      processed_at = now(), processed_by = auth.uid(), updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('id', p_order_id, 'status', 'confirmed', 'payment_status', 'paid');
end;
$$;
revoke all on function public.confirm_order_sale(uuid) from public, anon;
grant execute on function public.confirm_order_sale(uuid) to authenticated;

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessário' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select status into v_status
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'Somente pedidos pendentes podem ser cancelados' using errcode = '22000';
  end if;

  update public.orders
  set status = 'cancelled', payment_status = 'cancelled',
      cancelled_at = now(), cancelled_by = auth.uid(), updated_at = now()
  where id = p_order_id;
  delete from public.order_stock_reservations where order_id = p_order_id;

  return jsonb_build_object('id', p_order_id, 'status', 'cancelled', 'payment_status', 'cancelled');
end;
$$;
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;

-- A chave antiga de três argumentos não pode mais gravar saldo sem verificar a leitura-base.
revoke all on function public.set_product_stock(text, integer, text) from public, anon, authenticated;

create or replace function public.set_product_stock(
  p_product_id text,
  p_stock integer,
  p_reason text,
  p_expected_stock integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_reason text;
  v_reserved bigint;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessário' using errcode = '42501';
  end if;
  if p_product_id is null or btrim(p_product_id) = ''
     or p_stock is null or p_stock < 0
     or p_expected_stock is null or p_expected_stock < 0 then
    raise exception 'Saldo ou produto inválido' using errcode = '22023';
  end if;

  select id, stock into v_product
  from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  if v_product.stock <> p_expected_stock then
    raise exception 'O saldo mudou desde a última leitura; atualize a tela e tente novamente' using errcode = '40001';
  end if;
  select coalesce(sum(quantity), 0) into v_reserved
  from public.order_stock_reservations
  where product_id = p_product_id and expires_at > clock_timestamp();
  if p_stock < v_reserved then
    raise exception 'O novo saldo não pode ser menor que as unidades reservadas em pedidos pendentes' using errcode = '22000';
  end if;

  v_reason := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Ajuste manual de saldo');
  if v_product.stock <> p_stock then
    insert into public.stock_movements(
      product_id, type, quantity, quantity_before, quantity_after, reason, responsible_user_id
    ) values (
      p_product_id, 'adjustment', abs(p_stock - v_product.stock),
      v_product.stock, p_stock, v_reason, auth.uid()
    );
    update public.products set stock = p_stock, updated_at = now() where id = p_product_id;
  end if;

  return jsonb_build_object('id', p_product_id, 'stock', p_stock, 'quantity_before', v_product.stock);
end;
$$;
revoke all on function public.set_product_stock(text, integer, text, integer) from public, anon;
grant execute on function public.set_product_stock(text, integer, text, integer) to authenticated;

revoke all on function public.adjust_product_stock(text, integer, text) from public, anon, authenticated;

create or replace function public.adjust_product_stock(
  p_product_id text,
  p_delta integer,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_movement record;
  v_new_stock bigint;
  v_reason text;
  v_key text;
  v_reserved bigint;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessário' using errcode = '42501';
  end if;
  if p_product_id is null or btrim(p_product_id) = ''
     or p_delta is null or p_delta = 0 or abs(p_delta::bigint) > 100000 then
    raise exception 'Produto ou ajuste inválido' using errcode = '22023';
  end if;
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is null or length(v_key) > 128 then
    raise exception 'Informe uma chave idempotente válida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_key));
  select * into v_movement
  from public.stock_movements
  where idempotency_key = v_key
  limit 1;
  if found then
    if v_movement.product_id <> p_product_id
       or v_movement.type <> 'adjustment'
       or v_movement.quantity_after - v_movement.quantity_before <> p_delta then
      raise exception 'A chave idempotente já foi usada em outro ajuste' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', v_movement.id, 'stock', v_movement.quantity_after,
      'quantity_before', v_movement.quantity_before, 'idempotent', true
    );
  end if;

  select id, stock into v_product
  from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  v_new_stock := v_product.stock::bigint + p_delta::bigint;
  if v_new_stock < 0 or v_new_stock > 2147483647 then
    raise exception 'O ajuste produziria um saldo inválido' using errcode = '22000';
  end if;
  select coalesce(sum(quantity), 0) into v_reserved
  from public.order_stock_reservations
  where product_id = p_product_id and expires_at > clock_timestamp();
  if v_new_stock < v_reserved then
    raise exception 'O ajuste não pode reduzir o saldo abaixo das unidades reservadas em pedidos pendentes' using errcode = '22000';
  end if;

  v_reason := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Ajuste manual de saldo');
  insert into public.stock_movements(
    product_id, type, quantity, quantity_before, quantity_after,
    reason, responsible_user_id, idempotency_key
  ) values (
    p_product_id, 'adjustment', abs(p_delta), v_product.stock,
    v_new_stock::integer, v_reason, auth.uid(), v_key
  );
  update public.products
  set stock = v_new_stock::integer, updated_at = now()
  where id = p_product_id;

  return jsonb_build_object(
    'id', p_product_id, 'stock', v_new_stock,
    'quantity_before', v_product.stock, 'idempotent', false
  );
end;
$$;
do $$
begin
  if to_regprocedure('public.adjust_product_stock(text,integer,text)') is not null then
    execute 'revoke all on function public.adjust_product_stock(text, integer, text) from public, anon, authenticated';
  end if;
end
$$;
revoke all on function public.adjust_product_stock(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.adjust_product_stock(text, integer, text, text) to authenticated;

create or replace function public.quick_sale_stock_movement(
  p_product_id text,
  p_variation text default null,
  p_quantity integer default 1,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_product record;
  v_movement record;
  v_total_price bigint;
  v_unit_price integer;
  v_variation text;
  v_reserved bigint;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessário' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100 then
    raise exception 'Quantidade inválida (máximo 100 unidades)' using errcode = '22023';
  end if;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is null or length(v_key) > 128 then
    raise exception 'Informe uma chave idempotente válida' using errcode = '22023';
  end if;
  v_variation := nullif(btrim(coalesce(p_variation, '')), '');
  if length(coalesce(v_variation, '')) > 80 then
    raise exception 'Variação muito longa' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_key));
  select * into v_movement
  from public.stock_movements
  where idempotency_key = v_key
  limit 1;
  if found then
    if v_movement.product_id <> p_product_id
       or v_movement.quantity <> p_quantity
       or coalesce(v_movement.variation, '') <> coalesce(v_variation, '') then
      raise exception 'A chave idempotente já foi usada em outra venda' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', v_movement.id, 'quantity_before', v_movement.quantity_before,
      'quantity_after', v_movement.quantity_after, 'idempotent', true
    );
  end if;

  select id, name, stock, coalesce(sale_price_cents, price_cents) as unit_price
    into v_product
  from public.products
  where id = p_product_id and is_active = true
  for update;
  if not found then
    raise exception 'Produto indisponível' using errcode = 'P0002';
  end if;
  select coalesce(sum(quantity), 0) into v_reserved
  from public.order_stock_reservations
  where product_id = p_product_id and expires_at > clock_timestamp();
  if v_product.stock - v_reserved < p_quantity then
    raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
  end if;

  v_unit_price := v_product.unit_price;
  v_total_price := v_unit_price::bigint * p_quantity::bigint;
  if v_unit_price is null or v_unit_price < 0 or v_total_price > 2147483647 then
    raise exception 'Preço inválido para a venda' using errcode = '22003';
  end if;

  insert into public.stock_movements(
    product_id, type, quantity, quantity_before, quantity_after,
    unit_price_cents, total_price_cents, variation, reason,
    responsible_user_id, idempotency_key
  ) values (
    v_product.id, 'sale', p_quantity, v_product.stock, v_product.stock - p_quantity,
    v_unit_price, v_total_price::integer, v_variation,
    'Venda rápida administrativa', auth.uid(), v_key
  ) returning * into v_movement;

  update public.products
  set stock = v_product.stock - p_quantity, updated_at = now()
  where id = v_product.id;

  return jsonb_build_object(
    'id', v_movement.id, 'quantity_before', v_movement.quantity_before,
    'quantity_after', v_movement.quantity_after, 'idempotent', false
  );
end;
$$;
revoke all on function public.quick_sale_stock_movement(text, text, integer, text) from public, anon;
grant execute on function public.quick_sale_stock_movement(text, text, integer, text) to authenticated;

-- Estoque inicial em novos produtos também recebe trilha auditável. Não faz backfill de saldos antigos.
create or replace function private.record_initial_product_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.stock, 0) > 0 then
    insert into public.stock_movements(
      product_id, type, quantity, quantity_before, quantity_after,
      reason, responsible_user_id
    ) values (
      new.id, 'entry', new.stock, 0, new.stock,
      'Saldo inicial do cadastro', auth.uid()
    );
  end if;
  return new;
end;
$$;
revoke all on function private.record_initial_product_stock() from public, anon, authenticated;
drop trigger if exists madu_record_initial_product_stock on public.products;
create trigger madu_record_initial_product_stock
  after insert on public.products
  for each row execute function private.record_initial_product_stock();

-- A criação de pedido só pode ser chamada pelo endpoint com proteção de abuso.
notify pgrst, 'reload schema';
