export type CartItemInput = {
  id: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  variation?: string;
  sku?: string;
  link?: string;
};

export function formatCurrency(value: number): string {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value / 100);

  return formatted.replace(/\u00A0/g, ' ');
}

export function getCartSummary(items: Array<{ id?: string; quantity: number; unitPrice: number }>) {
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return {
    totalUnits,
    subtotal,
  };
}

export function buildWhatsAppMessage({
  items,
  storeName,
  customerName,
  notes,
}: {
  items: CartItemInput[];
  storeName: string;
  customerName?: string;
  notes?: string;
}) {
  const summary = getCartSummary(items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })));

  const productLines = items
    .map((item) => {
      const itemSubtotal = item.quantity * item.unitPrice;
      return [
        'Produto: ' + (item.name ?? 'Produto'),
        item.variation ? `Variação: ${item.variation}` : 'Variação: não informado',
        `Quantidade: ${item.quantity}`,
        `Preço unitário: ${formatCurrency(item.unitPrice)}`,
        `Subtotal do item: ${formatCurrency(itemSubtotal)}`,
        '',
      ].join('\n');
    })
    .join('\n');

  const customerLine = customerName ? `Nome do cliente: ${customerName}\n` : '';
  const notesLine = notes ? `Observações: ${notes}\n` : 'Observações: nenhuma\n';

  return [
    'Olá! Vim pelo site da ' + storeName + ' e gostaria de fazer um pedido.',
    '',
    '*RESUMO DO MEU PEDIDO*',
    '',
    productLines,
    `*Quantidade total de unidades: ${summary.totalUnits}*`,
    '',
    `*Subtotal dos produtos: ${formatCurrency(summary.subtotal)}*`,
    '',
    'Frete: a combinar pelo WhatsApp.',
    'Pagamento: a combinar com a loja.',
    '',
    customerLine,
    notesLine,
    'Gostaria de confirmar a disponibilidade dos produtos e combinar a entrega e o pagamento.',
    '',
    'Obrigada!',
  ].join('\n');
}

export function buildWhatsAppUrl(number: string, message: string): string {
  const cleanNumber = number.replace(/\D/g, '');
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

export function buildOrderWhatsAppMessage({
  orderNumber,
  items,
  subtotal,
  template,
}: {
  orderNumber: string;
  items: CartItemInput[];
  subtotal: number;
  template?: string;
}) {
  const calculatedSubtotal = getCartSummary(items.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }))).subtotal;
  const itemLines = items.flatMap((item) => [
    '🛍️ SEU PRODUTO',
    '',
    item.name ?? 'Produto',
    `Quantidade: ${String(item.quantity).padStart(2, '0')}`,
    `Valor unitário: ${formatCurrency(item.unitPrice)}`,
    `Subtotal do item: ${item.quantity} × ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.quantity * item.unitPrice)}`,
    ...(item.variation ? [`Variação: ${item.variation}`] : []),
    ...(item.sku ? [`Código: ${item.sku}`] : []),
    ...(item.link ? [`Link: ${item.link}`] : []),
    '',
    '━━━━━━━━━━━━━━',
    '',
  ]);

  const defaultTemplate = [
    '🛍️ PEDIDO MADU',
    '',
    `Pedido: ${orderNumber}`,
    '',
    ...itemLines,
    '🧾 RESUMO',
    '',
    `TOTAL: ${formatCurrency(calculatedSubtotal || subtotal)}`,
    '',
    '━━━━━━━━━━━━━━',
    '',
    '💬 Vamos confirmar a disponibilidade e combinar pagamento e entrega com você!',
    '',
    'Obrigada por escolher a Madu! 🌷',
  ].join('\n');
  const itemBlock = items.map((item) => [
    item.name ?? 'Produto',
    `Quantidade: ${String(item.quantity).padStart(2, '0')}`,
    `Valor unitário: ${formatCurrency(item.unitPrice)}`,
    `Subtotal: ${item.quantity} × ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.quantity * item.unitPrice)}`,
    ...(item.variation ? [`Variação: ${item.variation}`] : []),
    ...(item.sku ? [`Código: ${item.sku}`] : []),
    ...(item.link ? [`Link: ${item.link}`] : []),
  ].join('\n')).join('\n\n━━━━━━━━━━━━━━\n\n');
  const selectedTemplate = template?.trim() || defaultTemplate;
  return selectedTemplate
    .split('{order_number}').join(orderNumber)
    .split('{subtotal}').join(formatCurrency(calculatedSubtotal || subtotal))
    .split('{items}').join(itemBlock);
}

export async function shareOrderImages(
  files: File[],
  text: string,
): Promise<'shared' | 'unsupported' | 'cancelled'> {
  if (!navigator.share || !navigator.canShare) return 'unsupported';
  try {
    const payload: ShareData = files.length > 0 ? { files, text } : { text };
    if (!navigator.canShare(payload)) return 'unsupported';
    await navigator.share(payload);
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

const imageFileCache = new Map<string, Promise<File | null>>();
const MAX_IMAGE_REQUESTS = 4;

export async function fetchImageAsFile(imageUrl: string, index: number): Promise<File | null> {
  const cached = imageFileCache.get(imageUrl);
  if (cached) return cached;

  const promise = downloadImageAsFile(imageUrl, index);
  imageFileCache.set(imageUrl, promise.then((file) => {
    if (!file) imageFileCache.delete(imageUrl);
    return file;
  }));
  return promise;
}

async function downloadImageAsFile(imageUrl: string, index: number): Promise<File | null> {
  try {
    performance.mark(`madu:image-fetch-start:${index}`);
    const response = await fetch(imageUrl, { mode: 'cors' });
    if (!response.ok) {
      performance.measure(`madu:image-fetch:${index}`, `madu:image-fetch-start:${index}`);
      return null;
    }
    const blob = await response.blob();
    const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const file = new File([blob], `madu-produto-${index}.${extension}`, {
      type: blob.type || 'image/jpeg',
    });
    performance.measure(`madu:image-fetch:${index}`, `madu:image-fetch-start:${index}`);
    performance.mark(`madu:image-convert-start:${index}`);
    performance.measure(`madu:image-convert:${index}`, `madu:image-convert-start:${index}`);
    return file;
  } catch {
    return null;
  }
}

export async function prepareCartImageFiles(
  imageUrls: string[],
): Promise<File[]> {
  const uniqueUrls = [...new Set(imageUrls.filter(Boolean))];
  const results = new Array<File | null>(uniqueUrls.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < uniqueUrls.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fetchImageAsFile(uniqueUrls[currentIndex], currentIndex + 1);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_IMAGE_REQUESTS, uniqueUrls.length) },
      () => worker(),
    ),
  );
  return results.filter((file): file is File => file !== null);
}

export function downloadImageFiles(files: File[]): void {
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
