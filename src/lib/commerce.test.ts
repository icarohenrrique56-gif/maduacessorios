import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOrderWhatsAppMessage,
  buildWhatsAppMessage,
  fetchImageAsFile,
  formatCurrency,
  getCartSummary,
  prepareCartImageFiles,
  shareOrderImages,
} from './commerce';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('commerce helpers', () => {
  it('formats prices in Brazilian currency', () => {
    expect(formatCurrency(1990)).toBe('R$ 19,90');
    expect(formatCurrency(999)).toBe('R$ 9,99');
  });

  it('builds WhatsApp order message with product details', () => {
    const items = [
      {
        id: 'p1',
        name: 'Brinco Árgola Dourado',
        quantity: 2,
        unitPrice: 990,
        variation: 'Dourado',
        sku: 'BRI-001',
      },
    ];

    const message = buildWhatsAppMessage({
      items,
      customerName: 'Maria',
      notes: 'Entrega no bairro central.',
      storeName: 'MADU ACESSÓRIOS',
    });

    expect(message).toContain('Olá! Vim pelo site da MADU ACESSÓRIOS');
    expect(message).toContain('Produto: Brinco Árgola Dourado');
    expect(message).toContain('Variação: Dourado');
    expect(message).toContain('Quantidade total de unidades: 2');
    expect(message).toContain('Frete: a combinar pelo WhatsApp.');
  });

  it('calculates totals for cart items', () => {
    const summary = getCartSummary([
      { id: 'p1', quantity: 2, unitPrice: 990 },
      { id: 'p2', quantity: 1, unitPrice: 1490 },
    ]);

    expect(summary.totalUnits).toBe(3);
    expect(summary.subtotal).toBe(3470);
  });

  it('builds an organized registered-order WhatsApp message with product link and code', () => {
    const message = buildOrderWhatsAppMessage({
      orderNumber: 'MADU-20261030-000001',
      subtotal: 990,
      items: [{
        id: 'p1',
        name: 'Brinco Árgola Dourado',
        quantity: 1,
        unitPrice: 990,
        sku: 'BRI-001',
        link: 'https://madu.test/produto/brinco-argola-dourado',
      }],
    });

    expect(message).toContain('PEDIDO MADU');
    expect(message).toContain('Código: BRI-001');
    expect(message).toContain('Quantidade: 01');
    expect(message).toContain('Link: https://madu.test/produto/brinco-argola-dourado');
  });

  it('applies an administrator-customized order message template', () => {
    const message = buildOrderWhatsAppMessage({
      orderNumber: 'MADU-TEST-001',
      subtotal: 990,
      template: 'Olá Madu!\nPedido {order_number}\n{items}\nTotal {subtotal}',
      items: [{
        id: 'p1',
        name: 'Brinco de teste',
        quantity: 2,
        unitPrice: 495,
      }],
    });

    expect(message).toContain('Olá Madu!');
    expect(message).toContain('Pedido MADU-TEST-001');
    expect(message).toContain('Brinco de teste');
    expect(message).toContain('Quantidade: 02');
    expect(message).toContain('Total R$ 9,90');
  });

  it('downloads one real product photograph as a shareable File and reuses the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['real-image-data'], { type: 'image/jpeg' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchImageAsFile('https://madu.test/produto.jpg', 1);
    const second = await fetchImageAsFile('https://madu.test/produto.jpg', 1);

    expect(first?.name).toBe('madu-produto-1.jpg');
    expect(first?.type).toBe('image/jpeg');
    expect(second?.name).toBe('madu-produto-1.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prepares several distinct photographs without duplicate URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      blob: async () => new Blob([url], { type: 'image/webp' }),
    })));

    const files = await prepareCartImageFiles([
      'https://madu.test/a.webp',
      'https://madu.test/b.webp',
      'https://madu.test/a.webp',
    ]);

    expect(files).toHaveLength(2);
    expect(files.every((file) => file.type === 'image/webp')).toBe(true);
  });

  it('reports unsupported Web Share without blocking the WhatsApp fallback', async () => {
    vi.stubGlobal('navigator', {});
    await expect(shareOrderImages([], 'Pedido MADU')).resolves.toBe('unsupported');
  });
});
