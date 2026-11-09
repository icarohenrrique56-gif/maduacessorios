begin;

select plan(19);

select ok(
  not has_table_privilege('anon', 'public.products', 'SELECT'),
  'visitantes não consultam diretamente a tabela interna de produtos'
);
select ok(
  has_table_privilege('anon', 'public.storefront_products', 'SELECT'),
  'visitantes consultam a view segura da vitrine'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'storefront_products'
      and column_name in ('sku', 'stock')
  ),
  'a view pública não contém SKU nem quantidade exata em estoque'
);

select ok(
  not has_table_privilege('anon', 'public.orders', 'SELECT'),
  'visitantes não podem consultar pedidos diretamente'
);
select ok(
  not has_table_privilege('anon', 'public.order_stock_reservations', 'SELECT')
    and not has_table_privilege('authenticated', 'public.order_stock_reservations', 'SELECT'),
  'reservas de estoque não ficam visíveis para clientes nem visitantes'
);
select ok(
  not has_table_privilege('authenticated', 'public.orders', 'INSERT')
    and not has_table_privilege('authenticated', 'public.orders', 'UPDATE'),
  'usuários autenticados não escrevem pedidos diretamente'
);
select ok(
  not has_table_privilege('authenticated', 'public.order_items', 'INSERT')
    and not has_table_privilege('authenticated', 'public.order_items', 'UPDATE'),
  'usuários autenticados não escrevem itens de pedido diretamente'
);
select ok(
  not has_table_privilege('authenticated', 'public.stock_movements', 'INSERT')
    and not has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE'),
  'usuários autenticados não escrevem movimentos diretamente'
);
select ok(
  not has_column_privilege('authenticated', 'public.products', 'stock', 'UPDATE'),
  'saldo de produto não pode ser alterado por UPDATE direto'
);
select ok(
  not has_function_privilege(
    'anon', 'public.create_whatsapp_order(jsonb,text,text,text)'::regprocedure, 'EXECUTE'
  ),
  'o RPC de criação de pedido não pode ser chamado sem a Edge Function'
);
select ok(
  has_function_privilege(
    'service_role', 'public.create_whatsapp_order(jsonb,text,text,text)'::regprocedure, 'EXECUTE'
  ),
  'a Edge Function pode chamar o RPC de criação com service_role'
);
select ok(
  not has_function_privilege('anon', 'public.consume_whatsapp_order_rate_limit(text,integer)'::regprocedure, 'EXECUTE')
    and not has_function_privilege('anon', 'public.validate_cart_stock(jsonb,text)'::regprocedure, 'EXECUTE'),
  'o limitador de requisições não é público'
);
select ok(
  has_function_privilege('service_role', 'public.validate_cart_stock(jsonb,text)'::regprocedure, 'EXECUTE'),
  'a Edge Function pode verificar disponibilidade sem receber saldos'
);
select ok(
  not has_function_privilege('anon', 'public.release_whatsapp_order_reservation(text)'::regprocedure, 'EXECUTE')
    and has_function_privilege('service_role', 'public.release_whatsapp_order_reservation(text)'::regprocedure, 'EXECUTE'),
  'somente a Edge Function pode liberar uma reserva de checkout'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.adjust_product_stock(text,integer,text,text)'::regprocedure, 'EXECUTE'
  ),
  'administradores autenticados podem solicitar ajustes transacionais'
);
select ok(
  not has_function_privilege('anon', 'public.confirm_order_sale(uuid)'::regprocedure, 'EXECUTE'),
  'visitantes não podem confirmar pedidos'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_order_sale(uuid)'::regprocedure, 'EXECUTE'),
  'administradores autenticados podem confirmar pedidos pela RPC protegida'
);
select ok(
  not has_function_privilege('anon', 'public.cancel_order(uuid)'::regprocedure, 'EXECUTE'),
  'visitantes não podem cancelar pedidos'
);
select ok(
  has_function_privilege('authenticated', 'public.return_order_sale(uuid,text)'::regprocedure, 'EXECUTE'),
  'administradores autenticados podem estornar vendas pela RPC protegida'
);

select * from finish();
rollback;
