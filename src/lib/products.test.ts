import { describe, expect, it } from 'vitest';
import {
  createProductFromForm,
  emptyProductForm,
  parsePriceToCents,
  validateProductImageFile,
  validateProductForm,
} from './products';

const validForm = {
  ...emptyProductForm,
  name: 'Brinco Árgola',
  category: 'Brincos',
  price: '89,90',
  stock: '3',
  image: 'https://example.com/brinco.jpg',
};

describe('product form helpers', () => {
  it.each([
    ['89,90', 8990],
    ['R$ 89,90', 8990],
    ['1.299,90', 129990],
    ['R$ 1.299,90', 129990],
    ['89.90', 8990],
    ['0', 0],
  ])('parses Brazilian price %s', (value, expected) => {
    expect(parsePriceToCents(value)).toBe(expected);
  });

  it.each(['', '-10,00', '89,999', '1.29,90', 'R$ abc', '1,299.90'])(
    'rejects invalid price %s',
    (value) => {
      expect(parsePriceToCents(value)).toBeNull();
    },
  );

  it('rejects a missing name and invalid prices without creating a product', () => {
    expect(validateProductForm({ ...validForm, name: '' }).name).toBe(
      'Informe o nome do produto.',
    );
    expect(validateProductForm({ ...validForm, price: 'inválido' }).price).toBeTruthy();
    expect(createProductFromForm({ ...validForm, price: 'inválido' }, 'uuid-1234')).toBeNull();
  });

  it('enforces a lower promotional price and a non-negative integer stock', () => {
    expect(
      validateProductForm({ ...validForm, salePrice: '89,90' }).salePrice,
    ).toBe('O preço promocional deve ser menor que o preço de venda.');
    expect(validateProductForm({ ...validForm, stock: '-1' }).stock).toBeTruthy();
    expect(validateProductForm({ ...validForm, stock: '1.5' }).stock).toBeTruthy();
  });

  it('accepts a selected image in place of a saved URL and validates image size and format', () => {
    const file = new File(['image'], 'brinco.webp', { type: 'image/webp' });
    const oversizedFile = new File(['image'], 'brinco.png', { type: 'image/png' });
    const maximumFile = new File(['image'], 'max.webp', { type: 'image/webp' });
    Object.defineProperty(maximumFile, 'size', { value: 10 * 1024 * 1024 });
    Object.defineProperty(oversizedFile, 'size', { value: 10 * 1024 * 1024 + 1 });

    expect(validateProductForm({ ...validForm, image: '' }, true).image).toBeUndefined();
    expect(createProductFromForm({ ...validForm, image: '' }, 'uuid-1234', true)?.image).toBe('');
    expect(validateProductImageFile(file)).toBeNull();
    expect(validateProductImageFile(maximumFile)).toBeNull();
    expect(validateProductImageFile(new File(['image'], 'brinco.gif', { type: 'image/gif' }))).toBe(
      'Selecione uma imagem JPG, PNG ou WebP.',
    );
    expect(validateProductImageFile(oversizedFile)).toBe('A imagem deve ter no máximo 10 MB.');
  });

  it('creates a normalized product with Brazilian prices and variations', () => {
    const product = createProductFromForm({
      ...validForm,
      price: '1.299,90',
      salePrice: '1.199,90',
      sku: 'br-001',
      variations: 'Dourado, Prata',
      featured: true,
      isActive: false,
    }, '12345678-0000');

    expect(product).toMatchObject({
      id: '12345678-0000',
      slug: 'brinco-argola-12345678',
      price_cents: 129990,
      sale_price_cents: 119990,
      sku: 'BR-001',
      variations: ['Dourado', 'Prata'],
      featured: true,
      is_active: false,
      stock: 3,
    });
  });
});
