export type AdminRole = 'admin';
export type AdminPermissionIssue = 'missing-profile' | 'unauthorized' | null;
export type AdminLoginError = {
  message: string;
  code?: string;
  status?: number;
};

const LOCAL_SUPABASE_AUTH_ISSUERS = new Set([
  'http://127.0.0.1:54321/auth/v1',
  'http://localhost:54321/auth/v1',
]);

export function hasDevelopmentAdminOverride(
  accessToken: string | null | undefined,
  environment: { DEV: boolean; MODE: string } = import.meta.env,
) {
  if ((!environment.DEV && environment.MODE !== 'test') || !accessToken) return false;

  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return false;
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - normalizedPayload.length % 4) % 4),
      '=',
    )));
    if (typeof claims !== 'object' || claims === null || !('iss' in claims)) return false;
    return typeof claims.iss === 'string' && LOCAL_SUPABASE_AUTH_ISSUERS.has(claims.iss);
  } catch {
    return false;
  }
}

export function parseAdminRole(role: unknown): AdminRole | null {
  return role === 'admin' ? role : null;
}

export type AdminPermissionRecord = {
  user_id: unknown;
  role: unknown;
  is_active: unknown;
  status: unknown;
};

export function resolveAdminPermission(
  permission: AdminPermissionRecord | null | undefined,
  user: { id: string },
): AdminRole | null {
  if (
    !permission ||
    permission.user_id !== user.id ||
    permission.is_active !== true ||
    permission.status !== 'active'
  ) {
    return null;
  }

  return parseAdminRole(permission.role);
}

export function hasPanelAccess(role: unknown) {
  return parseAdminRole(role) !== null;
}

export function getAdminLoginErrorMessage(error: unknown) {
  const record = typeof error === 'object' && error !== null ? error : null;
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : record && 'message' in record && typeof record.message === 'string'
        ? record.message
        : '';
  const code = record && 'code' in record && typeof record.code === 'string'
    ? record.code.toLowerCase()
    : '';
  const status = record && 'status' in record && typeof record.status === 'number'
    ? record.status
    : undefined;
  const normalizedMessage = message.toLowerCase();

  if (
    code === 'email_not_confirmed' ||
    normalizedMessage.includes('email not confirmed') ||
    normalizedMessage.includes('email not verified')
  ) {
    return 'Este e-mail ainda não foi confirmado no Supabase. Confirme-o antes de entrar.';
  }

  if (
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    normalizedMessage.includes('refresh token') ||
    normalizedMessage.includes('session expired')
  ) {
    return 'Sua sessão expirou ou não pôde ser restaurada. Entre novamente com seu e-mail e senha.';
  }

  if (
    code === 'invalid_credentials' ||
    normalizedMessage.includes('invalid login credentials')
  ) {
    return 'O Supabase não aceitou as credenciais. Confira o e-mail e a senha da conta neste projeto e tente novamente. Por segurança, o Supabase não informa se o e-mail não existe ou se a senha está incorreta.';
  }

  if (
    code === 'invalid_url' ||
    normalizedMessage.includes('invalid url') ||
    normalizedMessage.includes('failed to parse url')
  ) {
    return 'Erro de configuração do Supabase. Verifique a URL VITE_SUPABASE_URL no ambiente de build.';
  }

  if (
    code === 'permission_check_failed' ||
    code === '42501' ||
    normalizedMessage.includes('permission denied')
  ) {
    return `A autenticação foi concluída, mas não foi possível consultar a autorização no banco${message ? `: ${message}` : '.'}`;
  }

  if (
    status === 401 &&
    (normalizedMessage.includes('api key') || normalizedMessage.includes('jwt'))
  ) {
    return 'Erro de configuração do Supabase. Verifique a URL do projeto e a chave pública VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de build.';
  }

  if (
    error instanceof TypeError ||
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed')
  ) {
    return 'Falha de conexão com o Supabase. Verifique sua rede e tente novamente.';
  }

  return `Não foi possível entrar: ${message || 'erro inesperado.'}`;
}
