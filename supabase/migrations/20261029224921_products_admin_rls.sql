alter table public.products enable row level security;

drop policy if exists "madu_public_read_products" on public.products;
create policy "madu_public_read_products"
  on public.products
  for select
  to anon, authenticated
  using (true);

drop policy if exists "madu_admin_insert_products" on public.products;
create policy "madu_admin_insert_products"
  on public.products
  for insert
  to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "madu_admin_update_products" on public.products;
create policy "madu_admin_update_products"
  on public.products
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "madu_admin_delete_products" on public.products;
create policy "madu_admin_delete_products"
  on public.products
  for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
