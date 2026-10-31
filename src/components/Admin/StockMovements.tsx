import { useEffect, useState } from 'react';
import { getStockMovements, recordQuickSale, type StockMovement } from '../../lib/orders';
import { getProductsFromSupabase } from '../../lib/supabase';
import type { Product } from '../../data/mockProducts';

const labels = {
  entry: 'Entrada',
  sale: 'Saída por venda',
  return: 'Estorno',
  adjustment: 'Ajuste manual',
};

export function StockMovements() {
  const [movements, setMovements] = useState<Array<StockMovement & { products?: { name: string; sku: string | null; image: string } }>>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [variation, setVariation] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    void getStockMovements().then(setMovements).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o histórico.');
    });
  }

  useEffect(() => {
    void refresh();
    void getProductsFromSupabase(true).then(setProducts).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os produtos.');
    });
  }, []);

  const selectedProduct = products.find((product) => product.id === productId);

  async function handleQuickSale() {
    if (!productId || !quantity.trim()) return;
    const parsedQuantity = Number(quantity);
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError('Informe uma quantidade inteira maior que zero.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const idempotencyKey = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await recordQuickSale({ productId, variation: variation || undefined, quantity: parsedQuantity, idempotencyKey });
      setSuccess('Venda rápida registrada e estoque reduzido.');
      setVariation('');
      await Promise.all([
        refresh(),
        getProductsFromSupabase(true).then(setProducts),
      ]);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a venda rápida.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <p role="alert" className="mb-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      <div className="mb-5 rounded-[1.5rem] border border-[#f1dfe9] bg-[#fffafc] p-4">
        <h3 className="font-semibold text-[#2d1d25]">Venda rápida</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_auto]">
          <select value={productId} onChange={(event) => { setProductId(event.target.value); setVariation(''); }} className="min-h-11 rounded-full border border-[#efd7e7] bg-white px-4 text-sm">
            <option value="">Selecione o produto</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.stock} un.</option>)}
          </select>
          {selectedProduct?.variations?.length ? (
            <select value={variation} onChange={(event) => setVariation(event.target.value)} className="min-h-11 rounded-full border border-[#efd7e7] bg-white px-4 text-sm">
              <option value="">Variação (opcional)</option>
              {selectedProduct.variations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          ) : (
            <div className="min-h-11 flex items-center rounded-full border border-[#f1dfe9] bg-white px-4 text-sm text-[#76506a]">Sem variações</div>
          )}
          <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="min-h-11 rounded-full border border-[#efd7e7] bg-white px-4 text-sm" aria-label="Quantidade da venda rápida" />
          <button type="button" disabled={busy || !productId} onClick={() => void handleQuickSale()} className="min-h-11 rounded-full bg-[#8B5E7C] px-5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? 'Registrando...' : 'Registrar venda'}
          </button>
        </div>
        <p className="mt-3 text-xs text-[#76506a]">O saldo é validado no banco e a movimentação é registrada junto com a baixa.</p>
      </div>
      <div className="space-y-3">
        {movements.map((movement) => (
          <article key={movement.id} className="flex items-center gap-3 rounded-[1.5rem] border border-[#f1dfe9] bg-white p-3">
            {movement.products?.image ? (
              <img src={movement.products.image} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : <div className="h-14 w-14 rounded-xl bg-[#f8e9ef]" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#2d1d25]">{movement.products?.name ?? 'Produto removido'}</p>
              <p className="mt-1 text-xs text-[#76506a]">{movement.products?.sku ?? 'Sem código'} • {labels[movement.type]}</p>
              <p className="mt-1 text-xs text-[#76506a]">{movement.quantity_before} → {movement.quantity_after} • Movimentação: {movement.quantity}</p>
              {movement.reason && <p className="mt-1 text-xs text-[#76506a]">Motivo: {movement.reason}</p>}
            </div>
            <div className="text-right text-xs text-[#76506a]">
              <p>{new Date(movement.created_at).toLocaleString('pt-BR')}</p>
              {movement.order_id && <p className="mt-1 break-all">Pedido vinculado</p>}
            </div>
          </article>
        ))}
        {movements.length === 0 && !error && <p className="rounded-3xl border border-dashed border-[#d7b0c0] bg-white p-8 text-center text-sm text-[#76506a]">Nenhuma movimentação registrada.</p>}
      </div>
    </div>
  );
}
