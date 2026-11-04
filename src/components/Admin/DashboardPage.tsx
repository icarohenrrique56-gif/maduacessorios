import { useEffect, useMemo, useState } from 'react';
import { Package, ReceiptText, WalletCards } from 'lucide-react';
import { formatCurrency } from '../../lib/commerce';
import { summarizeFinance } from '../../lib/finance';
import {
  getOrders,
  getStockMovements,
  type Order,
  type StockMovement,
} from '../../lib/orders';
import type { Product } from '../../data/mockProducts';

type DashboardPageProps = {
  catalog: Product[];
  onNavigate: (page: 'pedidos' | 'estoque' | 'financeiro') => void;
};

const statusLabels: Record<Order['status'], string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  received: 'Recebido',
  preparing: 'Em preparação',
  shipped: 'Enviado',
  delivered: 'Entregue',
};

export function DashboardPage({ catalog, onNavigate }: DashboardPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [nextOrders, nextMovements] = await Promise.all([
        getOrders(),
        getStockMovements(),
      ]);
      setOrders(nextOrders);
      setMovements(nextMovements);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const summary = useMemo(() => summarizeFinance(orders), [orders]);
  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [orders],
  );
  const lowStock = useMemo(
    () => [...catalog].filter((product) => product.stock <= 3).sort((a, b) => a.stock - b.stock).slice(0, 5),
    [catalog],
  );
  const quickSalesCount = useMemo(
    () => movements.filter((movement) => movement.type === 'sale' && !movement.order_id).length,
    [movements],
  );

  const cards = [
    {
      label: 'Vendas confirmadas',
      value: formatCurrency(summary.sales),
      note: `${summary.orderCount} pedido${summary.orderCount === 1 ? '' : 's'} válido${summary.orderCount === 1 ? '' : 's'}`,
      action: 'financeiro' as const,
    },
    {
      label: 'Recebido',
      value: formatCurrency(summary.received),
      note: 'Pagamentos confirmados',
      action: 'financeiro' as const,
    },
    {
      label: 'Pendente',
      value: formatCurrency(summary.pending),
      note: 'Aguardando pagamento',
      action: 'pedidos' as const,
    },
    {
      label: 'Produtos com estoque baixo',
      value: String(lowStock.length),
      note: 'Até 3 unidades disponíveis',
      action: 'estoque' as const,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <button
            key={card.label}
            type="button"
            onClick={() => onNavigate(card.action)}
            className="min-w-0 rounded-3xl border border-[#f1dfe9] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#dec1d3] sm:p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8B5E7C]">{card.label}</span>
              {index === 3 ? <Package size={18} className="text-[#8B5E7C]" /> : index === 1 ? <WalletCards size={18} className="text-[#8B5E7C]" /> : <ReceiptText size={18} className="text-[#8B5E7C]" />}
            </div>
            <strong className="mt-4 block break-words text-2xl text-[#2d1d25]">{loading ? '...' : card.value}</strong>
            <span className="mt-1 block text-xs text-[#76506a]">{card.note}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-[#f1dfe9] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#8B5E7C]">Atividade comercial</p>
              <h2 className="mt-1 font-semibold text-[#2d1d25]">Pedidos recentes</h2>
            </div>
            <button type="button" onClick={() => onNavigate('pedidos')} className="min-h-11 rounded-full border border-[#efd7e7] px-4 text-sm text-[#76506a]">
              Ver pedidos
            </button>
          </div>
          {loading ? (
            <p className="py-6 text-sm text-[#76506a]">Carregando pedidos...</p>
          ) : recentOrders.length ? (
            <ul className="divide-y divide-[#f1dfe9]">
              {recentOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#2d1d25]">{order.number}</p>
                    <p className="mt-1 truncate text-xs text-[#76506a]">
                      {order.customer_name || 'Cliente não informado'} · {statusLabels[order.status]}
                    </p>
                  </div>
                  <strong className="shrink-0 text-sm text-[#2d1d25]">
                    {formatCurrency(summarySalesValue(order))}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-sm text-[#76506a]">Nenhum pedido registrado.</p>
          )}
        </section>

        <section className="rounded-3xl border border-[#f1dfe9] bg-white p-4 sm:p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#8B5E7C]">Operação</p>
          <h2 className="mt-1 font-semibold text-[#2d1d25]">Estoque e vendas rápidas</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#fffafc] p-3">
              <p className="text-xs text-[#76506a]">Saldo baixo</p>
              <strong className="mt-1 block text-xl">{loading ? '...' : lowStock.length}</strong>
            </div>
            <div className="rounded-2xl bg-[#fffafc] p-3">
              <p className="text-xs text-[#76506a]">Vendas rápidas</p>
              <strong className="mt-1 block text-xl">{loading ? '...' : quickSalesCount}</strong>
            </div>
          </div>
          <button type="button" onClick={() => onNavigate('estoque')} className="mt-4 min-h-11 w-full rounded-full border border-[#efd7e7] text-sm font-medium text-[#76506a]">
            Abrir estoque
          </button>
        </section>
      </div>
    </div>
  );
}

function summarySalesValue(order: Order) {
  const total = Number(order.total_cents);
  if (Number.isFinite(total) && total > 0) return total;
  const subtotal = Number(order.subtotal_cents);
  return Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
}
