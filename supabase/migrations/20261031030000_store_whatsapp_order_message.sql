alter table public.store_settings
  add column if not exists whatsapp_order_message text not null default '';

update public.store_settings
set whatsapp_order_message = e'🌷 PEDIDO MADU\n\n🛍️ SEU PRODUTO\n\n{items}\n━━━━━━━━━━━━━━\n\n🧾 RESUMO\n\nPedido: {order_number}\n\nTOTAL: {subtotal}\n\n━━━━━━━━━━━━━━\n\n💬 Vamos confirmar a disponibilidade e combinar pagamento e entrega com você!\n\nObrigada por escolher a Madu! 🌷'
where id = 'main'
  and nullif(trim(whatsapp_order_message), '') is null;
