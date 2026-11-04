import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type AdminPageId =
  | 'dashboard'
  | 'produtos'
  | 'categorias'
  | 'pedidos'
  | 'clientes'
  | 'estoque'
  | 'financeiro'
  | 'configuracoes'
  | 'usuarios';

type NavItem = {
  id: AdminPageId;
  label: string;
  icon: LucideIcon;
};

type NavigationGroup = {
  title: string;
  items: NavItem[];
};

type MaduSidebarProps = {
  activePage: AdminPageId;
  onNavigate: (page: AdminPageId) => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onClose: () => void;
};

const navigationGroups: NavigationGroup[] = [
  {
    title: 'LOJA',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'produtos', label: 'Produtos', icon: Package },
      { id: 'pedidos', label: 'Pedidos', icon: ReceiptText },
      { id: 'estoque', label: 'Estoque e movimentações', icon: Package },
      { id: 'financeiro', label: 'Financeiro', icon: WalletCards },
    ],
  },
  {
    title: 'GESTÃO',
    items: [{ id: 'usuarios', label: 'Usuários e permissões', icon: ShieldCheck }],
  },
];

export function MaduSidebar({
  activePage,
  onNavigate,
  onLogout,
  mobileOpen,
  onClose,
}: MaduSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileOpen, onClose]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-[#2d1d25]/45 md:hidden"
        />
      )}

      <aside
        role={mobileOpen ? 'dialog' : undefined}
        aria-label="Navegação administrativa"
        aria-modal={mobileOpen || undefined}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(260px,calc(100vw-2rem))] flex-col bg-[#5d4454] pt-[env(safe-area-inset-top)] text-white shadow-[12px_0_35px_rgba(45,29,37,0.10)] transition-all duration-300 md:sticky md:top-0 md:z-20 md:h-screen md:w-[260px] md:shrink-0 ${
          collapsed ? 'md:w-[84px]' : 'md:w-[260px]'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div
          className={`flex h-[100px] shrink-0 items-center ${
            collapsed ? 'justify-center px-3' : 'justify-between px-5'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/assets/brand/madu-logo-transparent.png"
              alt="MADU"
              className="h-10 w-12 shrink-0 rounded-lg object-contain bg-white/10 p-1"
            />
            {!collapsed && (
              <div>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-white/55">
                  Painel administrativo
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            autoFocus={mobileOpen}
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-xl p-2 text-white/70 hover:bg-white/10 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {navigationGroups.map((group) => {
            const visibleItems = group.items;
            return (
            <div key={group.title}>
              {!collapsed && (
                <p className="mb-2 mt-5 px-3 text-[10px] font-bold tracking-[0.18em] text-white/45">
                  {group.title}
                </p>
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition-all duration-200 ${
                      active
                        ? 'bg-[#f8e9ef] font-semibold text-[#2d1d25] shadow-sm'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    } ${collapsed ? 'justify-center' : ''}`}
                  >
                    <Icon
                      size={19}
                      className={active ? 'text-[#8B5E7C]' : 'text-white/65'}
                    />
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
          <button
            type="button"
            title={collapsed ? 'Sair' : undefined}
            onClick={onLogout}
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/70 transition hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={18} />
            {!collapsed && <span>Sair</span>}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="hidden w-full items-center justify-center gap-2 rounded-xl py-3 text-xs text-white/65 transition hover:bg-white/10 hover:text-white md:flex"
          >
            {collapsed ? (
              <ChevronRight size={18} />
            ) : (
              <>
                <ChevronLeft size={18} />
                Recolher menu
              </>
            )}
          </button>
          <div className="px-3 py-2 text-center text-[10px] text-white/40">
            {!collapsed && 'MADU • Gestão da loja'}
          </div>
        </div>
      </aside>
    </>
  );
}
