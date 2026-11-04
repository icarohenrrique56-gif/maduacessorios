import { describe, expect, it } from 'vitest';
import {
  canConfirmPendingOrder,
  getOrderItemsTotalCents,
  getOrderTotalReview,
  type Order,
  type OrderItem,
} from './orders';

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    order_id: 'order-1',
    product_id: 'product-1',
    name: 'Brinco coração',
    sku: null,
    variation: null,
    image_url: '',
    product_url: null,
    quantity: 1,
    unit_price_cents: 1200,
    line_total_cents: 1200,
    total_cents: 1200,
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    number: 'MADU-TEST-000001',
    customer_name: null,
    customer_phone: null,
    whatsapp_number: null,
    status: 'pending',
    payment_status: 'pending',
    subtotal_cents: 1200,
    shipping_cents: 0,
    total_cents: 1200,
    processed_at: null,
    cancelled_at: null,
    returned_at: null,
    return_reason: null,
    created_at: '2026-11-03T00:00:00Z',
    ...overrides,
  };
}

describe('order total consistency', () => {
  it('calculates R$ 12,00 as subtotal and total for one item', () => {
    expect(getOrderItemsTotalCents([item()])).toBe(1200);
    expect(getOrderTotalReview(order(), [item()])).toMatchObject({
      itemsTotalCents: 1200,
      subtotalCents: 1200,
      totalCents: 1200,
      needsReview: false,
    });
  });

  it('includes registered shipping in the expected header total', () => {
    const review = getOrderTotalReview(
      order({ subtotal_cents: 1200, shipping_cents: 500, total_cents: 1700 }),
      [item()],
    );
    expect(review.needsReview).toBe(false);
    expect(review.itemsTotalCents + review.shippingCents).toBe(1700);
  });

  it('warns and blocks confirmation when the header diverges from items', () => {
    const divergent = order({ subtotal_cents: 0, total_cents: 0 });
    const review = getOrderTotalReview(divergent, [item()]);
    expect(review.needsReview).toBe(true);
    expect(canConfirmPendingOrder(divergent, [item()])).toBe(false);
  });

  it('blocks confirmation when item price fields disagree', () => {
    const badItem = item({ line_total_cents: 1200, total_cents: 900 });
    expect(getOrderTotalReview(order(), [badItem]).needsReview).toBe(true);
    expect(canConfirmPendingOrder(order(), [badItem])).toBe(false);
  });

  it('does not allow confirmation of a pending state with stock-changing actions', () => {
    expect(canConfirmPendingOrder(order({ status: 'pending' }), [item()])).toBe(true);
    expect(canConfirmPendingOrder(order({ status: 'confirmed' }), [item()])).toBe(false);
    expect(canConfirmPendingOrder(order({ status: 'cancelled' }), [item()])).toBe(false);
  });

  it('keeps consistent orders confirmable', () => {
    expect(canConfirmPendingOrder(order(), [item()])).toBe(true);
  });
});
