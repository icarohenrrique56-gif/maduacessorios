import { describe, expect, it } from 'vitest';
import type { Order } from './orders';
import { summarizeFinance } from './finance';

function order(overrides: Partial<Order>): Order {
  return {
    id: crypto.randomUUID(),
    number: 'MADU-TEST',
    customer_name: 'Cliente',
    customer_phone: null,
    whatsapp_number: null,
    status: 'confirmed',
    payment_status: 'pending',
    subtotal_cents: 10000,
    processed_at: null,
    cancelled_at: null,
    returned_at: null,
    return_reason: null,
    created_at: '2026-10-31T12:00:00-03:00',
    total_cents: 10000,
    ...overrides,
  } as Order;
}

describe('financial summary', () => {
  it('separates paid, pending, cancelled and refunded values', () => {
    const result = summarizeFinance([
      order({ payment_status: 'paid', total_cents: 15000 }),
      order({ payment_status: 'pending', total_cents: 5000 }),
      order({ status: 'cancelled', cancelled_at: '2026-10-31T12:00:00-03:00', total_cents: 3000 }),
      order({ payment_status: 'refunded', returned_at: '2026-10-31T12:00:00-03:00', total_cents: 2000 }),
    ]);

    expect(result.sales).toBe(20000);
    expect(result.received).toBe(15000);
    expect(result.pending).toBe(5000);
    expect(result.cancelledValue).toBe(3000);
    expect(result.refunds).toBe(2000);
    expect(result.orderCount).toBe(2);
    expect(result.ticket).toBe(10000);
  });

  it('does not treat a newly created order as a sale', () => {
    const result = summarizeFinance([order({ status: 'pending', payment_status: 'pending' })]);
    expect(result.sales).toBe(0);
    expect(result.received).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.orderCount).toBe(0);
  });

  it('uses subtotal when an older order has total_cents at zero', () => {
    const result = summarizeFinance([
      order({ payment_status: 'paid', subtotal_cents: 7500, total_cents: 0 }),
    ]);
    expect(result.sales).toBe(7500);
    expect(result.received).toBe(7500);
    expect(result.orderCount).toBe(1);
    expect(result.ticket).toBe(7500);
  });
});
