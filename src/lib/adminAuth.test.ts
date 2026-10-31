import { describe, expect, it } from 'vitest';
import {
  getAdminLoginErrorMessage,
  hasDevelopmentAdminOverride,
  hasPanelAccess,
  parseAdminRole,
  resolveAdminPermission,
} from './adminAuth';

describe('admin authorization', () => {
  it('only enables automatic admin access for tests or tokens from the local Supabase Auth issuer', () => {
    const localAccessToken = `header.${btoa(JSON.stringify({
      iss: 'http://127.0.0.1:54321/auth/v1',
    })).replace(/=/g, '')}.signature`;
    const hostedAccessToken = `header.${btoa(JSON.stringify({
      iss: 'https://project.supabase.co/auth/v1',
    })).replace(/=/g, '')}.signature`;

    expect(hasDevelopmentAdminOverride(null, { MODE: 'test', DEV: false })).toBe(false);
    expect(hasDevelopmentAdminOverride(localAccessToken, { MODE: 'development', DEV: true })).toBe(true);
    expect(hasDevelopmentAdminOverride(localAccessToken, { MODE: 'test', DEV: false })).toBe(true);
    expect(hasDevelopmentAdminOverride(hostedAccessToken, { MODE: 'development', DEV: true })).toBe(false);
    expect(hasDevelopmentAdminOverride(localAccessToken, { MODE: 'production', DEV: false })).toBe(false);
    expect(hasDevelopmentAdminOverride('not-a-jwt', { MODE: 'development', DEV: true })).toBe(false);
  });

  it('recognizes only database-backed administrator roles', () => {
    expect(parseAdminRole('admin')).toBe('admin');
    expect(parseAdminRole('operator')).toBeNull();
    expect(parseAdminRole('customer')).toBeNull();
    expect(hasPanelAccess('admin')).toBe(true);
    expect(hasPanelAccess('operator')).toBe(false);
    expect(hasPanelAccess(null)).toBe(false);
  });

  it('resolves an active administrator permission by Auth user id even if the stored email is stale', () => {
    expect(resolveAdminPermission({
      user_id: 'user-1',
      role: 'admin',
      is_active: true,
      status: 'active',
    }, { id: 'user-1' })).toBe('admin');
  });

  it.each([
    { user_id: 'another-user', role: 'admin', is_active: true, status: 'active' },
    { user_id: 'user-1', role: 'admin', is_active: false, status: 'active' },
    { user_id: 'user-1', role: 'admin', is_active: true, status: 'inactive' },
    { user_id: 'user-1', role: 'customer', is_active: true, status: 'active' },
  ])('denies a permission with invalid identity, activation, status, or role', (permission) => {
    expect(resolveAdminPermission(permission, { id: 'user-1' })).toBeNull();
  });

  it('distinguishes login errors without exposing whether an account exists', () => {
    expect(getAdminLoginErrorMessage({
      message: 'Invalid login credentials',
      code: 'invalid_credentials',
      status: 400,
    })).toContain('não informa se o e-mail não existe ou se a senha está incorreta');
    expect(getAdminLoginErrorMessage({ message: 'Email not confirmed', code: 'email_not_confirmed' }))
      .toContain('e-mail ainda não foi confirmado');
    expect(getAdminLoginErrorMessage(new TypeError('Failed to fetch')))
      .toContain('Falha de conexão com o Supabase');
    expect(getAdminLoginErrorMessage({ message: 'Invalid API key', status: 401 }))
      .toContain('Erro de configuração do Supabase');
    expect(getAdminLoginErrorMessage({ message: 'permission denied', code: 'permission_check_failed' }))
      .toContain('autenticação foi concluída');
    expect(getAdminLoginErrorMessage({ message: 'Invalid Refresh Token', code: 'refresh_token_not_found' }))
      .toContain('Sua sessão expirou');
  });
});
