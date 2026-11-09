import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Product } from '../data/mockProducts';
import type { StorefrontProduct } from '../lib/supabase';

type CartCatalogProduct = Product | StorefrontProduct;

type CartItem = {
  id: string;
  name: string;
  image: string;
  quantity: number;
  unitPrice: number;
  variation?: string;
  sku?: string;
  availableStock?: number;
};

type CartContextValue = {
  items: CartItem[];
  addToCart: (product: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateQuantity: (id: string, variation: string | undefined, quantity: number) => void;
  removeItem: (id: string, variation?: string) => void;
  refreshFromCatalog: (products: CartCatalogProduct[]) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
};

const STORAGE_KEY = 'madu-cart';
const CartContext = createContext<CartContextValue | undefined>(undefined);

function isValidCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.name === 'string'
    && typeof item.image === 'string'
    && Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0
    && Number.isFinite(item.unitPrice) && Number(item.unitPrice) >= 0
    && (item.variation === undefined || typeof item.variation === 'string')
    && (item.sku === undefined || typeof item.sku === 'string')
    && (item.availableStock === undefined || (Number.isSafeInteger(item.availableStock) && Number(item.availableStock) >= 0));
}

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new TypeError('Formato inválido do carrinho');
    return parsed.filter(isValidCartItem);
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // O armazenamento do navegador pode estar indisponível; o carrinho começa vazio.
    }
    return [];
  }
}

export function getCartStockIssueIds(
  items: Array<Pick<CartItem, 'id' | 'quantity'>>,
  products: Array<Pick<Product, 'id' | 'stock'> | Pick<StorefrontProduct, 'id' | 'is_available'>>,
): Set<string> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.id, (quantities.get(item.id) ?? 0) + item.quantity);
  }
  const availabilityById = new Map(products.map((product) => [
    product.id,
    'stock' in product
      ? { isAvailable: product.stock > 0, stock: product.stock }
      : { isAvailable: product.is_available, stock: undefined },
  ]));
  return new Set(
    [...quantities.entries()]
      .filter(([id, quantity]) => {
        const availability = availabilityById.get(id);
        return !availability || !availability.isAvailable
          || (availability.stock !== undefined && quantity > availability.stock);
      })
      .map(([id]) => id),
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Falha de quota/permissão não deve derrubar a experiência de compra.
    }
  }, [items]);

  const addToCart = (product: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    setItems((current) => {
      const existing = current.find((item) => item.id === product.id && item.variation === product.variation);
      const currentProductQuantity = current
        .filter((item) => item.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      const remainingStock = product.availableStock === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, product.availableStock - currentProductQuantity);
      const requestedQuantity = Math.floor(product.quantity ?? 1);
      const quantity = Math.min(requestedQuantity, remainingStock);

      if (!Number.isSafeInteger(quantity) || quantity <= 0) return current;

      if (existing) {
        return current.map((item) =>
          item.id === product.id && item.variation === product.variation
            ? { ...item, ...product, quantity: item.quantity + quantity }
            : item,
        );
      }

      return [...current, { ...product, quantity }];
    });
  };

  const updateQuantity = (id: string, variation: string | undefined, quantity: number) => {
    setItems((current) => {
      const selected = current.find((item) => item.id === id && item.variation === variation);
      if (!selected) return current;
      const otherVariationQuantity = current
        .filter((item) => item.id === id && item.variation !== variation)
        .reduce((sum, item) => sum + item.quantity, 0);
      const limit = selected.availableStock === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, selected.availableStock - otherVariationQuantity);
      const safeQuantity = Math.min(limit, Math.max(0, Math.floor(quantity)));

      return current
        .map((item) => item.id === id && item.variation === variation
          ? { ...item, quantity: safeQuantity }
          : item)
        .filter((item) => item.quantity > 0);
    });
  };

  const removeItem = (id: string, variation?: string) => {
    setItems((current) => current.filter((item) => item.id !== id || item.variation !== variation));
  };

  const refreshFromCatalog = useCallback((catalog: CartCatalogProduct[]) => {
    const productsById = new Map(catalog.map((product) => [product.id, product]));
    setItems((current) => {
      let changed = false;
      const updatedItems = current.map((item) => {
        const product = productsById.get(item.id);
        if (!product) return item;
        const updatedItem = {
          ...item,
          name: product.name,
          image: product.image,
          unitPrice: product.sale_price_cents ?? product.price_cents,
          sku: 'sku' in product ? product.sku : undefined,
          availableStock: 'stock' in product ? product.stock : undefined,
        };
        if (
          updatedItem.name !== item.name
          || updatedItem.image !== item.image
          || updatedItem.unitPrice !== item.unitPrice
          || updatedItem.sku !== item.sku
          || updatedItem.availableStock !== item.availableStock
        ) changed = true;
        return updatedItem;
      });
      return changed ? updatedItems : current;
    });
  }, []);

  const clearCart = () => setItems([]);

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items]);

  return (
    <CartContext.Provider value={{ items, addToCart, updateQuantity, removeItem, refreshFromCatalog, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }

  return context;
}
