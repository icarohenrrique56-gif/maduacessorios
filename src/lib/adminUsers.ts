import { supabase } from './supabase';
export type ManagedUser = {
  id: string;
  email: string;
  role: 'admin';
  createdAt: string;
  lastSignInAt: string | null;
};

type AdminUsersResponse = {
  users?: ManagedUser[];
  user?: ManagedUser | null;
  revoked?: boolean;
  error?: string;
};

async function invokeAdminUsers(body?: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.functions.invoke<AdminUsersResponse>('admin-users', {
    body,
  });
  if (error) {
    let message = error.message;
    if ('context' in error && error.context instanceof Response) {
      try {
        const responseBody = await error.context.clone().json() as AdminUsersResponse;
        if (responseBody.error) message = responseBody.error;
      } catch {
        message = `${message} (resposta de erro inválida)`;
      }
    }
    throw new Error(`Não foi possível gerenciar usuários: ${message}`);
  }
  if (!data) throw new Error('A função não confirmou a operação de usuários.');
  if (data.error) throw new Error(data.error);
  return data;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const result = await invokeAdminUsers({ action: 'list' });
  if (!Array.isArray(result.users)) {
    throw new Error('A função não retornou uma lista válida de usuários.');
  }
  return result.users;
}

export async function revokeUserAccess(userId: string) {
  const result = await invokeAdminUsers({ action: 'revoke', userId });
  if (result.revoked !== true) throw new Error('A função não confirmou a revogação do acesso.');
}
