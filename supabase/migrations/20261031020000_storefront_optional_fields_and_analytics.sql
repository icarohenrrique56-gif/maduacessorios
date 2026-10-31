alter table public.products
  add column if not exists material text,
  add column if not exists measurements text,
  add column if not exists characteristics text,
  add column if not exists care text,
  add column if not exists warranty text;

create table if not exists public.storefront_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in (
    'product_view',
    'catalog_search',
    'add_to_cart',
    'remove_from_cart',
    'whatsapp_checkout'
  )),
  product_id text references public.products (id) on delete set null,
  search_term text,
  created_at timestamptz not null default now()
);

alter table public.storefront_events enable row level security;

revoke all on public.storefront_events from public, anon, authenticated;
grant insert on public.storefront_events to anon, authenticated;
grant select on public.storefront_events to authenticated;

drop policy if exists "madu_public_record_storefront_event" on public.storefront_events;
create policy "madu_public_record_storefront_event"
  on public.storefront_events
  for insert
  to anon, authenticated
  with check (char_length(coalesce(search_term, '')) <= 100);

drop policy if exists "madu_admin_read_storefront_events" on public.storefront_events;
create policy "madu_admin_read_storefront_events"
  on public.storefront_events
  for select
  to authenticated
  using (private.is_store_admin());
