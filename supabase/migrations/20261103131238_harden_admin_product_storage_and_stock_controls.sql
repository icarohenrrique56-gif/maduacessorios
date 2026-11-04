alter table public.products enable row level security;

drop policy if exists "madu_staff_insert_products" on public.products;
create policy "madu_staff_insert_products"
  on public.products
  for insert
  to authenticated
  with check ((select private.is_store_staff()));

drop policy if exists "madu_staff_update_products" on public.products;
create policy "madu_staff_update_products"
  on public.products
  for update
  to authenticated
  using ((select private.is_store_staff()))
  with check ((select private.is_store_staff()));

drop policy if exists "madu_admin_delete_products" on public.products;
create policy "madu_admin_delete_products"
  on public.products
  for delete
  to authenticated
  using ((select private.is_store_admin()));

drop policy if exists "madu_admin_upload_product_images" on storage.objects;
create policy "madu_admin_upload_product_images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (select private.is_store_admin())
  );

drop policy if exists "madu_admin_update_product_images" on storage.objects;
create policy "madu_admin_update_product_images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (select private.is_store_admin())
  )
  with check (
    bucket_id = 'product-images'
    and (select private.is_store_admin())
  );

drop policy if exists "madu_admin_delete_product_images" on storage.objects;
create policy "madu_admin_delete_product_images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (select private.is_store_admin())
  );

notify pgrst, 'reload schema';