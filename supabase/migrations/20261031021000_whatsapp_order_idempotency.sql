alter table public.orders
  add column if not exists idempotency_key text;

create unique index if not exists orders_idempotency_key_unique
  on public.orders(idempotency_key)
  where idempotency_key is not null;

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
  v_item record;
  v_product record;
  v_quantity integer;
  v_variation text;
begin
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    perform pg_advisory_xact_lock(hashtext(trim(p_idempotency_key)));
  end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select id, number, subtotal_cents
      into v_order_id, v_order_number, v_subtotal
    from public.orders
    where idempotency_key = trim(p_idempotency_key)
    limit 1;

    if v_order_id is not null then
      update public.orders
      set customer_name = coalesce(nullif(trim(p_customer_name), ''), customer_name),
          customer_phone = coalesce(nullif(trim(p_customer_phone), ''), customer_phone),
          updated_at = now()
      where id = v_order_id;
      return jsonb_build_object('id', v_order_id, 'number', v_order_number, 'subtotal_cents', v_subtotal);
    end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um produto' using errcode = '22023';
  end if;

  v_order_number := 'MADU-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.madu_order_number_seq')::text, 6, '0');

  insert into public.orders(
    number, customer_name, customer_phone, status, subtotal_cents, total_cents, idempotency_key
  )
  values (
    v_order_number, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    'pending', 0, 0, nullif(trim(p_idempotency_key), '')
  )
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

revoke all on function public.create_whatsapp_order(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_whatsapp_order(jsonb, text, text, text) to anon, authenticated;
