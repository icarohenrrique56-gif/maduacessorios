import { useEffect, useState } from 'react';
import { formatCurrency } from '../../lib/commerce';
import { getStockMovements, type StockMovement } from '../../lib/orders';

const labels = {
  entry: 'Entrada',
  sale: 'Saída por venda',
  return: 'Estorno',
  adjustment: 'Ajuste manual',
};

export function StockMovements() {
  const [movements, setMovements] = useState<Array<StockMovement & { products?: { name: string; sku: string | null; image: string } }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void getStockMovements().then(setMovements).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o histórico.');
    });
  }, []);

  return (
    <div>
      {error && <p role="alert" className="mb-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
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
