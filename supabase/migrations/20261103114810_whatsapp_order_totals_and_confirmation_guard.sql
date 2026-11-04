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
  v_subtotal integer := 0;
  v_total integer := 0;
  v_item record;
  v_product record;
  v_quantity integer;
  v_variation text;
  v_key text;
begin
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(v_key));
    select o.id, o.number, coalesce(o.subtotal_cents, 0), coalesce(o.total_cents, 0)
      into v_order_id, v_order_number, v_subtotal, v_total
    from public.orders o
    where o.idempotency_key = v_key
    limit 1;

    if v_order_id is not null then
      update public.orders
      set customer_name = coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), customer_name),
          customer_phone = coalesce(nullif(trim(coalesce(p_customer_phone, '')), ''), customer_phone),
          updated_at = now()
      where id = v_order_id;

      return jsonb_build_object(
        'id', v_order_id,
        'number', v_order_number,
        'subtotal_cents', v_subtotal,
        'total_cents', v_total,
        'idempotent', true
      );
    end if;
  end if;

  v_subtotal := 0;
  v_total := 0;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um produto' using errcode = '22023';
  end if;

  v_order_number := 'MADU-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.madu_order_number_seq')::text, 6, '0');

  insert into public.orders(
    number, customer_name, customer_phone, status,
    subtotal_cents, shipping_cents, total_cents, idempotency_key
  )
  values (
    v_order_number,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    'pending',
    0, 0, 0, v_key
  )
  returning id into v_order_id;

  for v_item in
    select * from jsonb_to_recordset(p_items)
      as x(product_id text, quantity integer, variation text)
  loop
    v_quantity := v_item.quantity;
    v_variation := nullif(trim(coalesce(v_item.variation, '')), '');
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantidade invalida' using errcode = '22023';
    end if;

    select id, name, sku, image, slug, stock,
           coalesce(sale_price_cents, price_cents) as unit_price
      into v_product
    from public.products
    where id = v_item.product_id and is_active = true
    for update;

    if not found then
      raise exception 'Produto indisponivel' using errcode = 'P0002';
    end if;
    if coalesce(v_product.unit_price, 0) < 0 then
      raise exception 'Preco invalido para %', v_product.name using errcode = '22000';
    end if;
    if v_product.unit_price is null then
      raise exception 'Preco ausente para %', v_product.name using errcode = '22000';
    end if;
    if v_quantity > v_product.stock then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;

    insert into public.order_items(
      order_id, product_id, name, product_name, sku, variation,
      image_url, product_url, quantity, unit_price_cents,
      line_total_cents, total_cents
    )
    values (
      v_order_id, v_product.id, v_product.name, v_product.name, v_product.sku, v_variation,
      coalesce(v_product.image, ''), '/produto/' || v_product.slug,
      v_quantity, v_product.unit_price,
      v_quantity * v_product.unit_price, v_quantity * v_product.unit_price
    );

    v_subtotal := v_subtotal + v_quantity * v_product.unit_price;
  end loop;

  v_total := v_subtotal + coalesce((select shipping_cents from public.orders where id = v_order_id), 0);

  update public.orders
  set subtotal_cents = v_subtotal,
      total_cents = v_total,
      updated_at = now()
  where id = v_order_id;

  if not exists (
    select 1
    from public.order_items
    where order_id = v_order_id
      and (quantity <= 0
        or unit_price_cents < 0
        or line_total_cents <> quantity * unit_price_cents
        or total_cents <> quantity * unit_price_cents)
  ) and (select sum(total_cents) from public.order_items where order_id = v_order_id) = v_subtotal
  then
    return jsonb_build_object(
      'id', v_order_id,
      'number', v_order_number,
      'subtotal_cents', v_subtotal,
      'total_cents', v_total,
      'idempotent', false
    );
  end if;

  raise exception 'Falha ao calcular os totais do pedido' using errcode = '22000';
end;
$$;

revoke all on function public.create_whatsapp_order(jsonb, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_whatsapp_order(jsonb, text, text, text)
to anon, authenticated;

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
  v_item_total integer;
  v_item_count integer;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido nao encontrado' using errcode = 'P0002';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'Pedido ja foi processado' using errcode = '23505';
  end if;

  select count(*), coalesce(sum(total_cents), 0)
    into v_item_count, v_item_total
  from public.order_items
  where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception 'Pedido sem itens nao pode ser confirmado' using errcode = '22000';
  end if;

  if exists (
    select 1
    from public.order_items
    where order_id = p_order_id
      and (quantity <= 0
        or line_total_cents <> quantity * unit_price_cents
        or total_cents <> quantity * unit_price_cents
        or line_total_cents <> total_cents)
  ) then
    raise exception 'Pedido precisa de revisao: existe divergencia entre itens e totais' using errcode = '22000';
  end if;

  if coalesce(v_order.subtotal_cents, 0) <> v_item_total
     or coalesce(v_order.total_cents, 0) <> v_item_total + coalesce(v_order.shipping_cents, 0) then
    raise exception 'Pedido precisa de revisao: total persistido diverge dos itens' using errcode = '22000';
  end if;

  for v_item in
    select product_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;
    if not found then
      raise exception 'Produto indisponivel' using errcode = 'P0002';
    end if;
    if v_product.stock < v_item.quantity then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;

    insert into public.stock_movements(
      product_id, order_id, type, quantity, quantity_before,
      quantity_after, responsible_user_id
    )
    values (
      v_item.product_id, p_order_id, 'sale', v_item.quantity, v_product.stock,
      v_product.stock - v_item.quantity, auth.uid()
    )
    on conflict (order_id, type, product_id) do nothing;

    if found then
      update public.products
      set stock = v_product.stock - v_item.quantity
      where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
  set status = 'confirmed',
      payment_status = 'paid',
      processed_at = now(),
      processed_by = auth.uid(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'id', p_order_id,
    'status', 'confirmed',
    'payment_status', 'paid'
  );
end;
$$;

revoke all on function public.confirm_order_sale(uuid) from public, anon;
grant execute on function public.confirm_order_sale(uuid) to authenticated;

notify pgrst, 'reload schema';