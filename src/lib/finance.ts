import type { Order } from './orders';

export const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';

export type FinancePeriod =
  | 'today'
  | '7d'
  | 'month'
  | 'previous-month'
  | 'year'
  | 'custom';

export type FinanceRange = {
  start: Date;
  end: Date;
  label: string;
};

export function formatBrasiliaDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BRASILIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function brasiliaDateTime(dateKey: string, endOfDay = false) {
  const time = endOfDay ? 'T23:59:59.999-03:00' : 'T00:00:00.000-03:00';
  return new Date(`${dateKey}${time}`);
}

export function getFinanceRange(period: FinancePeriod, customStart = '', customEnd = ''): FinanceRange {
  const now = new Date();
  const todayKey = formatBrasiliaDate(now);
  const [year, month, day] = todayKey.split('-').map(Number);

  if (period === 'custom' && customStart && customEnd) {
    return {
      start: brasiliaDateTime(customStart),
      end: new Date(brasiliaDateTime(customEnd, true).getTime() + 1),
      label: `${customStart} a ${customEnd}`,
    };
  }
  if (period === '7d') {
    const start = new Date(brasiliaDateTime(todayKey));
    start.setUTCDate(start.getUTCDate() - 6);
    return { start, end: new Date(brasiliaDateTime(todayKey, true).getTime() + 1), label: 'Últimos 7 dias' };
  }
  if (period === 'month') {
    const startKey = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return { start: brasiliaDateTime(startKey), end: brasiliaDateTime(nextMonth), label: 'Este mês' };
  }
  if (period === 'previous-month') {
    const firstPrevious = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`;
    const firstCurrent = `${year}-${String(month).padStart(2, '0')}-01`;
    return { start: brasiliaDateTime(firstPrevious), end: brasiliaDateTime(firstCurrent), label: 'Mês anterior' };
  }
  if (period === 'year') {
    return { start: brasiliaDateTime(`${year}-01-01`), end: brasiliaDateTime(`${year + 1}-01-01`), label: 'Este ano' };
  }
  return { start: brasiliaDateTime(todayKey), end: new Date(brasiliaDateTime(todayKey, true).getTime() + 1), label: 'Hoje' };
}

export function isCommercialSale(order: Order) {
  if (order.status === 'cancelled' || order.payment_status === 'cancelled' || isRefundedOrder(order) || order.cancelled_at) return false;
  return ['confirmed', 'completed', 'preparing', 'shipped', 'delivered'].includes(order.status);
}

export function getOrderValueCents(order: Order) {
  const total = Number(order.total_cents);
  if (Number.isFinite(total) && total > 0) return total;
  const subtotal = Number(order.subtotal_cents);
  return Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
}

export function isPaidOrder(order: Order) {
  return isCommercialSale(order) && order.payment_status === 'paid';
}

export function isRefundedOrder(order: Order) {
  return order.returned_at !== null || order.payment_status === 'refunded';
}

export function isCancelledOrder(order: Order) {
  return !isRefundedOrder(order)
    && (order.status === 'cancelled' || order.payment_status === 'cancelled' || Boolean(order.cancelled_at));
}

export function summarizeFinance(orders: Order[]) {
  const valid = orders.filter(isCommercialSale);
  const paid = valid.filter(isPaidOrder);
  const refunded = orders.filter(isRefundedOrder);
  const cancelled = orders.filter(isCancelledOrder);
  const sales = valid.reduce((sum, order) => sum + getOrderValueCents(order), 0);
  const received = paid.reduce((sum, order) => sum + getOrderValueCents(order), 0);
  const refunds = refunded.reduce((sum, order) => sum + getOrderValueCents(order), 0);
  const pending = valid
    .filter((order) => order.payment_status === 'pending')
    .reduce((sum, order) => sum + getOrderValueCents(order), 0);
  const cancelledValue = cancelled.reduce((sum, order) => sum + getOrderValueCents(order), 0);

  return {
    sales,
    received,
    pending,
    orderCount: valid.length,
    ticket: valid.length ? Math.round(sales / valid.length) : 0,
    cancelledValue,
    refunds,
  };
}

export function groupDailySales(orders: Order[]) {
  const result = new Map<string, number>();
  for (const order of orders.filter(isCommercialSale)) {
    const key = formatBrasiliaDate(new Date(order.created_at));
    result.set(key, (result.get(key) ?? 0) + getOrderValueCents(order));
  }
  return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
}
