alter table public.orders
  alter column subtotal_cents set default 0,
  alter column total_cents set default 0;

update public.orders
set subtotal_cents = coalesce(subtotal_cents, 0),
    total_cents = coalesce(total_cents, 0),
    updated_at = now()
where subtotal_cents is null or total_cents is null;

alter table public.orders
  alter column subtotal_cents set not null,
  alter column total_cents set not null;

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
  v_key text;
begin
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(v_key));

    select o.id, o.number, coalesce(o.subtotal_cents, 0)
      into v_order_id, v_order_number, v_subtotal
    from public.orders o
    where o.idempotency_key = v_key
    limit 1;

    if v_order_id is not null then
      update public.orders
      set customer_name = coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), customer_name),
          customer_phone = coalesce(nullif(trim(coalesce(p_customer_phone, '')), ''), customer_phone),
          subtotal_cents = coalesce(subtotal_cents, 0),
          total_cents = coalesce(total_cents, 0),
          updated_at = now()
      where id = v_order_id;

      return jsonb_build_object(
        'id', v_order_id,
        'number', v_order_number,
        'subtotal_cents', coalesce(v_subtotal, 0)
      );
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um produto' using errcode = '22023';
  end if;

  v_order_number := 'MADU-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.madu_order_number_seq')::text, 6, '0');

  insert into public.orders(
    number,
    customer_name,
    customer_phone,
    status,
    subtotal_cents,
    total_cents,
    idempotency_key
  )
  values (
    v_order_number,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    'pending',
    0,
    0,
    v_key
  )
  returning id into v_order_id;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer, variation text)
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

    if v_quantity > v_product.stock then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;

    insert into public.order_items(
      order_id,
      product_id,
      name,
      product_name,
      sku,
      variation,
      image_url,
      product_url,
      quantity,
      unit_price_cents,
      line_total_cents,
      total_cents
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.name,
      v_product.sku,
      v_variation,
      coalesce(v_product.image, ''),
      '/produto/' || v_product.slug,
      v_quantity,
      v_product.unit_price,
      v_quantity * v_product.unit_price,
      v_quantity * v_product.unit_price
    );

    v_subtotal := v_subtotal + (v_quantity * v_product.unit_price);
  end loop;

  v_subtotal := coalesce(v_subtotal, 0);

  update public.orders
  set subtotal_cents = v_subtotal,
      total_cents = v_subtotal,
      updated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'number', v_order_number,
    'subtotal_cents', v_subtotal
  );
end;
$$;

revoke all on function public.create_whatsapp_order(jsonb, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_whatsapp_order(jsonb, text, text, text)
to anon, authenticated;
