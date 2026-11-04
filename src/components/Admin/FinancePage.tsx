import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, WalletCards } from 'lucide-react';
import { getOrderItemsByIds, getOrdersPage, type Order, type OrderItem } from '../../lib/orders';
import { formatCurrency } from '../../lib/commerce';
import {
  getFinanceRange,
  groupDailySales,
  summarizeFinance,
  type FinancePeriod,
} from '../../lib/finance';

const periodOptions: Array<{ id: FinancePeriod; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'previous-month', label: 'Mês anterior' },
  { id: 'year', label: 'Este ano' },
  { id: 'custom', label: 'Personalizado' },
];

const orderStatusLabels: Record<string, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Venda confirmada',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  received: 'Recebido',
  preparing: 'Em preparação',
  shipped: 'Enviado',
  delivered: 'Entregue',
};

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`
}

export function FinancePage() {
  const [period, setPeriod] = useState<FinancePeriod>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'refunded' | 'cancelled'>('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const pageSize = 10;

  const range = getFinanceRange(period, customStart, customEnd);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const result = await getOrdersPage({
        from: 0,
        to: 499,
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
      });
      setOrders(result.orders);
      setTotalCount(result.count);
      setPage(0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os dados financeiros.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [period, customStart, customEnd]);

  const summary = useMemo(() => summarizeFinance(orders), [orders]);
  const daily = useMemo(() => groupDailySales(orders), [orders]);
  const maxDaily = Math.max(1, ...daily.map(([, value]) => value));

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch = !term || order.number?.toLowerCase().includes(term) || order.customer_name?.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'paid' && order.payment_status === 'paid') ||
        (statusFilter === 'pending' && order.payment_status === 'pending') ||
        (statusFilter === 'refunded' && (order.payment_status === 'refunded' || order.returned_at)) ||
        (statusFilter === 'cancelled' && (order.status === 'cancelled' || order.payment_status === 'cancelled'));
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const visibleOrders = filteredOrders.slice(page * pageSize, page * pageSize + pageSize);

  async function openDetails(order: Order) {
    setSelected(order);
    setSelectedItems([]);
    try {
      setSelectedItems(await getOrderItemsByIds([order.id]));
    } catch (itemError) {
      setError(itemError instanceof Error ? itemError.message : 'Não foi possível carregar os itens.');
    }
  }

  function exportCsv() {
    const header = [
      'Pedido',
      'Data',
      'Cliente',
      'Valor total',
      'Valor pago',
      'Valor pendente',
      'Forma de pagamento',
      'Status do pedido',
      'Status financeiro',
    ];
    const lines = filteredOrders.map((order) => {
      const isPaid = order.payment_status === 'paid';
      const isRefunded = order.payment_status === 'refunded' || Boolean(order.returned_at);
      const pending = !isPaid && !isRefunded && order.status !== 'cancelled' ? order.total_cents : 0;
      const financialStatus = isRefunded ? 'Reembolsado' : isPaid ? 'Pago' : order.status === 'cancelled' ? 'Cancelado' : 'Pendente';
      return [
        order.number,
        new Date(order.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        order.customer_name ?? '',
        order.total_cents / 100,
        isPaid ? order.total_cents / 100 : 0,
        pending / 100,
        'Não registrado',
        orderStatusLabels[order.status] ?? order.status,
        financialStatus,
      ];
    });
    const csv = '\ufeff' + [header, ...lines].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `madu-financeiro-${customStart || range.start.toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const cards = [
    { label: 'Total de vendas', value: formatCurrency(summary.sales) },
    { label: 'Recebido', value: formatCurrency(summary.received) },
    { label: 'Pendente', value: formatCurrency(summary.pending) },
    { label: 'Pedidos válidos', value: String(summary.orderCount) },
    { label: 'Ticket médio', value: formatCurrency(summary.ticket) },
    { label: 'Cancelado', value: formatCurrency(summary.cancelledValue) },
    { label: 'Reembolsado', value: formatCurrency(summary.refunds) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[#f1dfe9] bg-white p-3 sm:p-4">
        <div className="flex flex-wrap gap-2" aria-label="Período financeiro">
          {periodOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id)}
              className={`min-h-11 rounded-full px-3 text-sm ${period === option.id ? 'bg-[#8B5E7C] text-white' : 'border border-[#efd7e7] bg-[#fffafc] text-[#76506a]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#efd7e7] px-3 text-sm text-[#76506a]">
            <RefreshCw size={16} /> Atualizar
          </button>
          <button type="button" onClick={exportCsv} disabled={filteredOrders.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#8B5E7C] px-4 text-sm font-medium text-white disabled:opacity-50">
            <Download size={16} /> CSV
          </button>
        </div>
        {period === 'custom' && (
          <div className="flex w-full flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs text-[#76506a]">Início
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="min-h-11 rounded-xl border border-[#efd7e7] px-3 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#76506a]">Fim
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="min-h-11 rounded-xl border border-[#efd7e7] px-3 text-sm" />
            </label>
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      {loading ? (
        <p className="rounded-3xl border border-[#f1dfe9] bg-white p-6 text-sm text-[#76506a]">Calculando indicadores reais...</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((card) => (
              <article key={card.label} className="rounded-3xl border border-[#f1dfe9] bg-white p-4">
                <p className="text-xs text-[#76506a]">{card.label}</p>
                <p className="mt-2 break-words text-lg font-semibold text-[#2d1d25] sm:text-xl">{card.value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
            <article className="rounded-3xl border border-[#f1dfe9] bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div><p className="text-xs uppercase tracking-[.18em] text-[#8B5E7C]">Evolução</p><h2 className="mt-1 font-semibold">Vendas por dia</h2></div>
                <span className="text-xs text-[#76506a]">{range.label}</span>
              </div>
              {daily.length === 0 ? (
                <p className="mt-6 rounded-2xl bg-[#fffafc] py-10 text-center text-sm text-[#76506a]">Nenhuma venda válida no período.</p>
              ) : (
                <div className="mt-5 flex h-48 items-end gap-2 overflow-x-auto">
                  {daily.map(([day, value]) => (
                    <div key={day} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[10px] text-[#76506a]">{formatCurrency(value).replace('R$', '').trim()}</span>
                      <div className="w-full rounded-t-lg bg-[#b98298]" style={{ height: `${Math.max(4, (value / maxDaily) * 145)}px` }} title={`${day}: ${formatCurrency(value)}`} />
                      <span className="text-[10px] text-[#76506a]">{day.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-3xl border border-[#f1dfe9] bg-white p-4 sm:p-5">
              <p className="text-xs uppercase tracking-[.18em] text-[#8B5E7C]">Pagamento</p>
              <h2 className="mt-1 font-semibold">Status financeiro</h2>
              <div className="mt-4 space-y-3">
                {[
                  ['Pago', orders.filter((order) => order.payment_status === 'paid').length, '#8B5E7C'],
                  ['Pendente', orders.filter((order) => order.payment_status === 'pending').length, '#D7B0C0'],
                  ['Reembolsado', orders.filter((order) => order.payment_status === 'refunded' || order.returned_at).length, '#B98298'],
                  ['Cancelado', orders.filter((order) => order.status === 'cancelled' || order.payment_status === 'cancelled').length, '#76506A'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[#5d4454]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: String(color) }} />{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="mt-5 rounded-2xl bg-[#fffafc] p-3 text-xs leading-5 text-[#76506a]">Forma de pagamento não está registrada na estrutura atual dos pedidos.</p>
            </article>
          </section>

          <section className="rounded-3xl border border-[#f1dfe9] bg-white p-3 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs uppercase tracking-[.18em] text-[#8B5E7C]">Histórico</p><h2 className="mt-1 font-semibold">Pedidos financeiros</h2></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#76506a]" />
                  <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Pedido ou cliente" className="min-h-11 w-full rounded-full border border-[#efd7e7] pl-9 pr-3 text-sm sm:w-52" />
                </label>
                <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(0); }} className="min-h-11 rounded-full border border-[#efd7e7] px-3 text-sm">
                  <option value="all">Todos os status</option>
                  <option value="paid">Pagos</option>
                  <option value="pending">Pendentes</option>
                  <option value="refunded">Reembolsados</option>
                  <option value="cancelled">Cancelados</option>
                </select>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-[#fffafc] py-8 text-center text-sm text-[#76506a]">Nenhum pedido encontrado no período.</p>
            ) : (
              <>
                <div className="mt-4 space-y-2 md:hidden">
                  {visibleOrders.map((order) => (
                    <button key={order.id} type="button" onClick={() => void openDetails(order)} className="w-full rounded-2xl border border-[#f1dfe9] p-3 text-left">
                      <div className="flex justify-between gap-2"><strong>{order.number}</strong><span className="text-sm">{formatCurrency(order.total_cents)}</span></div>
                      <p className="mt-1 text-xs text-[#76506a]">{order.customer_name ?? 'Cliente não informado'} • {new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="min-w-[52rem] w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-[#76506a]"><tr><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Pago</th><th className="px-3 py-2">Pendente</th><th className="px-3 py-2">Status</th></tr></thead>
                    <tbody>
                      {visibleOrders.map((order) => {
                        const refunded = order.payment_status === 'refunded' || Boolean(order.returned_at);
                        const paid = order.payment_status === 'paid';
                        const pending = !paid && !refunded && order.status !== 'cancelled';
                        return (
                          <tr key={order.id} className="border-t border-[#f1dfe9]">
                            <td className="px-3 py-3"><button type="button" onClick={() => void openDetails(order)} className="font-semibold text-[#8B5E7C] underline-offset-2 hover:underline">{order.number}</button></td>
                            <td className="px-3 py-3">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                            <td className="px-3 py-3">{order.customer_name ?? '—'}</td>
                            <td className="px-3 py-3 font-medium">{formatCurrency(order.total_cents)}</td>
                            <td className="px-3 py-3">{paid ? formatCurrency(order.total_cents) : '—'}</td>
                            <td className="px-3 py-3">{pending ? formatCurrency(order.total_cents) : '—'}</td>
                            <td className="px-3 py-3">{refunded ? 'Reembolsado' : paid ? 'Pago' : order.status === 'cancelled' ? 'Cancelado' : 'Pendente'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-[#76506a]">
                  <span>{filteredOrders.length} registro(s)</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} className="min-h-11 rounded-full border border-[#efd7e7] px-3 disabled:opacity-40">Anterior</button>
                    <button type="button" onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} disabled={page >= totalPages - 1} className="min-h-11 rounded-full border border-[#efd7e7] px-3 disabled:opacity-40">Próxima</button>
                  </div>
                </div>
              </>
            )}
          </section>

          {totalCount > orders.length && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Exibidos os primeiros 500 pedidos do período. {totalCount} registros encontrados; para resultados completos, refine o período.
            </p>
          )}

          {selected && (
            <aside className="rounded-3xl border border-[#8B5E7C]/30 bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs uppercase tracking-[.18em] text-[#8B5E7C]">{selected.number}</p><h2 className="mt-1 font-semibold">Detalhes do pedido</h2></div>
                <button type="button" onClick={() => setSelected(null)} className="min-h-11 rounded-full border border-[#efd7e7] px-4 text-sm">Fechar</button>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <p><span className="text-[#76506a]">Cliente:</span> {selected.customer_name ?? 'Não informado'}</p>
                <p><span className="text-[#76506a]">Data:</span> {new Date(selected.created_at).toLocaleString('pt-BR')}</p>
                <p><span className="text-[#76506a]">Forma de pagamento:</span> Não registrada</p>
                <p><span className="text-[#76506a]">Status financeiro:</span> {selected.payment_status}</p>
              </div>
              {selectedItems.length > 0 && (
                <ul className="mt-4 divide-y divide-[#f1dfe9]">
                  {selectedItems.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 py-3 text-sm"><span>{item.name} × {item.quantity}</span><strong>{formatCurrency(item.total_cents)}</strong></li>
                  ))}
                </ul>
              )}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
