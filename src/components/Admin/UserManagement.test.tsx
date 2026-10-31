import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManagement } from './UserManagement';

const mocks = vi.hoisted(() => ({
  revokeUserAccess: vi.fn(),
  listManagedUsers: vi.fn(),
  refreshRole: vi.fn(),
  refreshSession: vi.fn(),
  developmentAdminOverride: false,
}));

vi.mock('../../lib/adminUsers', () => mocks);
vi.mock('../../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({
    user: { id: 'admin-id' },
    developmentAdminOverride: mocks.developmentAdminOverride,
    refreshRole: mocks.refreshRole,
    refreshSession: mocks.refreshSession,
  }),
}));

const otherAdmin = {
  id: 'other-admin-id',
  email: 'admin@example.com',
  role: 'admin' as const,
  createdAt: '2026-10-30T00:00:00.000Z',
  lastSignInAt: null,
};

describe('admin user access management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listManagedUsers.mockResolvedValue([otherAdmin]);
    mocks.revokeUserAccess.mockResolvedValue(undefined);
    mocks.developmentAdminOverride = false;
  });

  afterEach(() => vi.restoreAllMocks());

  it('lists administrators without offering access grants or role selection', async () => {
    render(<UserManagement />);

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('Administradores autorizados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conceder acesso/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Perfil')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revogar' })).toBeInTheDocument();
  });

  it('revokes an existing administrator only after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }));

    await waitFor(() => {
      expect(mocks.revokeUserAccess).toHaveBeenCalledWith(otherAdmin.id);
      expect(screen.getByRole('status')).toHaveTextContent('Acesso revogado.');
    });
    expect(mocks.listManagedUsers).toHaveBeenCalledTimes(2);
  });

  it('shows server errors without reporting a successful revocation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.revokeUserAccess.mockRejectedValue(new Error('At least one administrator must remain'));
    render(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'At least one administrator must remain',
      );
    });
    expect(screen.queryByText('Acesso revogado.')).not.toBeInTheDocument();
  });

  it('does not offer revocation while local development grants universal admin access', async () => {
    mocks.developmentAdminOverride = true;
    render(<UserManagement />);

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText(/todas as contas autenticadas recebem acesso administrativo temporário/i))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revogar' })).toBeDisabled();
  });
});
