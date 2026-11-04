drop function if exists public.quick_sale_stock_movement(text, text, integer, text);

create function public.quick_sale_stock_movement(
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
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade invalida' using errcode = '22023';
  end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    raise exception 'Informe a chave idempotente' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_key));

  select * into v_movement
  from public.stock_movements
  where idempotency_key = v_key
  limit 1;

  if found then
    return jsonb_build_object(
      'id', v_movement.id,
      'quantity_before', v_movement.quantity_before,
      'quantity_after', v_movement.quantity_after,
      'idempotent', true
    );
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and is_active = true
  for update;

  if not found then
    raise exception 'Produto indisponivel' using errcode = 'P0002';
  end if;
  if v_product.stock < p_quantity then
    raise exception 'Estoque insuficiente para %', v_product.name using errcode = '22000';
  end if;

  insert into public.stock_movements(
    product_id,
    type,
    quantity,
    quantity_before,
    quantity_after,
    variation,
    reason,
    responsible_user_id,
    idempotency_key
  )
  values (
    v_product.id,
    'sale',
    p_quantity,
    v_product.stock,
    v_product.stock - p_quantity,
    nullif(trim(coalesce(p_variation, '')), ''),
    'Venda rápida administrativa',
    auth.uid(),
    v_key
  )
  returning * into v_movement;

  update public.products
  set stock = v_product.stock - p_quantity,
      updated_at = now()
  where id = v_product.id;

  return jsonb_build_object(
    'id', v_movement.id,
    'quantity_before', v_movement.quantity_before,
    'quantity_after', v_movement.quantity_after,
    'idempotent', false
  );
end;
$$;

revoke all on function public.quick_sale_stock_movement(text, text, integer, text) from public, anon;
grant execute on function public.quick_sale_stock_movement(text, text, integer, text) to authenticated;

notify pgrst, 'reload schema';