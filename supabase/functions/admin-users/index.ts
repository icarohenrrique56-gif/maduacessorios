import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.118.0/cors';

type StoreRole = 'admin';

type Database = {
  public: {
    Tables: {
      admin_user_permissions: {
        Row: {
          user_id: string;
          email: string | null;
          role: StoreRole;
          is_active: boolean;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email?: string | null;
          role: StoreRole;
          is_active?: boolean;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string | null;
          role?: StoreRole;
          is_active?: boolean;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      admin_set_user_role: {
        Args: {
          p_actor_user_id: string;
          p_user_id: string;
          p_role: StoreRole | null;
        };
        Returns: undefined;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};

type AdminClient = SupabaseClient<Database>;

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...jsonHeaders,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': origin ?? 'null',
      Vary: 'Origin',
    },
  });
}

function readAllowedOrigins() {
  return (Deno.env.get('ADMIN_APP_ORIGINS') ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalSupabaseAuthToken(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - normalizedPayload.length % 4) % 4),
      '=',
    ))) as { iss?: unknown };
    return claims.iss === 'http://127.0.0.1:54321/auth/v1' ||
      claims.iss === 'http://localhost:54321/auth/v1';
  } catch {
    return false;
  }
}

async function loadManagedUsers(adminClient: AdminClient) {
  const { data: permissions, error } = await adminClient
    .from('admin_user_permissions')
    .select('user_id, role')
    .eq('is_active', true)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(
      `Não foi possível carregar as permissões: ${error.message}`,
    );
  }

  return Promise.all((permissions ?? []).map(async (permission) => {
    const { data, error: userError } = await adminClient.auth.admin.getUserById(
      permission.user_id,
    );
    if (userError || !data.user) {
      throw new Error(
        `Não foi possível carregar uma conta autorizada: ${
          userError?.message ?? 'usuário não encontrado.'
        }`,
      );
    }
    return userSummary(data.user, permission.role);
  }));
}

async function loadLocalDevelopmentUsers(adminClient: AdminClient) {
  const users: ReturnType<typeof userSummary>[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      throw new Error(
        `Não foi possível carregar os usuários locais: ${error.message}`,
      );
    }

    users.push(...data.users.map((user) => userSummary(user, 'admin')));
    if (data.users.length < 1000) return users;
  }
}

function userSummary(
  user: {
    id: string;
    email?: string;
    created_at: string;
    last_sign_in_at?: string | null;
  },
  role: StoreRole,
) {
  return {
    id: user.id,
    email: user.email ?? '',
    role,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (origin && !readAllowedOrigins().includes(origin)) {
    return jsonResponse({ error: 'Origem não autorizada.' }, 403, null);
  }
  if (request.method === 'OPTIONS') return jsonResponse(null, 204, origin);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Configuração Supabase ausente para admin-users.');
    return jsonResponse(
      { error: 'A função não está configurada no servidor.' },
      500,
      origin,
    );
  }

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, origin);
  }

  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(
    token,
  );
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401, origin);
  }

  const localDevelopmentOverride = isLocalSupabaseAuthToken(token);
  if (!localDevelopmentOverride) {
    const { data: callerPermission, error: permissionError } = await adminClient
      .from('admin_user_permissions')
      .select('user_id, email, role, is_active, status')
      .eq('user_id', authData.user.id)
      .eq('is_active', true)
      .eq('status', 'active')
      .maybeSingle();

    if (permissionError) {
      console.error(
        'Não foi possível verificar o perfil do solicitante.',
        permissionError,
      );
      return jsonResponse(
        { error: 'Não foi possível verificar as permissões no banco.' },
        500,
        origin,
      );
    }
    if (
      callerPermission?.user_id !== authData.user.id ||
      callerPermission.is_active !== true ||
      callerPermission.status !== 'active' ||
      callerPermission.role !== 'admin'
    ) {
      return jsonResponse(
        { error: 'Somente administradores podem gerenciar usuários.' },
        403,
        origin,
      );
    }
  }

  try {
    if (request.method === 'GET') {
      return jsonResponse(
        {
          users: localDevelopmentOverride
            ? await loadLocalDevelopmentUsers(adminClient)
            : await loadManagedUsers(adminClient),
        },
        200,
        origin,
      );
    }

    let payload: {
      action?: string;
      userId?: string;
    } = {};
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, origin);
    }

    if (payload.action === 'list') {
      return jsonResponse(
        {
          users: localDevelopmentOverride
            ? await loadLocalDevelopmentUsers(adminClient)
            : await loadManagedUsers(adminClient),
        },
        200,
        origin,
      );
    }

    if (payload.action === 'revoke') {
      if (localDevelopmentOverride) {
        return jsonResponse(
          { error: 'No ambiente local, todas as contas autenticadas mantêm acesso administrativo.' },
          409,
          origin,
        );
      }
      const userId = payload.userId;
      if (
        !userId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        )
      ) {
        return jsonResponse(
          { error: 'Identificador de usuário inválido.' },
          400,
          origin,
        );
      }
      const { error: roleError } = await adminClient.rpc(
        'admin_set_user_role',
        {
          p_actor_user_id: authData.user.id,
          p_user_id: userId,
          p_role: null,
        },
      );
      if (roleError) {
        return jsonResponse(
          {
            error: `Não foi possível atualizar o acesso: ${roleError.message}`,
          },
          409,
          origin,
        );
      }
      return jsonResponse({ revoked: true }, 200, origin);
    }

    return jsonResponse({ error: 'Ação não reconhecida.' }, 400, origin);
  } catch (error) {
    console.error('Falha ao executar admin-users.', error);
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : 'Erro inesperado ao gerenciar usuários.',
      },
      500,
      origin,
    );
  }
});
