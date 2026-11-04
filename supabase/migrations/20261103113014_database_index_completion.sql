create index if not exists orders_cancelled_by_idx
  on public.orders(cancelled_by);

create index if not exists orders_processed_by_idx
  on public.orders(processed_by);

create index if not exists orders_returned_by_idx
  on public.orders(returned_by);

create index if not exists storefront_events_product_id_idx
  on public.storefront_events(product_id, created_at desc);