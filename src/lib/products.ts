import type { Product } from '../data/mockProducts';

export type ProductFormValues = {
  name: string;
  category: string;
  sku: string;
  description: string;
  price: string;
  salePrice: string;
  stock: string;
  image: string;
  variations: string;
  featured: boolean;
  isActive: boolean;
  material: string;
  measurements: string;
  characteristics: string;
  care: string;
  warranty: string;
};

export type ProductFormField = keyof ProductFormValues;
export type ProductFormErrors = Partial<Record<ProductFormField, string>>;

export const MAX_PRODUCT_IMAGE_SIZE = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const emptyProductForm: ProductFormValues = {
  name: '',
  category: '',
  sku: '',
  description: '',
  price: '',
  salePrice: '',
  stock: '',
  image: '',
  variations: '',
  featured: false,
  isActive: true,
  material: '',
  measurements: '',
  characteristics: '',
  care: '',
  warranty: '',
};

export function validateProductImageFile(file: File): string | null {
  if (!PRODUCT_IMAGE_MIME_TYPES.some((mimeType) => mimeType === file.type)) {
    return 'Selecione uma imagem JPG, PNG ou WebP.';
  }
  if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
    return 'A imagem deve ter no máximo 10 MB.';
  }
  return null;
}

export function parsePriceToCents(value: string): number | null {
  const cleaned = value.trim().replace(/^R\$\s*/i, '').trim();

  if (!cleaned) return null;

  let normalized: string;

  if (cleaned.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(cleaned)) return null;
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else if (/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    normalized = cleaned;
  } else {
    return null;
  }

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const cents = Number(wholePart) * 100 + Number(fractionalPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function validateProductForm(
  values: ProductFormValues,
  hasSelectedImage = false,
): ProductFormErrors {
  const errors: ProductFormErrors = {};
  const name = values.name.trim();

  if (!name) errors.name = 'Informe o nome do produto.';
  if (!values.category.trim()) {
    errors.category = 'Informe a categoria do produto.';
  }

  const priceCents = parsePriceToCents(values.price);
  if (priceCents === null) {
    errors.price = 'Informe um preço válido, como 89,90.';
  }

  if (values.salePrice.trim()) {
    const salePriceCents = parsePriceToCents(values.salePrice);
    if (salePriceCents === null) {
      errors.salePrice = 'Informe um preço promocional válido.';
    } else if (priceCents !== null && salePriceCents >= priceCents) {
      errors.salePrice = 'O preço promocional deve ser menor que o preço de venda.';
    }
  }

  if (!/^\d+$/.test(values.stock) || !Number.isSafeInteger(Number(values.stock))) {
    errors.stock = 'Informe uma quantidade inteira igual ou maior que zero.';
  }

  if (!values.image.trim() && !hasSelectedImage) {
    errors.image = 'Informe a URL da imagem do produto.';
  } else if (values.image.trim()) {
    try {
      const imageUrl = new URL(values.image.trim());
      if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') {
        errors.image = 'Use uma URL de imagem HTTP ou HTTPS.';
      }
    } catch {
      errors.image = 'Informe uma URL válida para a imagem.';
    }
  }

  if (values.sku.trim() && !/^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/.test(values.sku.trim())) {
    errors.sku = 'Use somente letras, números, ponto, hífen, barra ou sublinhado no SKU.';
  }

  return errors;
}

export function createProductFromForm(
  values: ProductFormValues,
  id: string = crypto.randomUUID(),
  hasSelectedImage = false,
): Product | null {
  if (Object.keys(validateProductForm(values, hasSelectedImage)).length > 0) return null;

  const name = values.name.trim();
  const slugBase = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const priceCents = parsePriceToCents(values.price);
  const salePriceCents = values.salePrice.trim()
    ? parsePriceToCents(values.salePrice)
    : null;

  if (priceCents === null || (values.salePrice.trim() && salePriceCents === null)) {
    return null;
  }

  return {
    id,
    slug: `${slugBase}-${id.slice(0, 8)}`,
    name,
    description: values.description.trim(),
    category: values.category,
    price_cents: priceCents,
    sale_price_cents: salePriceCents ?? undefined,
    sku: values.sku.trim() ? values.sku.trim().toUpperCase() : undefined,
    image: values.image.trim(),
    featured: values.featured,
    is_active: values.isActive,
    stock: Number(values.stock),
    variations: values.variations
      .split(',')
      .map((variation) => variation.trim())
      .filter(Boolean),
    material: values.material.trim() || undefined,
    measurements: values.measurements.trim() || undefined,
    characteristics: values.characteristics.trim() || undefined,
    care: values.care.trim() || undefined,
    warranty: values.warranty.trim() || undefined,
  };
}
