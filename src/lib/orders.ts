import { supabase } from './supabase';

export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type OrderItem = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  variation: string | null;
  image_url: string;
  product_url: string | null;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};

export type Order = {
  id: string;
  number: string;
  customer_name: string | null;
  customer_phone: string | null;
  whatsapp_number: string | null;
  status: OrderStatus;
  subtotal_cents: number;
  processed_at: string | null;
  cancelled_at: string | null;
  returned_at: string | null;
  return_reason: string | null;
  created_at: string;
};

export type StockMovement = {
  id: string;
  product_id: string;
  order_id: string | null;
  type: 'entry' | 'sale' | 'return' | 'adjustment';
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  responsible_user_id: string | null;
  created_at: string;
};

export async function createWhatsAppOrder(input: {
  items: Array<{ product_id: string; quantity: number; variation?: string }>;
  customerName?: string;
  customerPhone?: string;
  idempotencyKey?: string;
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('create_whatsapp_order', {
    p_items: input.items,
    p_customer_name: input.customerName ?? null,
    p_customer_phone: input.customerPhone ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; number: string; subtotal_cents: number };
}

export async function getOrders(): Promise<Order[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderItem[];
}

export async function confirmOrder(orderId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('confirm_order_sale', { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function cancelOrder(orderId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function returnOrder(orderId: string, reason: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('return_order_sale', {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function getStockMovements(): Promise<Array<StockMovement & { products?: { name: string; sku: string | null; image: string } }>> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, products(name, sku, image)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function recordQuickSale(input: {
  productId: string;
  variation?: string;
  quantity: number;
  idempotencyKey: string;
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('quick_sale_stock_movement', {
    p_product_id: input.productId,
    p_variation: input.variation ?? null,
    p_quantity: input.quantity,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; quantity_before: number; quantity_after: number; idempotent: boolean };
}
