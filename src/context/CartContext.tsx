import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Product } from '../data/mockProducts';

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
  refreshFromCatalog: (products: Product[]) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
};

const STORAGE_KEY = 'madu-cart';
const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
      const quantity = Math.min(product.quantity ?? 1, remainingStock);

      if (quantity <= 0) return current;

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
    setItems((current) =>
      current
        .map((item) => {
          if (item.id !== id || item.variation !== variation) return item;
          const limit = item.availableStock ?? Number.POSITIVE_INFINITY;
          return { ...item, quantity: Math.min(limit, Math.max(0, quantity)) };
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const removeItem = (id: string, variation?: string) => {
    setItems((current) => current.filter((item) => item.id !== id || item.variation !== variation));
  };

  const refreshFromCatalog = useCallback((catalog: Product[]) => {
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
        sku: product.sku,
        availableStock: product.stock,
      };
        if (
          updatedItem.name !== item.name ||
          updatedItem.image !== item.image ||
          updatedItem.unitPrice !== item.unitPrice ||
          updatedItem.sku !== item.sku ||
          updatedItem.availableStock !== item.availableStock
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
