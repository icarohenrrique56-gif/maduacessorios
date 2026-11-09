import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_IDEMPOTENCY_TTL_MS,
  clearPendingCheckout,
  getCheckoutIdempotencyKey,
  getExistingCheckoutIdempotencyKey,
  PENDING_CHECKOUT_STORAGE_KEY,
} from './checkout-idempotency';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('checkout idempotency storage', () => {
  it('reuses the same key for the same cart signature after a reload', () => {
    const storage = createMemoryStorage();
    const first = getCheckoutIdempotencyKey('[{"id":"p1","quantity":1}]', { storage, now: 10_000 });
    const afterReload = getCheckoutIdempotencyKey('[{"id":"p1","quantity":1}]', { storage, now: 11_000 });

    expect(afterReload).toBe(first);
  });

  it('reads an existing key only for its matching cart without creating one', () => {
    const storage = createMemoryStorage();
    const key = getCheckoutIdempotencyKey('cart-a', { storage, now: 10_000 });

    expect(getExistingCheckoutIdempotencyKey('cart-a', { storage, now: 11_000 })).toBe(key);
    expect(getExistingCheckoutIdempotencyKey('cart-b', { storage, now: 11_000 })).toBeNull();
  });

  it('creates a new key when the cart signature changes', () => {
    const storage = createMemoryStorage();
    const first = getCheckoutIdempotencyKey('cart-a', { storage, now: 10_000 });
    const second = getCheckoutIdempotencyKey('cart-b', { storage, now: 11_000 });

    expect(second).not.toBe(first);
    expect(JSON.parse(storage.getItem(PENDING_CHECKOUT_STORAGE_KEY) ?? '{}').signature).toBe('cart-b');
  });

  it('creates a new key when the stored checkout expires', () => {
    const storage = createMemoryStorage();
    const first = getCheckoutIdempotencyKey('cart-a', { storage, now: 10_000 });
    const second = getCheckoutIdempotencyKey('cart-a', {
      storage,
      now: 10_000 + CHECKOUT_IDEMPOTENCY_TTL_MS + 1,
    });

    expect(second).not.toBe(first);
  });

  it('discards malformed session data and supports clearing after dispatch', () => {
    const storage = createMemoryStorage();
    storage.setItem(PENDING_CHECKOUT_STORAGE_KEY, '{invalid json');
    const key = getCheckoutIdempotencyKey('cart-a', { storage, now: 10_000 });
    expect(key).toBeTruthy();

    clearPendingCheckout(storage);
    expect(storage.getItem(PENDING_CHECKOUT_STORAGE_KEY)).toBeNull();
  });
});
