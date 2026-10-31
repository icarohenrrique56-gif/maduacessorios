alter table public.categories
  add column if not exists description text not null default '',
  add column if not exists image_url text not null default '',
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.categories
set description = coalesce(description, ''),
    image_url = coalesce(image_url, ''),
    is_active = coalesce(is_active, true),
    updated_at = now()
where true;

create index if not exists categories_active_position_idx
  on public.categories (is_active, position);

create or replace function public.touch_category_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at
before update on public.categories
for each row
execute function public.touch_category_updated_at();
