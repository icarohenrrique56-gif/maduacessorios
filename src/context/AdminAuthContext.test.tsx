import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  emitAuth: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
      signInWithPassword: mocks.signInWithPassword,
      refreshSession: mocks.refreshSession,
      signOut: mocks.signOut,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  },
}));

const authenticatedUser = {
  id: 'auth-user-id',
  email: 'Owner@Example.com',
  app_metadata: {},
};

function Consumer() {
  const { role, roleError, permissionIssue, signIn } = useAdminAuth();
  return (
    <>
      <output data-testid="role">{role ?? 'none'}</output>
      <output data-testid="role-error">{roleError}</output>
      <output data-testid="permission-issue">{permissionIssue ?? 'none'}</output>
      <button type="button" onClick={() => mocks.emitAuth()}>Emit sign in</button>
      <button
        type="button"
        onClick={() => void signIn('owner@example.com', 'password').then((result) => {
          document.body.dataset.signInResult = `${result.error?.code ?? 'ok'}:${result.role ?? 'none'}:${result.permissionIssue ?? 'none'}`;
        })}
      >
        Sign in
      </button>
    </>
  );
}

function renderProvider() {
  return render(
    <AdminAuthProvider>
      <Consumer />
    </AdminAuthProvider>,
  );
}

describe('admin authorization context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
    delete document.body.dataset.signInResult;
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('queries the authenticated user id and requires active permission fields', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        user_id: authenticatedUser.id,
        role: 'admin',
        is_active: true,
        status: 'active',
      },
      error: null,
    });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      mocks.emitAuth.mockImplementation(() => callback('SIGNED_IN', { user: authenticatedUser }));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Emit sign in' }));

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
    expect(mocks.from).toHaveBeenCalledWith('admin_user_permissions');
    expect(mocks.select).toHaveBeenCalledWith('user_id, role, is_active, status');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', authenticatedUser.id);
    expect(mocks.eq.mock.calls.every((call) =>
      call.length === 2 && call[0] === 'user_id'
    )).toBe(true);
  });

  it('reports query errors separately from an account without permission', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      mocks.emitAuth.mockImplementation(() => callback('SIGNED_IN', { user: authenticatedUser }));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Emit sign in' }));

    await waitFor(() => expect(screen.getByTestId('role-error')).toHaveTextContent(
      'Não foi possível verificar as permissões: A autenticação foi concluída, mas não foi possível consultar a autorização no banco: permission denied',
    ));
    expect(screen.getByTestId('role')).toHaveTextContent('none');
  });

  it('waits for the database authorization result before completing login', async () => {
    let finishPermissionQuery: ((result: {
      data: {
        user_id: string;
        role: string;
        is_active: boolean;
        status: string;
      };
      error: null;
    }) => void) | undefined;
    const confirmedAdmin = {
      ...authenticatedUser,
      email_confirmed_at: '2026-10-29T12:00:00.000Z',
      app_metadata: { role: 'admin' },
    };
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: confirmedAdmin, session: { user: confirmedAdmin } },
      error: null,
    });
    mocks.maybeSingle.mockImplementation(() => new Promise((resolve) => {
      finishPermissionQuery = resolve;
    }));
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalled());
    expect(document.body.dataset.signInResult).toBeUndefined();
    finishPermissionQuery?.({
      data: {
        user_id: confirmedAdmin.id,
        role: 'admin',
        is_active: true,
        status: 'active',
      },
      error: null,
    });
    await waitFor(() => expect(document.body.dataset.signInResult).toBe('ok:admin:none'));
  });

  it('distinguishes a missing profile from a profile without active panel permission', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: authenticatedUser, session: { user: authenticatedUser } },
      error: null,
    });
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(document.body.dataset.signInResult).toBe('ok:none:missing-profile'));
    expect(screen.getByTestId('permission-issue')).toHaveTextContent('missing-profile');
  });

  it('does not trust an admin claim without a corresponding database permission', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: { ...authenticatedUser, app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } },
        session: {
          user: { ...authenticatedUser, app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } },
        },
      },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        user_id: authenticatedUser.id,
        role: 'admin',
        is_active: false,
        status: 'inactive',
      },
      error: null,
    });
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(document.body.dataset.signInResult).toBe('ok:none:unauthorized'));
  });

  it('grants local Supabase users admin access without creating permission records', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('DEV', true);
    const accessToken = `header.${btoa(JSON.stringify({
      iss: 'http://127.0.0.1:54321/auth/v1',
    })).replace(/=/g, '')}.signature`;
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          user: authenticatedUser,
          access_token: accessToken,
        },
      },
      error: null,
    });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('grants local-authenticated users admin access in the isolated test mode', async () => {
    vi.stubEnv('MODE', 'test');
    const accessToken = `header.${btoa(JSON.stringify({
      iss: 'http://127.0.0.1:54321/auth/v1',
    })).replace(/=/g, '')}.signature`;
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: authenticatedUser,
        session: { user: authenticatedUser, access_token: accessToken },
      },
      error: null,
    });
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(document.body.dataset.signInResult).toBe('ok:admin:none'));
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
