begin;

select plan(9);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"iss":"http://127.0.0.1:54321/auth/v1","sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

insert into public.products(id, slug, name, category, price_cents, image, stock, is_active, variations)
values ('test-order-product', 'test-order-product', 'Produto de teste', 'Outros', 1000, '', 10, true, '{Dourado,Prata}');

insert into public.orders(id, number, status, subtotal_cents, total_cents)
values ('00000000-0000-4000-8000-000000000010', 'MADU-TEST-1', 'pending', 3000, 3000);

insert into public.order_items(order_id, product_id, name, product_name, variation, quantity, unit_price_cents, line_total_cents, total_cents, image_url)
values
  ('00000000-0000-4000-8000-000000000010', 'test-order-product', 'Produto de teste', 'Produto de teste', 'Dourado', 2, 1000, 2000, 2000, ''),
  ('00000000-0000-4000-8000-000000000010', 'test-order-product', 'Produto de teste', 'Produto de teste', 'Prata', 1, 1000, 1000, 1000, '');

select is((select stock from public.products where id = 'test-order-product'), 10, 'pedido pendente nao baixa estoque');
select public.confirm_order_sale('00000000-0000-4000-8000-000000000010');
select is((select stock from public.products where id = 'test-order-product'), 7, 'confirmacao baixa a soma das variacoes');
select is((select quantity from public.stock_movements where order_id = '00000000-0000-4000-8000-000000000010' and type = 'sale'), 3, 'confirmacao registra uma quantidade agregada');

select public.return_order_sale('00000000-0000-4000-8000-000000000010', 'Cliente cancelou a entrega');
select is((select stock from public.products where id = 'test-order-product'), 10, 'estorno devolve as unidades uma vez');
select is((select quantity from public.stock_movements where order_id = '00000000-0000-4000-8000-000000000010' and type = 'return'), 3, 'estorno registra uma quantidade agregada');
select throws_ok(
  $$select public.return_order_sale('00000000-0000-4000-8000-000000000010', 'Motivo repetido')$$,
  '22000',
  'Somente vendas confirmadas podem ser estornadas',
  'estorno repetido e bloqueado'
);

select public.quick_sale_stock_movement('test-order-product', 'Prata', 2, 'quick-sale-test-key');
select is((select stock from public.products where id = 'test-order-product'), 8, 'venda rapida reduz o saldo');
select public.quick_sale_stock_movement('test-order-product', 'Prata', 2, 'quick-sale-test-key');
select is((select stock from public.products where id = 'test-order-product'), 8, 'chave idempotente nao baixa duas vezes');
select is((select quantity from public.stock_movements where idempotency_key = 'quick-sale-test-key'), 2, 'venda rapida registra uma unica movimentacao');

reset role;
select * from finish();

rollback;
