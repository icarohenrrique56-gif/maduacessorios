import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../data/mockProducts';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  neq: vi.fn(),
  delete: vi.fn(),
  single: vi.fn(),
  order: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  })),
}));

let getProductsFromSupabase: typeof import('./supabase').getProductsFromSupabase;
let saveProductToSupabase: typeof import('./supabase').saveProductToSupabase;
let updateProductInSupabase: typeof import('./supabase').updateProductInSupabase;
let deleteProductFromSupabase: typeof import('./supabase').deleteProductFromSupabase;
let uploadProductImage: typeof import('./supabase').uploadProductImage;

const product: Product = {
  id: '12345678-0000-0000-0000-000000000000',
  slug: 'brinco-argola-12345678',
  name: 'Brinco Árgola',
  description: 'Peça dourada.',
  category: 'Brincos',
  price_cents: 129990,
  sale_price_cents: 119990,
  sku: 'BR-001',
  image: 'https://example.com/brinco.jpg',
  featured: true,
  is_active: true,
  stock: 3,
  variations: ['Dourado', 'Prata'],
};

describe('Supabase product persistence', () => {
  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://madu-test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.resetModules();
    const service = await import('./supabase');
    getProductsFromSupabase = service.getProductsFromSupabase;
    saveProductToSupabase = service.saveProductToSupabase;
    updateProductInSupabase = service.updateProductInSupabase;
    deleteProductFromSupabase = service.deleteProductFromSupabase;
    uploadProductImage = service.uploadProductImage;
  });

  beforeEach(() => {
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
      insert: mocks.insert,
      update: mocks.update,
      delete: mocks.delete,
      neq: mocks.neq,
      single: mocks.single,
      order: mocks.order,
    };

    vi.clearAllMocks();
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.insert.mockReturnValue(query);
    mocks.update.mockReturnValue(query);
    mocks.delete.mockReturnValue(query);
    mocks.neq.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      getPublicUrl: mocks.getPublicUrl,
    });
  });

  it('inserts the typed product and returns the confirmed database row', async () => {
    mocks.single.mockResolvedValue({ data: product, error: null });

    const result = await saveProductToSupabase(product);

    expect(result).toEqual({ ok: true, product });
    expect(mocks.from).toHaveBeenCalledWith('products');
    expect(mocks.insert).toHaveBeenCalledWith({
      ...product,
      sale_price_cents: 119990,
      sku: 'BR-001',
      is_active: true,
      material: null,
      measurements: null,
      characteristics: null,
      care: null,
      warranty: null,
    });
  });

  it('loads a minimized public product without SKU or exact stock', async () => {
    mocks.single.mockResolvedValue({ data: product, error: null });
    const saved = await saveProductToSupabase(product);
    expect(saved.ok).toBe(true);

    mocks.order.mockResolvedValue({ data: [{ ...product, is_available: true }], error: null });
    const catalog = await getProductsFromSupabase();
    expect(mocks.from).toHaveBeenLastCalledWith('storefront_products');
    expect(catalog[0]).toMatchObject({ id: product.id, name: product.name, is_available: true });
    expect('sku' in catalog[0]).toBe(false);
    expect('stock' in catalog[0]).toBe(false);
  });

  it('uses the internal products table only when admin catalog data is requested', async () => {
    mocks.order.mockResolvedValue({ data: [product], error: null });

    await expect(getProductsFromSupabase(true)).resolves.toMatchObject([product]);
    expect(mocks.from).toHaveBeenLastCalledWith('products');
  });

  it('updates an existing product without treating its own SKU as a duplicate', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.single.mockResolvedValue({ data: { ...product, name: 'Argola atualizada' }, error: null });

    const result = await updateProductInSupabase({ ...product, name: 'Argola atualizada' });

    expect(result).toEqual({ ok: true, product: { ...product, name: 'Argola atualizada' } });
    expect(mocks.neq).toHaveBeenCalledWith('id', product.id);
    const { stock: _stock, id: _id, ...productWithoutStock } = {
      ...product,
      name: 'Argola atualizada',
      sale_price_cents: 119990,
      sku: 'BR-001',
      is_active: true,
      material: null,
      measurements: null,
      characteristics: null,
      care: null,
      warranty: null,
    };
    expect(mocks.update).toHaveBeenCalledWith(productWithoutStock);
  });

  it('removes a product only after the database confirms its deletion', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: product.id }, error: null });

    await expect(deleteProductFromSupabase(product.id)).resolves.toEqual({ ok: true });
    expect(mocks.from).toHaveBeenCalledWith('products');
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith('id', product.id);
    expect(mocks.select).toHaveBeenCalledWith('id');
  });

  it('reports denied or unconfirmed product deletions without success', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    });
    await expect(deleteProductFromSupabase(product.id)).resolves.toEqual({
      ok: false,
      reason: 'permission denied',
    });

    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(deleteProductFromSupabase(product.id)).resolves.toEqual({
      ok: false,
      reason: 'O Supabase não confirmou a remoção do produto.',
    });
  });

  it('uploads allowed image files to a unique path and returns the public URL', async () => {
    const file = new File(['image'], 'brinco.webp', { type: 'image/webp' });
    mocks.upload.mockResolvedValue({ data: { path: 'product-id/random.webp' }, error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://madu-test.supabase.co/storage/v1/object/public/product-images/product-id/image.webp' },
    });

    const result = await uploadProductImage(file, 'product-id');
    const anotherResult = await uploadProductImage(file, 'product-id');

    expect(result).toMatchObject({
      ok: true,
      publicUrl: 'https://madu-test.supabase.co/storage/v1/object/public/product-images/product-id/image.webp',
    });
    expect(anotherResult.ok).toBe(true);
    expect(mocks.storageFrom).toHaveBeenCalledWith('product-images');
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    const firstPath = mocks.upload.mock.calls[0][0] as string;
    const secondPath = mocks.upload.mock.calls[1][0] as string;
    expect(firstPath).toMatch(/^product-id\/[0-9a-f-]+\.webp$/);
    expect(secondPath).not.toBe(firstPath);
    expect(mocks.upload).toHaveBeenCalledWith(firstPath, file, {
      cacheControl: '3600',
      contentType: 'image/webp',
      upsert: false,
    });
  });

  it('rejects invalid images and reports storage errors', async () => {
    const invalidFile = new File(['text'], 'document.txt', { type: 'text/plain' });
    expect(await uploadProductImage(invalidFile, product.id)).toEqual({
      ok: false,
      reason: 'Selecione uma imagem JPG, PNG ou WebP.',
    });
    expect(mocks.upload).not.toHaveBeenCalled();

    const oversizedFile = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversizedFile, 'size', { value: 5 * 1024 * 1024 + 1 });
    expect(await uploadProductImage(oversizedFile, product.id)).toEqual({
      ok: false,
      reason: 'A imagem deve ter no máximo 5 MB.',
    });
    expect(mocks.upload).not.toHaveBeenCalled();

    const image = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    mocks.upload.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });
    expect(await uploadProductImage(image, product.id)).toEqual({
      ok: false,
      reason: 'Não foi possível enviar a imagem: new row violates row-level security policy',
    });
  });

  it('rejects a duplicate SKU before inserting', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'existing-id' }, error: null });

    const result = await saveProductToSupabase(product);

    expect(result).toEqual({ ok: false, reason: 'O SKU BR-001 já está cadastrado.' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('surfaces database permission and connection failures without reporting success', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    });

    const duplicateCheckFailure = await saveProductToSupabase(product);
    expect(duplicateCheckFailure).toEqual({
      ok: false,
      reason: 'Não foi possível validar o SKU: permission denied',
    });

    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: 'network unavailable', code: 'FETCH_ERROR' },
    });

    const insertFailure = await saveProductToSupabase(product);
    expect(insertFailure).toEqual({ ok: false, reason: 'network unavailable' });
  });

  it('returns an empty remote catalog and surfaces read failures', async () => {
    mocks.order.mockResolvedValue({ data: [], error: null });
    await expect(getProductsFromSupabase()).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenLastCalledWith('storefront_products');

    vi.clearAllMocks();
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
      insert: mocks.insert,
      update: mocks.update,
      neq: mocks.neq,
      single: mocks.single,
      order: mocks.order,
    };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.order.mockResolvedValue({ data: [], error: null });
    await expect(getProductsFromSupabase(true)).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenLastCalledWith('products');
    expect(mocks.eq).not.toHaveBeenCalled();

    mocks.order.mockResolvedValue({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    });
    await expect(getProductsFromSupabase()).rejects.toThrow(
      'Não foi possível carregar os produtos: permission denied',
    );
  });
});
