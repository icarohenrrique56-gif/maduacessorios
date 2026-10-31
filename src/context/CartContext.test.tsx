import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CartProvider, useCart } from './CartContext';
import type { Product } from '../data/mockProducts';

const catalogProduct: Product = {
  id: 'real-product',
  slug: 'real-product',
  name: 'Produto real',
  description: '',
  category: 'Brincos',
  price_cents: 5000,
  image: 'https://example.com/image.jpg',
  stock: 3,
};

function CartHarness() {
  const { items, addToCart, updateQuantity, removeItem, refreshFromCatalog } = useCart();

  return (
    <div>
      <button onClick={() => addToCart({
        id: catalogProduct.id,
        name: catalogProduct.name,
        image: catalogProduct.image,
        unitPrice: catalogProduct.price_cents,
        variation: 'Dourado',
        availableStock: catalogProduct.stock,
        quantity: 2,
      })}>
        Adicionar dourado
      </button>
      <button onClick={() => addToCart({
        id: catalogProduct.id,
        name: catalogProduct.name,
        image: catalogProduct.image,
        unitPrice: catalogProduct.price_cents,
        variation: 'Prata',
        availableStock: catalogProduct.stock,
        quantity: 1,
      })}>
        Adicionar prata
      </button>
      <button onClick={() => updateQuantity(catalogProduct.id, 'Dourado', 1)}>Ajustar dourado</button>
      <button onClick={() => removeItem(catalogProduct.id, 'Dourado')}>Remover dourado</button>
      <button onClick={() => refreshFromCatalog([{ ...catalogProduct, name: 'Nome atualizado', price_cents: 6000 }])}>
        Atualizar catálogo
      </button>
      <output>{JSON.stringify(items)}</output>
    </div>
  );
}

describe('cart user data', () => {
  beforeEach(() => localStorage.clear());

  it('respects real product stock across variations and updates only the selected variation', () => {
    render(<CartProvider><CartHarness /></CartProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar dourado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar prata' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar prata' }));

    expect(screen.getByText(/\[\{"id":"real-product","name":"Produto real".*"quantity":2.*"variation":"Prata".*"quantity":1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar dourado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar catálogo' }));

    expect(screen.getByText(/Nome atualizado/)).toBeInTheDocument();
    expect(screen.getByText(/"unitPrice":6000/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover dourado' }));
    expect(screen.getByText(/\[\{"id":"real-product","name":"Nome atualizado".*?"variation":"Prata"/)).toBeInTheDocument();
  });
});
