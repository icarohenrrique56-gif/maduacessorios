create index if not exists admin_user_permissions_created_by_idx
  on public.admin_user_permissions(created_by);

create index if not exists inventory_movements_admin_user_id_idx
  on public.inventory_movements(admin_user_id);

create index if not exists inventory_movements_product_admin_idx
  on public.inventory_movements(product_id, admin_user_id);

create index if not exists order_items_product_id_idx
  on public.order_items(product_id);

create index if not exists orders_customer_created_at_idx
  on public.orders(customer_id, created_at desc);

create index if not exists stock_movements_order_id_idx
  on public.stock_movements(order_id);

create index if not exists stock_movements_responsible_user_id_idx
  on public.stock_movements(responsible_user_id);

create or replace function public.touch_category_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

notify pgrst, 'reload schema';