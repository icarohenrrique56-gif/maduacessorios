export const CHECKOUT_IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;
export const PENDING_CHECKOUT_STORAGE_KEY = 'madu-pending-checkout';

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type PendingCheckout = {
  signature: string;
  key: string;
  createdAt: number;
};

function browserSessionStorage(): SessionStorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readPendingCheckout(storage: SessionStorageLike, now: number): PendingCheckout | null {
  try {
    const raw = storage.getItem(PENDING_CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (typeof record.signature !== 'string'
      || typeof record.key !== 'string'
      || record.key.length < 1
      || record.key.length > 128
      || !Number.isSafeInteger(record.createdAt)
      || Number(record.createdAt) > now
      || now - Number(record.createdAt) > CHECKOUT_IDEMPOTENCY_TTL_MS) {
      return null;
    }
    return {
      signature: record.signature,
      key: record.key,
      createdAt: Number(record.createdAt),
    };
  } catch {
    return null;
  }
}

export function getCheckoutIdempotencyKey(
  signature: string,
  options: { storage?: SessionStorageLike | null; now?: number } = {},
): string {
  if (!signature) throw new Error('Assinatura do carrinho ausente.');
  const now = options.now ?? Date.now();
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  if (storage) {
    const pending = readPendingCheckout(storage, now);
    if (pending?.signature === signature) return pending.key;
  }

  const key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${now}-${Math.random().toString(36).slice(2)}`;
  if (storage) {
    try {
      storage.setItem(PENDING_CHECKOUT_STORAGE_KEY, JSON.stringify({ signature, key, createdAt: now }));
    } catch {
      // A falta de armazenamento de sessão não deve impedir o checkout desta aba.
    }
  }
  return key;
}

export function getExistingCheckoutIdempotencyKey(
  signature: string,
  options: { storage?: SessionStorageLike | null; now?: number } = {},
): string | null {
  if (!signature) return null;
  const now = options.now ?? Date.now();
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  if (!storage) return null;
  const pending = readPendingCheckout(storage, now);
  return pending?.signature === signature ? pending.key : null;
}

export function getPendingCheckoutRecord(
  options: { storage?: SessionStorageLike | null; now?: number } = {},
): { signature: string; key: string } | null {
  const now = options.now ?? Date.now();
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  if (!storage) return null;
  const pending = readPendingCheckout(storage, now);
  return pending ? { signature: pending.signature, key: pending.key } : null;
}

export function clearPendingCheckout(storage?: SessionStorageLike | null): void {
  const target = storage === undefined ? browserSessionStorage() : storage;
  try {
    target?.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
  } catch {
    // A falha de armazenamento não deve interromper a navegação ao WhatsApp.
  }
}
