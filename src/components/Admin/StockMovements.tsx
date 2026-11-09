import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { adjustProductStock, getStockMovementByIdempotencyKey, getStockMovements, getOrderItemsByIds, recordQuickSale, resetStockMovementHistory, setProductStock, type OrderItem, type StockMovement } from '../../lib/orders';
import { getProductsFromSupabase } from '../../lib/supabase';
import type { Product } from '../../data/mockProducts';
import { formatCurrency } from '../../lib/commerce';

const labels = {
  entry: 'Entrada',
  sale: 'Saída por venda',
  return: 'Estorno',
  adjustment: 'Ajuste manual',
};

export function StockMovements() {
  const [movements, setMovements] = useState<Array<StockMovement & {
    products?: { name: string; sku: string | null; image: string; price_cents: number | null; sale_price_cents: number | null };
  }>>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [variation, setVariation] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustStock, setAdjustStock] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustingProductId, setAdjustingProductId] = useState<string | null>(null);
  const quickSaleKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const adjustmentKeyRef = useRef<{ signature: string; key: string } | null>(null);

  async function refresh() {
    try {
      const nextMovements = await getStockMovements();
      setMovements(nextMovements);
      const orderIds = [...new Set(nextMovements.map((movement) => movement.order_id).filter((id): id is string => Boolean(id)))];
      setOrderItems(await getOrderItemsByIds(orderIds));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o histórico.');
    }
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
      const signature = JSON.stringify([productId, variation || null, parsedQuantity]);
      if (quickSaleKeyRef.current && quickSaleKeyRef.current.signature !== signature) {
        await getStockMovementByIdempotencyKey(quickSaleKeyRef.current.key);
        quickSaleKeyRef.current = null;
      }
      if (quickSaleKeyRef.current?.signature !== signature) {
        quickSaleKeyRef.current = {
          signature,
          key: typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      }
      const idempotencyKey = quickSaleKeyRef.current.key;
      await recordQuickSale({ productId, variation: variation || undefined, quantity: parsedQuantity, idempotencyKey });
      quickSaleKeyRef.current = null;
      setSuccess('Venda rápida registrada e estoque reduzido.');
      setVariation('');
      try {
        await Promise.all([
          refresh(),
          getProductsFromSupabase(true).then(setProducts),
        ]);
      } catch {
        setError('Venda registrada. Não foi possível atualizar o histórico; use Atualizar antes da próxima operação.');
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a venda rápida.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetHistory() {
    if (!window.confirm('Limpar todo o histórico de movimentações? Os pedidos, produtos e saldos atuais serão preservados.')) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const deleted = await resetStockMovementHistory();
      setSuccess(`${deleted} movimentação${deleted === 1 ? '' : 'ões'} removida${deleted === 1 ? '' : 's'} do histórico.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível limpar o histórico.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetStock() {
    const parsedStock = Number(adjustStock);
    if (!adjustProductId || !Number.isSafeInteger(parsedStock) || parsedStock < 0) {
      setError('Selecione o produto e informe um saldo inteiro igual ou maior que zero.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const currentProduct = products.find((product) => product.id === adjustProductId);
      if (!currentProduct) throw new Error('Produto não encontrado. Atualize a tela e tente novamente.');
      await setProductStock({
        productId: adjustProductId,
        stock: parsedStock,
        expectedStock: currentProduct.stock,
        reason: adjustReason || undefined,
      });
      setAdjustReason('');
      setSuccess('Saldo cadastrado atualizado e ajuste registrado.');
      await Promise.all([
        refresh(),
        getProductsFromSupabase(true).then(setProducts),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível ajustar o saldo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStepStock(product: Product, delta: 1 | -1) {
    if (delta < 0 && product.stock === 0) return;
    setAdjustingProductId(product.id);
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const signature = JSON.stringify([product.id, delta]);
      if (adjustmentKeyRef.current && adjustmentKeyRef.current.signature !== signature) {
        await getStockMovementByIdempotencyKey(adjustmentKeyRef.current.key);
        adjustmentKeyRef.current = null;
      }
      if (adjustmentKeyRef.current?.signature !== signature) {
        adjustmentKeyRef.current = {
          signature,
          key: typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      }
      const result = await adjustProductStock({
        productId: product.id,
        delta,
        idempotencyKey: adjustmentKeyRef.current.key,
        reason: delta > 0 ? 'Aumento manual em 1 unidade' : 'Redução manual em 1 unidade',
      });
      adjustmentKeyRef.current = null;
      setProducts((current) => current.map((item) => (
        item.id === product.id ? { ...item, stock: result.stock } : item
      )));
      setAdjustStock((current) => adjustProductId === product.id ? String(result.stock) : current);
      setSuccess(`${product.name}: saldo atualizado para ${result.stock} unidade${result.stock === 1 ? '' : 's'}.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar o saldo.');
    } finally {
      setAdjustingProductId(null);
      setBusy(false);
    }
  }

  const soldUnits = movements
    .filter((movement) => movement.type === 'sale')
    .reduce((sum, movement) => sum + movement.quantity, 0);

  const historicalPriceMissingCount = movements.filter((movement) => (
    movement.type === 'sale' && movementValue(movement) === null
  )).length;
  const soldValue = movements.reduce((sum, movement) => (
    sum + (movementValue(movement) ?? 0)
  ), 0);

  function movementValue(movement: StockMovement & {
    products?: { name: string; sku: string | null; image: string; price_cents: number | null; sale_price_cents: number | null };
  }): number | null {
    if (movement.type !== 'sale') return 0;
    if (movement.order_id) {
      const items = orderItems.filter((item) => (
        item.order_id === movement.order_id && item.product_id === movement.product_id
      ));
      if (items.length > 0) return items.reduce((sum, item) => sum + item.total_cents, 0);
      if (movement.total_price_cents != null) return movement.total_price_cents;
      return null;
    }
    if (movement.total_price_cents != null) return movement.total_price_cents;
    if (movement.unit_price_cents != null) return movement.quantity * movement.unit_price_cents;
    return null;
  }

  return (
    <div>
      {error && <p role="alert" className="mb-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-[1.5rem] border border-[#f1dfe9] bg-[#fffafc] p-4">
          <p className="text-xs text-[#76506a]">Unidades vendidas</p>
          <p className="mt-1 text-2xl font-semibold text-[#2d1d25]">{soldUnits}</p>
        </div>
        <div className="rounded-[1.5rem] border border-[#f1dfe9] bg-[#fffafc] p-4">
          <p className="text-xs text-[#76506a]">Valor vendido</p>
          <p className="mt-1 text-xl font-semibold text-[#2d1d25]">{formatCurrency(soldValue)}</p>
          {historicalPriceMissingCount > 0 && (
            <p className="mt-1 text-xs text-[#76506a]">
              {historicalPriceMissingCount} venda(s) antiga(s) sem preço histórico não foram somadas.
            </p>
          )}
        </div>
      </div>
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
      <div className="mb-5 grid gap-3 rounded-[1.5rem] border border-[#f1dfe9] bg-[#fffafc] p-4 lg:grid-cols-[1fr_130px_1fr_auto]">
        <div>
          <h3 className="font-semibold text-[#2d1d25]">Ajustar saldo cadastrado</h3>
          <p className="mt-1 text-xs text-[#76506a]">Define o saldo atual do produto sem alterar diretamente a tabela de produtos.</p>
        </div>
        <select
          value={adjustProductId}
          onChange={(event) => {
            const product = products.find((item) => item.id === event.target.value);
            setAdjustProductId(event.target.value);
            setAdjustStock(product ? String(product.stock) : '');
          }}
          className="min-h-11 rounded-full border border-[#efd7e7] bg-white px-4 text-sm"
        >
          <option value="">Produto</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <input
          type="number"
          min="0"
          step="1"
          value={adjustStock}
          onChange={(event) => setAdjustStock(event.target.value)}
          className="min-h-11 rounded-full border border-[#efd7e7] bg-white px-4 text-sm"
          aria-label="Novo saldo cadastrado"
          placeholder="Saldo"
        />
        <input
          value={adjustReason}
          onChange={(event) => setAdjustReason(event.target.value)}
          className="min-h-11 rounded-full border border-[#efd7e7] bg-white px-4 text-sm lg:col-start-3"
          aria-label="Motivo do ajuste"
          placeholder="Motivo opcional"
        />
        <button
          type="button"
          disabled={busy || !adjustProductId}
          onClick={() => void handleSetStock()}
          className="min-h-11 rounded-full bg-[#8B5E7C] px-5 text-sm font-medium text-white disabled:opacity-50 lg:col-start-4 lg:row-start-1"
        >
          Salvar saldo
        </button>
      </div>
      <div className="mb-5 rounded-[1.5rem] border border-[#f1dfe9] bg-[#fffafc] p-4">
        <div>
          <h3 className="font-semibold text-[#2d1d25]">Saldo por produto</h3>
          <p className="mt-1 text-xs text-[#76506a]">Use menos ou mais para alterar uma unidade por vez.</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {products.map((product) => {
            const isAdjusting = adjustingProductId === product.id;
            return (
              <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-[#f1dfe9] bg-white p-3">
                {product.image ? (
                  <img src={product.image} alt="" className="h-12 w-12 rounded-xl object-cover" />
                ) : <div className="h-12 w-12 rounded-xl bg-[#f8e9ef]" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#2d1d25]">{product.name}</p>
                  <p className="mt-1 text-xs text-[#76506a]">{product.stock} unidade{product.stock === 1 ? '' : 's'}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Diminuir saldo de ${product.name}`}
                  disabled={busy || product.stock <= 0}
                  onClick={() => void handleStepStock(product, -1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e8cbd9] text-[#76506a] disabled:opacity-40"
                >
                  <Minus size={18} />
                </button>
                <button
                  type="button"
                  aria-label={`Aumentar saldo de ${product.name}`}
                  disabled={busy}
                  onClick={() => void handleStepStock(product, 1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#8B5E7C] text-white disabled:opacity-50"
                >
                  {isAdjusting ? <span className="text-xs">...</span> : <Plus size={18} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mb-5 flex flex-col gap-3 rounded-[1.5rem] border border-rose-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-[#2d1d25]">Limpeza do histórico</h3>
          <p className="mt-1 text-xs text-[#76506a]">Remove apenas as movimentações registradas; pedidos, produtos e saldos são preservados.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleResetHistory()}
          className="min-h-11 rounded-full border border-rose-200 px-5 text-sm font-medium text-rose-700 disabled:opacity-50"
        >
          Limpar movimentações
        </button>
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
              {movement.type === 'sale' && (
                <p className="mt-1 font-semibold text-[#8B5E7C]">
                  {movementValue(movement) === null ? 'Valor não registrado' : formatCurrency(movementValue(movement) ?? 0)}
                </p>
              )}
              {movement.order_id && <p className="mt-1 break-all">Pedido vinculado</p>}
            </div>
          </article>
        ))}
        {movements.length === 0 && !error && <p className="rounded-3xl border border-dashed border-[#d7b0c0] bg-white p-8 text-center text-sm text-[#76506a]">Nenhuma movimentação registrada.</p>}
      </div>
    </div>
  );
}
