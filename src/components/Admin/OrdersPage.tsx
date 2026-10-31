import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import {
  cancelOrder,
  confirmOrder,
  getOrderItems,
  getOrders,
  returnOrder,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '../../lib/orders';
import { buildWhatsAppUrl, formatCurrency } from '../../lib/commerce';
import { useStoreSettings } from '../../context/StoreSettingsContext';

const filters: Array<{ id: 'all' | OrderStatus; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'confirmed', label: 'Confirmados' },
  { id: 'completed', label: 'Concluídos' },
  { id: 'cancelled', label: 'Cancelados' },
];

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Venda confirmada',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export function OrdersPage() {
  const { whatsappNumber } = useStoreSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({});
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');

  async function refresh() {
    setLoading(true);
    setActionError('');
    try {
      const result = await getOrders();
      setOrders(result);
      const entries = await Promise.all(result.map(async (order) => [order.id, await getOrderItems(order.id)] as const));
      setItemsByOrder(Object.fromEntries(entries));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível carregar os pedidos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visibleOrders = useMemo(
    () => orders.filter((order) => filter === 'all' || order.status === filter),
    [filter, orders],
  );
  const selected = orders.find((order) => order.id === selectedId) ?? null;

  async function runAction(orderId: string, action: 'confirm' | 'cancel' | 'return') {
    setBusyId(orderId);
    setActionError('');
    setActionMessage('');
    try {
      if (action === 'confirm') await confirmOrder(orderId);
      if (action === 'cancel') await cancelOrder(orderId);
      if (action === 'return') {
        if (!returnReason.trim()) throw new Error('Informe o motivo do estorno.');
        await returnOrder(orderId, returnReason.trim());
      }
      setActionMessage(action === 'confirm' ? 'Venda confirmada e estoque atualizado.' : action === 'cancel' ? 'Pedido cancelado.' : 'Estorno concluído.');
      setReturnReason('');
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível processar a ação.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`min-h-11 rounded-full px-4 text-sm ${filter === item.id ? 'bg-[#8B5E7C] text-white' : 'border border-[#efd7e7] bg-white text-[#76506a]'}`}>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#efd7e7] bg-white px-4 text-sm text-[#76506a]">
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {actionMessage && <p role="status" className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">{actionMessage}</p>}
      {actionError && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}

      {loading ? (
        <p className="rounded-3xl bg-white p-6 text-sm text-[#76506a]">Carregando pedidos...</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.75fr]">
          <div className="space-y-3">
            {visibleOrders.map((order) => {
              const firstItem = itemsByOrder[order.id]?.[0];
              return (
                <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className={`w-full rounded-[1.5rem] border p-3 text-left sm:p-4 ${selectedId === order.id ? 'border-[#8B5E7C] bg-[#fff5f9]' : 'border-[#f1dfe9] bg-white'}`}>
                  <div className="flex gap-3">
                    {firstItem?.image_url ? <img src={firstItem.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="h-16 w-16 rounded-xl bg-[#f8e9ef]" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#2d1d25]">{order.number}</p>
                        <span className="rounded-full bg-[#f8e9ef] px-2.5 py-1 text-xs text-[#76506a]">{statusLabels[order.status]}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-[#5d4454]">{firstItem?.name ?? 'Pedido sem itens'}</p>
                      <div className="mt-2 flex justify-between text-xs text-[#76506a]">
                        <span>{new Date(order.created_at).toLocaleString('pt-BR')}</span>
                        <span className="font-semibold text-[#2d1d25]">{formatCurrency(order.subtotal_cents)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {visibleOrders.length === 0 && <p className="rounded-3xl border border-dashed border-[#d7b0c0] bg-white p-8 text-center text-sm text-[#76506a]">Nenhum pedido neste filtro.</p>}
          </div>

          <aside className="rounded-[1.75rem] border border-[#f1dfe9] bg-white p-4 sm:p-5 lg:sticky lg:top-4 lg:self-start">
            {!selected ? (
              <p className="text-sm text-[#76506a]">Selecione um pedido para ver os detalhes.</p>
            ) : (
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#8B5E7C]">{selected.number}</p>
                <h2 className="mt-1 text-lg font-semibold text-[#2d1d25]">{statusLabels[selected.status]}</h2>
                <div className="mt-4 space-y-3">
                  {(itemsByOrder[selected.id] ?? []).map((item) => (
                    <div key={item.id} className="flex gap-3 border-b border-[#f1dfe9] pb-3">
                      <img src={item.image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium text-[#2d1d25]">{item.name}</p>
                        <p className="text-xs text-[#76506a]">{item.sku ?? 'Sem código'} • Qtd. {item.quantity}</p>
                        <p className="mt-1 text-xs text-[#76506a]">{formatCurrency(item.total_cents)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-between text-sm font-semibold">
                  <span>Total</span><span>{formatCurrency(selected.subtotal_cents)}</span>
                </div>
                {selected.customer_phone && (
                  <a href={buildWhatsAppUrl(selected.customer_phone, '')} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#efd7e7] text-sm text-[#76506a]">
                    <MessageCircle size={16} /> Abrir conversa
                  </a>
                )}
                {!selected.customer_phone && whatsappNumber && (
                  <a href={buildWhatsAppUrl(whatsappNumber, '')} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#efd7e7] text-sm text-[#76506a]">
                    <MessageCircle size={16} /> Conversa do cliente
                  </a>
                )}
                {selected.status === 'pending' && (
                  <div className="mt-5 space-y-2">
                    <button type="button" disabled={busyId === selected.id} onClick={() => void runAction(selected.id, 'confirm')} className="min-h-11 w-full rounded-full bg-[#8B5E7C] text-sm font-medium text-white disabled:opacity-60">
                      {busyId === selected.id ? 'Processando...' : 'Confirmar venda e dar baixa'}
                    </button>
                    <button type="button" disabled={busyId === selected.id} onClick={() => void runAction(selected.id, 'cancel')} className="min-h-11 w-full rounded-full border border-rose-200 text-sm text-rose-700 disabled:opacity-60">
                      Cancelar pedido
                    </button>
                  </div>
                )}
                {selected.status === 'confirmed' && (
                  <div className="mt-5 space-y-2">
                    <input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Motivo do estorno" className="min-h-11 w-full rounded-full border border-[#efd7e7] px-4 text-sm" />
                    <button type="button" disabled={busyId === selected.id || !returnReason.trim()} onClick={() => void runAction(selected.id, 'return')} className="min-h-11 w-full rounded-full border border-amber-300 text-sm text-amber-800 disabled:opacity-50">
                      Estornar venda
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
