import { supabase } from './supabase';
import { clearPendingCheckout, getPendingCheckoutRecord } from './checkout-idempotency';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'received'
  | 'preparing'
  | 'shipped'
  | 'delivered';

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  sku: string | null;
  variation: string | null;
  image_url: string;
  product_url: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  total_cents: number;
};

export type Order = {
  id: string;
  number: string;
  customer_name: string | null;
  customer_phone: string | null;
  whatsapp_number: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal_cents: number;
  shipping_cents: number | null;
  total_cents: number;
  processed_at: string | null;
  cancelled_at: string | null;
  returned_at: string | null;
  return_reason: string | null;
  created_at: string;
};

export function getOrderItemsTotalCents(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.total_cents ?? item.line_total_cents ?? 0), 0);
}

export function getOrderTotalReview(order: Order, items: OrderItem[]) {
  const itemsTotalCents = getOrderItemsTotalCents(items);
  const shippingCents = Number(order.shipping_cents ?? 0);
  const subtotalCents = Number(order.subtotal_cents ?? 0);
  const totalCents = Number(order.total_cents ?? 0);
  const itemLinesConsistent = items.length > 0 && items.every((item) => {
    const unitTotal = Number(item.unit_price_cents) * Number(item.quantity);
    const lineTotal = Number(item.line_total_cents ?? unitTotal);
    const total = Number(item.total_cents ?? lineTotal);
    return lineTotal === unitTotal && total === unitTotal && total === lineTotal;
  });
  const headerConsistent = subtotalCents === itemsTotalCents
    && totalCents === subtotalCents + shippingCents;
  return {
    itemsTotalCents,
    shippingCents,
    subtotalCents,
    totalCents,
    needsReview: !itemLinesConsistent || !headerConsistent,
  };
}

export function canConfirmPendingOrder(order: Order, items: OrderItem[]): boolean {
  return order.status === 'pending' && !getOrderTotalReview(order, items).needsReview;
}

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
  unit_price_cents: number | null;
  total_price_cents: number | null;
  created_at: string;
};

export async function createWhatsAppOrder(input: {
  items: Array<{ product_id: string; quantity: number; variation?: string }>;
  customerName?: string;
  customerPhone?: string;
  idempotencyKey: string;
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke('create-whatsapp-order', {
    body: {
      items: input.items,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (error) {
    let message = error.message;
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      try {
        const payload = await response.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Mantém a mensagem tipada do erro se o corpo não for JSON.
      }
    }
    throw new Error(message);
  }
  if (!data || typeof data !== 'object') throw new Error('O checkout não retornou um pedido válido.');
  return data as { id: string; number: string; subtotal_cents: number };
}

export async function validateCartStock(
  items: Array<{ product_id: string; quantity: number; variation?: string }>,
  idempotencyKey?: string | null,
) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const signature = JSON.stringify(items.map((item) => ({
    id: item.product_id,
    quantity: item.quantity,
    variation: item.variation ?? null,
  })));
  const pendingCheckout = getPendingCheckoutRecord();
  const ownIdempotencyKey = idempotencyKey
    ?? (pendingCheckout?.signature === signature ? pendingCheckout.key : undefined);
  const releaseIdempotencyKey = pendingCheckout && pendingCheckout.signature !== signature
    ? pendingCheckout.key
    : undefined;
  const { data, error } = await supabase.functions.invoke('validate-cart-stock', {
    body: {
      items,
      idempotencyKey: ownIdempotencyKey,
      releaseIdempotencyKey,
    },
  });
  if (error) {
    let message = error.message;
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      try {
        const payload = await response.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Mantém a mensagem tipada do erro se o corpo não for JSON.
      }
    }
    throw new Error(message);
  }
  if (!data || typeof data !== 'object') throw new Error('A verificação de estoque não retornou um resultado válido.');
  const result = data as {
    available?: boolean;
    unavailable_product_ids?: unknown;
    reservation_release_attempted?: boolean;
  };
  if (result.reservation_release_attempted === true) clearPendingCheckout();
  return {
    available: result.available === true,
    unavailableProductIds: Array.isArray(result.unavailable_product_ids)
      ? result.unavailable_product_ids.filter((id): id is string => typeof id === 'string')
      : [],
  };
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

export async function getOrdersPage(input: {
  from: number;
  to: number;
  startDate?: string;
  endDate?: string;
}): Promise<{ orders: Order[]; count: number }> {
  if (!supabase) return { orders: [], count: 0 };
  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(input.from, input.to);

  if (input.startDate) query = query.gte('created_at', input.startDate);
  if (input.endDate) query = query.lt('created_at', input.endDate);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { orders: (data ?? []) as Order[], count: count ?? 0 };
}

export async function collectAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ items: T[]; count: number }>,
  pageSize = 500,
): Promise<T[]> {
  const requestedSize = Number.isFinite(pageSize) ? Math.floor(pageSize) : 500;
  const size = Math.min(500, Math.max(1, requestedSize));
  const items: T[] = [];
  let from = 0;
  let expectedCount = Number.POSITIVE_INFINITY;

  while (items.length < expectedCount) {
    const page = await fetchPage(from, from + size - 1);
    expectedCount = page.count;
    if (page.items.length === 0) break;
    items.push(...page.items);
    from += page.items.length;
    if (page.items.length < size) break;
  }

  return items;
}

export async function getOrdersInRange(input: {
  startDate: string;
  endDate: string;
  pageSize?: number;
}): Promise<Order[]> {
  const requestEnd = new Date().toISOString();
  const endDate = input.endDate < requestEnd ? input.endDate : requestEnd;
  const orders = await collectAllPages<Order>(async (from, to) => {
    const page = await getOrdersPage({
      from,
      to,
      startDate: input.startDate,
      endDate,
    });
    return { items: page.orders, count: page.count };
  }, input.pageSize ?? 500);
  return orders;
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

export async function getOrderItemsByIds(orderIds: string[]): Promise<OrderItem[]> {
  if (!supabase || orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', orderIds)
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

export async function getStockMovements(): Promise<Array<StockMovement & {
  products?: {
    name: string;
    sku: string | null;
    image: string;
    price_cents: number | null;
      sale_price_cents: number | null;
  };
}>> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, products(name, sku, image, price_cents, sale_price_cents)')
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

export async function getStockMovementByIdempotencyKey(key: string): Promise<StockMovement | null> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as StockMovement | null;
}

export async function resetStockMovementHistory(): Promise<number> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('reset_stock_movements_history');
  if (error) throw new Error(error.message);
  return Number((data as { deleted?: number } | null)?.deleted ?? 0);
}

export async function setProductStock(input: {
  productId: string;
  stock: number;
  expectedStock: number;
  reason?: string;
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('set_product_stock', {
    p_product_id: input.productId,
    p_stock: input.stock,
    p_reason: input.reason ?? null,
    p_expected_stock: input.expectedStock,
  });
  if (error) throw new Error(error.message);
}

export async function adjustProductStock(input: {
  productId: string;
  delta: number;
  idempotencyKey: string;
  reason?: string;
}) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('adjust_product_stock', {
    p_product_id: input.productId,
    p_delta: input.delta,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; stock: number; quantity_before: number };
}
