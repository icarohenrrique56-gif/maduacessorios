-- Run only against the disposable Supabase local database.

insert into public.products (
  id, slug, name, description, category, price_cents, sale_price_cents,
  sku, image, is_active, stock, variations
)
values (
  'synthetic-e2e-12',
  'synthetic-e2e-12',
  'Produto E2E R$12',
  'Sintetico descartavel',
  'Teste',
  1200,
  null,
  'E2E-12',
  '',
  true,
  5,
  '{}'
)
on conflict (id) do update
set stock = 5,
    price_cents = 1200,
    sale_price_cents = 1200,
    is_active = true;

delete from public.order_items
where order_id in (
  select id
  from public.orders
  where idempotency_key = 'synthetic-e2e-key'
);

delete from public.orders
where idempotency_key = 'synthetic-e2e-key';

do $$
declare
  r1 jsonb;
  r2 jsonb;
begin
  select public.create_whatsapp_order(
    '[{"product_id":"synthetic-e2e-12","quantity":1}]'::jsonb,
    'Cliente Sintetico',
    '5511000000000',
    'synthetic-e2e-key'
  ) into r1;

  select public.create_whatsapp_order(
    '[{"product_id":"synthetic-e2e-12","quantity":1}]'::jsonb,
    'Cliente Sintetico',
    '5511000000000',
    'synthetic-e2e-key'
  ) into r2;

  if r1->>'id' <> r2->>'id' then
    raise exception 'Idempotency returned different IDs';
  end if;
  if coalesce((r1->>'idempotent')::boolean, false) then
    raise exception 'First call marked idempotent';
  end if;
  if not coalesce((r2->>'idempotent')::boolean, false) then
    raise exception 'Repeated call not marked idempotent';
  end if;
  if (select count(*) from public.orders where idempotency_key = 'synthetic-e2e-key') <> 1 then
    raise exception 'Duplicate order';
  end if;
  if (
    select count(*)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.idempotency_key = 'synthetic-e2e-key'
  ) <> 1 then
    raise exception 'Duplicate item';
  end if;
  if (select subtotal_cents from public.orders where idempotency_key = 'synthetic-e2e-key') <> 1200 then
    raise exception 'Subtotal not 1200';
  end if;
  if (select total_cents from public.orders where idempotency_key = 'synthetic-e2e-key') <> 1200 then
    raise exception 'Total not 1200';
  end if;
  if (select stock from public.products where id = 'synthetic-e2e-12') <> 5 then
    raise exception 'Pending order changed stock';
  end if;
end;
$$;

select
  o.number,
  o.status,
  o.subtotal_cents,
  o.shipping_cents,
  o.total_cents,
  count(i.*) as item_count,
  sum(i.total_cents) as item_total,
  (select stock from public.products where id = 'synthetic-e2e-12') as stock
from public.orders o
join public.order_items i on i.order_id = o.id
where o.idempotency_key = 'synthetic-e2e-key'
group by
  o.id,
  o.number,
  o.status,
  o.subtotal_cents,
  o.shipping_cents,
  o.total_cents;
