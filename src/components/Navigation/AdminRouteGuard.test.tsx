import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AdminRouteGuard } from './AdminRouteGuard';

const auth = vi.hoisted(() => ({
  user: null as { app_metadata: Record<string, unknown> } | null,
  role: null as 'admin' | null,
  loading: false,
  roleLoading: false,
  roleError: '',
}));

vi.mock('../../context/AdminAuthContext', () => ({
  useAdminAuth: () => auth,
}));

function CurrentPath() {
  const location = useLocation();
  return <p>rota: {location.pathname}</p>;
}

describe('admin route guard', () => {
  it('redirects an unauthenticated visitor away from the admin route', () => {
    auth.user = null;
    auth.role = null;
    auth.loading = false;

    render(
      <MemoryRouter initialEntries={['/admin/pedidos']}>
        <Routes>
          <Route path="/admin/*" element={<AdminRouteGuard><p>Painel</p></AdminRouteGuard>} />
          <Route path="/admin/login" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('rota: /admin/login')).toBeInTheDocument();
    expect(screen.queryByText('Painel')).not.toBeInTheDocument();
  });

  it('denies an authenticated account without an admin claim', () => {
    auth.user = { app_metadata: { role: 'customer' } };
    auth.role = null;

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminRouteGuard><p>Painel</p></AdminRouteGuard>} />
          <Route path="/admin/login" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('rota: /admin/login')).toBeInTheDocument();
    expect(screen.queryByText('Painel')).not.toBeInTheDocument();
  });

  it('allows an authenticated administrator', () => {
    auth.user = { app_metadata: { role: 'admin' } };
    auth.role = 'admin';

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminRouteGuard><p>Painel autorizado</p></AdminRouteGuard>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Painel autorizado')).toBeInTheDocument();
  });

  it('denies a legacy operator role after role removal', () => {
    auth.user = { app_metadata: { role: 'operator' } };
    auth.role = null;

    render(
      <MemoryRouter initialEntries={['/admin/produtos']}>
        <Routes>
          <Route path="/admin/*" element={<AdminRouteGuard><p>Painel autorizado</p></AdminRouteGuard>} />
          <Route path="/admin/login" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('rota: /admin/login')).toBeInTheDocument();
    expect(screen.queryByText('Painel autorizado')).not.toBeInTheDocument();
  });
});
