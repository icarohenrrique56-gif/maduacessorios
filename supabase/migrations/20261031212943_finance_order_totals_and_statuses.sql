update public.orders
set total_cents = subtotal_cents
where coalesce(total_cents, 0) <= 0
  and coalesce(subtotal_cents, 0) > 0;

update public.orders
set subtotal_cents = total_cents
where coalesce(subtotal_cents, 0) <= 0
  and coalesce(total_cents, 0) > 0;

update public.orders
set payment_status = 'paid',
    updated_at = now()
where status in ('confirmed', 'completed', 'preparing', 'shipped', 'delivered')
  and payment_status = 'pending';

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
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado' using errcode = 'P0002'; end if;
  if v_order.status <> 'pending' then raise exception 'Pedido ja foi processado' using errcode = '23505'; end if;

  for v_item in
    select product_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id
  loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if not found then raise exception 'Produto indisponivel' using errcode = 'P0002'; end if;
    if v_product.stock < v_item.quantity then
      raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
    end if;

    insert into public.stock_movements(
      product_id, order_id, type, quantity, quantity_before, quantity_after, responsible_user_id
    ) values (
      v_item.product_id, p_order_id, 'sale', v_item.quantity, v_product.stock,
      v_product.stock - v_item.quantity, auth.uid()
    ) on conflict (order_id, type, product_id) do nothing;

    if found then
      update public.products set stock = v_product.stock - v_item.quantity where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
  set status = 'confirmed',
      payment_status = 'paid',
      processed_at = now(),
      processed_by = auth.uid(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('id', p_order_id, 'status', 'confirmed', 'payment_status', 'paid');
end;
$$;

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
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then
    raise exception 'Somente pedidos pendentes podem ser cancelados' using errcode = '22000';
  end if;

  update public.orders
  set status = 'cancelled',
      payment_status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('id', p_order_id, 'status', 'cancelled', 'payment_status', 'cancelled');
end;
$$;

create or replace function public.return_order_sale(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
  v_product record;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo do estorno' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido nao encontrado' using errcode = 'P0002'; end if;
  if v_order.status <> 'confirmed' then
    raise exception 'Somente vendas confirmadas podem ser estornadas' using errcode = '22000';
  end if;

  for v_item in
    select product_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id
  loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if not found then raise exception 'Produto indisponivel' using errcode = 'P0002'; end if;

    insert into public.stock_movements(
      product_id, order_id, type, quantity, quantity_before, quantity_after, reason, responsible_user_id
    ) values (
      v_item.product_id, p_order_id, 'return', v_item.quantity, v_product.stock,
      v_product.stock + v_item.quantity, trim(p_reason), auth.uid()
    ) on conflict (order_id, type, product_id) do nothing;

    if found then
      update public.products set stock = v_product.stock + v_item.quantity where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
  set status = 'cancelled',
      payment_status = 'refunded',
      returned_at = now(),
      returned_by = auth.uid(),
      return_reason = trim(p_reason),
      updated_at = now()
  where id = p_order_id and status = 'confirmed';

  if not found then raise exception 'Estorno ja processado' using errcode = '23505'; end if;
  return jsonb_build_object(
    'id', p_order_id,
    'status', 'cancelled',
    'payment_status', 'refunded',
    'returned', true
  );
end;
$$;

revoke all on function public.confirm_order_sale(uuid) from public, anon;
revoke all on function public.cancel_order(uuid) from public, anon;
revoke all on function public.return_order_sale(uuid, text) from public, anon;
grant execute on function public.confirm_order_sale(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.return_order_sale(uuid, text) to authenticated;