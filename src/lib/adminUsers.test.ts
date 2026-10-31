import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { listManagedUsers, revokeUserAccess } from './adminUsers';

const managedUser = {
  id: '60c9bb4a-7764-4a2a-a110-bb7decd914dd',
  email: 'admin@example.com',
  role: 'admin' as const,
  createdAt: '2026-10-29T00:00:00.000Z',
  lastSignInAt: null,
};

describe('admin user management API client', () => {
  beforeEach(() => mocks.invoke.mockReset());

  it('lists only users returned by the authenticated admin function', async () => {
    mocks.invoke.mockResolvedValue({ data: { users: [managedUser] }, error: null });

    await expect(listManagedUsers()).resolves.toEqual([managedUser]);
    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'list' },
    });
  });

  it('does not report success when the function rejects a last-admin revocation', async () => {
    const context = new Response(JSON.stringify({ error: 'At least one administrator must remain' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context },
    });

    await expect(revokeUserAccess(managedUser.id)).rejects.toThrow(
      'At least one administrator must remain',
    );
  });

  it('requires explicit confirmation from the function before treating a revocation as complete', async () => {
    mocks.invoke.mockResolvedValue({ data: { revoked: true, user: null }, error: null });

    await expect(revokeUserAccess(managedUser.id)).resolves.toBeUndefined();
    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'revoke', userId: managedUser.id },
    });
  });
});
