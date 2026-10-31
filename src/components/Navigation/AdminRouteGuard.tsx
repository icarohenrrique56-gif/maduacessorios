import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { user, role, loading, roleLoading, roleError } = useAdminAuth();

  if (loading || (user && roleLoading)) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f9eff4] text-sm text-[#5d4454]">Verificando acesso administrativo...</main>;
  }

  if (roleError) {
    return <main role="alert" className="flex min-h-screen items-center justify-center bg-[#f9eff4] px-4 text-center text-sm text-[#5d4454]">{roleError}</main>;
  }

  if (!user || !role) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
