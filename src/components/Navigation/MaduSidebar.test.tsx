import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaduSidebar } from './MaduSidebar';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  navigate: vi.fn(),
  logout: vi.fn(),
}));

describe('admin mobile navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  it('opens as a dismissible dialog and closes on Escape', () => {
    render(
      <MaduSidebar
        activePage="usuarios"
        mobileOpen
        onNavigate={mocks.navigate}
        onLogout={mocks.logout}
        onClose={mocks.close}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Navegação administrativa' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('restores page scrolling after the mobile drawer closes', () => {
    const { rerender } = render(
      <MaduSidebar
        activePage="produtos"
        mobileOpen
        onNavigate={mocks.navigate}
        onLogout={mocks.logout}
        onClose={mocks.close}
      />,
    );

    rerender(
      <MaduSidebar
        activePage="produtos"
        mobileOpen={false}
        onNavigate={mocks.navigate}
        onLogout={mocks.logout}
        onClose={mocks.close}
      />,
    );

    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByRole('dialog', { name: 'Navegação administrativa' })).not.toBeInTheDocument();
  });

  it('shows the admin navigation items', () => {
    render(
      <MaduSidebar
        activePage="usuarios"
        mobileOpen
        onNavigate={mocks.navigate}
        onLogout={mocks.logout}
        onClose={mocks.close}
      />,
    );

    expect(screen.getByRole('button', { name: /usuários e permissões/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /produtos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pedidos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /estoque/i })).toBeInTheDocument();
  });
});
