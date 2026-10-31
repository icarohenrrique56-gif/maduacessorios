import { createClient } from '@supabase/supabase-js';
import { type Product } from '../data/mockProducts';
import { validateProductImageFile } from './products';

export const PRODUCT_IMAGES_BUCKET = 'product-images';
const viteUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  'https://dtxnspjwssuleoqxyvbx.supabase.co';
const viteKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)?.trim();
const supabaseUrl = viteUrl && viteUrl !== 'https://example.supabase.co' ? viteUrl : '';
const supabaseKey = viteKey && viteKey !== 'replace-with-public-publishable-key' ? viteKey : '';

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export function getSupabaseStatus() {
  if (!supabase) {
    return {
      enabled: false,
      message:
        'Supabase não configurado. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) antes do build ou do deploy.',
    };
  }

  return {
    enabled: true,
    message: '',
  };
}

function normalizeProduct(record: Record<string, unknown>): Product {
  return {
    id: String(record.id ?? record.slug ?? crypto.randomUUID()),
    slug: String(record.slug ?? String(record.name ?? 'produto').toLowerCase().replace(/\s+/g, '-')),
    name: String(record.name ?? 'Produto sem nome'),
    description: String(record.description ?? 'Descrição indisponível.'),
    category: String(record.category ?? 'Geral'),
    price_cents: Number(record.price_cents ?? 0),
    sale_price_cents:
      record.sale_price_cents !== undefined && record.sale_price_cents !== null
        ? Number(record.sale_price_cents)
        : undefined,
    sku: record.sku ? String(record.sku) : undefined,
    image: typeof record.image === 'string' ? record.image : '',
    featured: Boolean(record.featured),
    is_active: record.is_active !== false,
    stock: Number(record.stock ?? 0),
    variations: Array.isArray(record.variations)
      ? record.variations.map((variation) => String(variation))
      : [],
    material: typeof record.material === 'string' ? record.material : undefined,
    measurements: typeof record.measurements === 'string' ? record.measurements : undefined,
    characteristics: typeof record.characteristics === 'string' ? record.characteristics : undefined,
    care: typeof record.care === 'string' ? record.care : undefined,
    warranty: typeof record.warranty === 'string' ? record.warranty : undefined,
  };
}

function productPayload(product: Product) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: product.category,
    price_cents: product.price_cents,
    sale_price_cents: product.sale_price_cents ?? null,
    sku: product.sku ?? null,
    image: product.image,
    featured: product.featured ?? false,
    is_active: product.is_active ?? true,
    stock: product.stock,
    variations: product.variations ?? [],
    material: product.material ?? null,
    measurements: product.measurements ?? null,
    characteristics: product.characteristics ?? null,
    care: product.care ?? null,
    warranty: product.warranty ?? null,
  };
}

async function findDuplicateSku(product: Product, excludeProductId?: string): Promise<string | null> {
  if (!supabase || !product.sku) return null;

  let query = supabase.from('products').select('id').eq('sku', product.sku);
  if (excludeProductId) query = query.neq('id', excludeProductId);
  const { data: existingProduct, error } = await query.maybeSingle();

  if (error) return `Não foi possível validar o SKU: ${error.message}`;
  if (existingProduct) return `O SKU ${product.sku} já está cadastrado.`;
  return null;
}

export async function uploadProductImage(
  file: File,
  productId: string,
): Promise<{ ok: true; publicUrl: string } | { ok: false; reason: string }> {
  if (!supabase) {
    return { ok: false, reason: 'Credenciais do Supabase ausentes.' };
  }

  const validationError = validateProductImageFile(file);
  if (validationError) return { ok: false, reason: validationError };

  const extensionByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const path = `${productId}/${crypto.randomUUID()}.${extensionByMimeType[file.type]}`;
  const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET);
  const { error } = await bucket.upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });

  if (error) return { ok: false, reason: `Não foi possível enviar a imagem: ${error.message}` };

  const { data } = bucket.getPublicUrl(path);
  if (!data.publicUrl) {
    return { ok: false, reason: 'O Supabase não retornou a URL pública da imagem.' };
  }
  return { ok: true, publicUrl: data.publicUrl };
}

export async function getProductsFromSupabase(includeInactive = false): Promise<Product[]> {
  if (!supabase) {
    throw new Error('Supabase não configurado. Configure a URL e uma chave pública antes do build.');
  }

  let query = supabase.from('products').select('*');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Não foi possível carregar os produtos: ${error.message}`);
  }

  return (data ?? []).map((record) => normalizeProduct(record as Record<string, unknown>));
}

export async function saveProductToSupabase(
  product: Product,
): Promise<{ ok: true; product: Product } | { ok: false; reason: string }> {
  if (!supabase) {
    return {
      ok: false,
      reason: 'Credenciais do Supabase ausentes.',
    };
  }

  const skuError = await findDuplicateSku(product);
  if (skuError) {
    return { ok: false, reason: skuError };
  }

  const { data, error } = await supabase
    .from('products')
    .insert(productPayload(product))
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, reason: 'Já existe um produto com esse SKU ou identificador.' };
    }
    return {
      ok: false,
      reason: error.message,
    };
  }

  if (!data) {
    return { ok: false, reason: 'O Supabase não confirmou o produto cadastrado.' };
  }

  return { ok: true, product: normalizeProduct(data as Record<string, unknown>) };
}

export async function updateProductInSupabase(
  product: Product,
): Promise<{ ok: true; product: Product } | { ok: false; reason: string }> {
  if (!supabase) {
    return { ok: false, reason: 'Credenciais do Supabase ausentes.' };
  }

  const skuError = await findDuplicateSku(product, product.id);
  if (skuError) return { ok: false, reason: skuError };

  const payload = { ...productPayload(product) };
  delete (payload as { stock?: number }).stock;
  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', product.id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, reason: 'Já existe um produto com esse SKU ou identificador.' };
    }
    return { ok: false, reason: error.message };
  }
  if (!data) {
    return { ok: false, reason: 'O Supabase não confirmou a atualização do produto.' };
  }
  return { ok: true, product: normalizeProduct(data as Record<string, unknown>) };
}

export async function deleteProductFromSupabase(
  productId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!supabase) {
    return { ok: false, reason: 'Credenciais do Supabase ausentes.' };
  }

  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (data?.id !== productId) {
    return { ok: false, reason: 'O Supabase não confirmou a remoção do produto.' };
  }
  return { ok: true };
}
