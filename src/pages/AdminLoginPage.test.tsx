import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminLoginPage } from './AdminLoginPage';

const auth = vi.hoisted(() => ({
  user: null as { app_metadata: Record<string, unknown> } | null,
  role: null as 'admin' | null,
  permissionIssue: null as 'missing-profile' | 'unauthorized' | null,
  roleLoading: false,
  roleError: '',
  sessionNotice: '',
  configured: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
  sendPasswordReset: vi.fn(),
}));

vi.mock('../context/AdminAuthContext', () => ({
  useAdminAuth: () => auth,
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/admin/login']}>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<p>Painel protegido</p>} />
        <Route path="/admin/produtos" element={<p>Painel protegido</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('admin login page', () => {
  beforeEach(() => {
    auth.user = null;
    auth.role = null;
    auth.permissionIssue = null;
    auth.roleLoading = false;
    auth.roleError = '';
    auth.sessionNotice = '';
    auth.configured = true;
    auth.signIn.mockReset();
    auth.signOut.mockReset();
    auth.sendPasswordReset.mockReset();
  });

  it('authenticates with the supplied credentials and opens the admin route', async () => {
    auth.signIn.mockResolvedValue({ error: null, role: 'admin' });
    renderLogin();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' owner@example.com ' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('owner@example.com', 'secret'));
    expect(await screen.findByText('Painel protegido')).toBeInTheDocument();
  });

  it('shows an authentication error and stays on login', async () => {
    auth.signIn.mockResolvedValue({ error: 'Invalid login credentials', role: null });
    renderLogin();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O Supabase não aceitou as credenciais. Confira o e-mail e a senha',
    );
    expect(screen.queryByText('Painel protegido')).not.toBeInTheDocument();
  });

  it('does not render a login form for a signed-in non-admin account', () => {
    auth.user = { app_metadata: { role: 'customer' } };
    auth.role = null;
    renderLogin();

    expect(screen.getByText(
      'Esta conta não tem autorização para acessar o painel da MADU neste ambiente.',
    )).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
  });

  it('does not navigate until authorization has completed', async () => {
    let resolveSignIn: ((result: { error: null; role: 'admin' }) => void) | undefined;
    auth.signIn.mockImplementation(() => new Promise((resolve) => {
      resolveSignIn = resolve;
    }));
    renderLogin();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.queryByText('Painel protegido')).not.toBeInTheDocument();
    resolveSignIn?.({ error: null, role: 'admin' });
    expect(await screen.findByText('Painel protegido')).toBeInTheDocument();
  });

  it('does not navigate when the authenticated account has no active permission', async () => {
    auth.signIn.mockResolvedValue({ error: null, role: null, permissionIssue: 'unauthorized' });
    renderLogin();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A autenticação foi concluída, mas esta conta não tem autorização para acessar o painel da MADU.',
    );
    expect(screen.queryByText('Painel protegido')).not.toBeInTheDocument();
  });

  it('shows a generic authorization error when authentication succeeds without production access', async () => {
    auth.signIn.mockResolvedValue({ error: null, role: null, permissionIssue: 'missing-profile' });
    renderLogin();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A autenticação foi concluída, mas esta conta não tem autorização para acessar o painel da MADU.',
    );
    expect(screen.queryByText('Painel protegido')).not.toBeInTheDocument();
  });
});
