import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  getAdminLoginErrorMessage,
  hasDevelopmentAdminOverride,
  resolveAdminPermission,
  type AdminLoginError,
  type AdminPermissionIssue,
  type AdminRole,
} from '../lib/adminAuth';

type AdminAuthContextValue = {
  user: User | null;
  role: AdminRole | null;
  permissionIssue: AdminPermissionIssue;
  loading: boolean;
  roleLoading: boolean;
  roleError: string;
  sessionNotice: string;
  developmentAdminOverride: boolean;
  configured: boolean;
  refreshRole: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<{
    error: AdminLoginError | null;
    role: AdminRole | null;
    permissionIssue: AdminPermissionIssue;
  }>;
  signOut: () => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

type PermissionCheckResult = {
  role: AdminRole | null;
  error: string | null;
  issue: AdminPermissionIssue;
};

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [permissionIssue, setPermissionIssue] = useState<AdminPermissionIssue>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleError, setRoleError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const roleRequestId = useRef(0);
  const roleRequest = useRef<{ userId: string; promise: Promise<PermissionCheckResult> } | null>(null);

  const refreshRoleForUser = useCallback((targetUser: User, force = false): Promise<PermissionCheckResult> => {
    if (!force && roleRequest.current?.userId === targetUser.id) {
      return roleRequest.current.promise;
    }

    const requestId = ++roleRequestId.current;
    setRoleLoading(true);
    setRoleError('');

    const request = (async (): Promise<PermissionCheckResult> => {
      try {
        if (!supabase) {
          return { role: null, error: 'Supabase não configurado.', issue: null };
        }

        const { data, error } = await supabase
          .from('admin_user_permissions')
          .select('user_id, role, is_active, status')
          .eq('user_id', targetUser.id)
          .maybeSingle();

        if (requestId !== roleRequestId.current) return { role: null, error: null, issue: null };
        if (error) {
          const message = `Não foi possível verificar as permissões: ${getAdminLoginErrorMessage(error)}`;
          setRole(null);
          setPermissionIssue(null);
          setRoleError(message);
          return { role: null, error: message, issue: null };
        }

        const currentRole = resolveAdminPermission(data, targetUser);
        setRole(currentRole);
        const issue = data
          ? currentRole ? null : 'unauthorized'
          : 'missing-profile';
        setPermissionIssue(issue);
        return { role: currentRole, error: null, issue };
      } catch (reason) {
        if (requestId !== roleRequestId.current) return { role: null, error: null, issue: null };
        const message = `Não foi possível verificar as permissões: ${getAdminLoginErrorMessage(reason)}`;
        setRole(null);
        setPermissionIssue(null);
        setRoleError(message);
        return { role: null, error: message, issue: null };
      } finally {
        if (requestId === roleRequestId.current) setRoleLoading(false);
      }
    })();

    const trackedRequest = request.finally(() => {
      if (roleRequest.current?.promise === trackedRequest) roleRequest.current = null;
    });
    roleRequest.current = { userId: targetUser.id, promise: trackedRequest };
    return trackedRequest;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    let authEventReceived = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      roleRequestId.current += 1;
      roleRequest.current = null;
      if (active) {
        setUser(session?.user ?? null);
        setAccessToken(session?.access_token ?? null);
        const developmentAdmin = Boolean(
          session?.user && hasDevelopmentAdminOverride(session.access_token),
        );
        setRole(developmentAdmin ? 'admin' : null);
        setPermissionIssue(null);
        setRoleError('');
        if (session) setSessionNotice('');
        setRoleLoading(Boolean(session?.user) && !developmentAdmin);
        setLoading(false);
      }
      if (session?.user && !hasDevelopmentAdminOverride(session.access_token)) {
        window.setTimeout(() => {
          if (active) void refreshRoleForUser(session.user);
        }, 0);
      }
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active || authEventReceived) return;
        if (error) {
          console.error('Não foi possível restaurar a sessão administrativa.', error);
          setSessionNotice(getAdminLoginErrorMessage(error));
        }
        setUser(data.session?.user ?? null);
        setAccessToken(data.session?.access_token ?? null);
        const developmentAdmin = Boolean(
          data.session?.user && hasDevelopmentAdminOverride(data.session.access_token),
        );
        setRole(developmentAdmin ? 'admin' : null);
        setPermissionIssue(null);
        setRoleLoading(Boolean(data.session?.user) && !developmentAdmin);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active || authEventReceived) return;
        console.error('Não foi possível restaurar a sessão administrativa.', error);
        setSessionNotice(getAdminLoginErrorMessage(error));
        setUser(null);
        setAccessToken(null);
        setRole(null);
        setPermissionIssue(null);
        setRoleLoading(false);
        setLoading(false);
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshRoleForUser]);

  const refreshRole = useCallback(async () => {
    if (!supabase || !user) {
      roleRequestId.current += 1;
      setRole(null);
      setPermissionIssue(null);
      setRoleError('');
      setRoleLoading(false);
      return;
    }

    if (hasDevelopmentAdminOverride(accessToken)) {
      setRole('admin');
      setPermissionIssue(null);
      setRoleError('');
      setRoleLoading(false);
      return;
    }

    await refreshRoleForUser(user);
  }, [accessToken, refreshRoleForUser, user]);

  useEffect(() => {
    void refreshRole();
  }, [refreshRole]);

  const value = useMemo<AdminAuthContextValue>(() => ({
    user,
    role,
    permissionIssue,
    loading,
    roleLoading,
    roleError,
    sessionNotice,
    developmentAdminOverride: hasDevelopmentAdminOverride(accessToken),
    configured: Boolean(supabase),
    refreshRole,
    refreshSession: async () => {
      if (!supabase) return 'Supabase não configurado.';
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        setSessionNotice(getAdminLoginErrorMessage(error));
      } else {
        setSessionNotice('');
      }
      return error?.message ?? null;
    },
    signIn: async (email, password) => {
      if (!supabase) {
        return {
          error: { message: 'Supabase não configurado.' },
          role: null,
          permissionIssue: null,
        };
      }
      setSessionNotice('');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return {
          error: { message: error.message, code: error.code, status: error.status },
          role: null,
          permissionIssue: null,
        };
      }
      if (!data.session?.user) {
        return {
          error: { message: 'O Supabase não retornou uma sessão autenticada.', code: 'session_missing' },
          role: null,
          permissionIssue: null,
        };
      }

      setSessionNotice('');
      setUser(data.session.user);
      setAccessToken(data.session.access_token);
      const developmentAdmin = hasDevelopmentAdminOverride(data.session.access_token);
      setRole(developmentAdmin ? 'admin' : null);
      setPermissionIssue(null);
      setRoleError('');
      if (developmentAdmin) {
        setRoleLoading(false);
        return { error: null, role: 'admin', permissionIssue: null };
      }
      const authorization = await refreshRoleForUser(data.session.user, true);
      return {
        error: authorization.error
          ? { message: authorization.error, code: 'permission_check_failed' }
          : null,
        role: authorization.role,
        permissionIssue: authorization.issue,
      };
    },
    signOut: async () => {
      if (!supabase) return 'Supabase não configurado.';
      const { error } = await supabase.auth.signOut();
      return error?.message ?? null;
    },
    sendPasswordReset: async (email) => {
      if (!supabase) return 'Supabase não configurado.';
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/login`,
      });
      return error?.message ?? null;
    },
  }), [
    user,
    role,
    permissionIssue,
    loading,
    roleLoading,
    roleError,
    sessionNotice,
    accessToken,
    refreshRole,
    refreshRoleForUser,
  ]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth deve ser usado dentro de AdminAuthProvider.');
  return context;
}
