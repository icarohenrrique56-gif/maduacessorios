do $$
begin
  if to_regclass('public.store_settings') is null then
    raise exception 'public.store_settings must exist before applying the main settings policy';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_settings'
      and column_name = 'id'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_settings'
      and column_name = 'whatsapp_number'
  ) then
    raise exception 'public.store_settings must use id and whatsapp_number columns';
  end if;
end
$$;

alter table public.store_settings enable row level security;

revoke all on public.store_settings from public, anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant insert, update on public.store_settings to authenticated;

drop policy if exists "madu_public_read_public_store_settings" on public.store_settings;
drop policy if exists "madu_public_read_whatsapp_setting" on public.store_settings;
drop policy if exists "madu_admin_read_store_settings" on public.store_settings;
drop policy if exists "madu_admin_insert_store_settings" on public.store_settings;
drop policy if exists "madu_admin_update_store_settings" on public.store_settings;
drop policy if exists "madu_admin_delete_store_settings" on public.store_settings;
drop policy if exists "madu_admin_only_insert_store_settings" on public.store_settings;
drop policy if exists "madu_admin_only_update_store_settings" on public.store_settings;

create policy "madu_public_read_main_store_settings"
  on public.store_settings for select to anon, authenticated
  using (id = 'main');

create policy "madu_admin_read_store_settings"
  on public.store_settings for select to authenticated
  using ((select private.is_store_admin()));

create policy "madu_admin_insert_store_settings"
  on public.store_settings for insert to authenticated
  with check ((select private.is_store_admin()));

create policy "madu_admin_update_store_settings"
  on public.store_settings for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));

create policy "madu_admin_only_insert_store_settings"
  on public.store_settings as restrictive for insert to authenticated
  with check ((select private.is_store_admin()));

create policy "madu_admin_only_update_store_settings"
  on public.store_settings as restrictive for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));

notify pgrst, 'reload schema';