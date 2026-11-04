create or replace function public.reset_stock_movements_history()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;

  delete from public.stock_movements;
  get diagnostics v_deleted = row_count;

  notify pgrst, 'reload schema';
  return jsonb_build_object('deleted', v_deleted);
end;
$$;

revoke all on function public.reset_stock_movements_history() from public, anon;
grant execute on function public.reset_stock_movements_history() to authenticated;

create or replace function public.set_product_stock(
  p_product_id text,
  p_stock integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_reason text;
begin
  if not private.is_store_admin() then
    raise exception 'Administrador autorizado necessario' using errcode = '42501';
  end if;
  if p_product_id is null or btrim(p_product_id) = '' then
    raise exception 'Produto invalido' using errcode = '22023';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception 'Saldo invalido' using errcode = '22023';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'Produto nao encontrado' using errcode = 'P0002';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_product.stock <> p_stock then
    insert into public.stock_movements(
      product_id, order_id, type, quantity, quantity_before,
      quantity_after, reason, responsible_user_id
    )
    values (
      p_product_id, null, 'adjustment', abs(p_stock - v_product.stock),
      v_product.stock, p_stock, coalesce(v_reason, 'Ajuste manual de saldo'),
      auth.uid()
    );

    update public.products
    set stock = p_stock,
        updated_at = now()
    where id = p_product_id;
  end if;

  return jsonb_build_object(
    'id', p_product_id,
    'stock', p_stock,
    'quantity_before', v_product.stock
  );
end;
$$;

revoke all on function public.set_product_stock(text, integer, text) from public, anon;
grant execute on function public.set_product_stock(text, integer, text) to authenticated;

notify pgrst, 'reload schema';