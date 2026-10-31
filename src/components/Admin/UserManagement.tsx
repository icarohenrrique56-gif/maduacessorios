import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserRound, UserRoundX } from 'lucide-react';
import { listManagedUsers, revokeUserAccess } from '../../lib/adminUsers';
import type { ManagedUser } from '../../lib/adminUsers';
import { useAdminAuth } from '../../context/AdminAuthContext';

export function UserManagement() {
  const {
    user: currentUser,
    developmentAdminOverride,
    refreshRole,
    refreshSession,
  } = useAdminAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await listManagedUsers());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erro inesperado ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  async function handleRevoke(member: ManagedUser) {
    if (member.id === currentUser?.id && !window.confirm('Você está revogando seu próprio acesso. Continuar?')) return;
    if (!window.confirm(`Confirmar a revogação do acesso de ${member.email}?`)) return;

    setSaving(true);
    setMessage('');
    setError('');
    try {
      await revokeUserAccess(member.id);
      setMessage('Acesso revogado.');
      if (member.id === currentUser?.id) {
        const sessionError = await refreshSession();
        await refreshRole();
        if (sessionError) {
          setError(`A permissão foi atualizada, mas não foi possível renovar a sessão: ${sessionError}`);
        }
      } else {
        await refreshUsers();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erro inesperado ao revogar o acesso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[1.75rem] border border-[#f1dfe9] bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-[#f8e9ef] p-3 text-[#8B5E7C]"><ShieldCheck size={20} /></div>
          <div>
            <h2 className="text-xl font-semibold text-[#2d1d25]">Administradores autorizados</h2>
            <p className="mt-1 text-sm leading-6 text-[#5d4454]">
              {developmentAdminOverride
                ? 'No Supabase local, todas as contas autenticadas recebem acesso administrativo temporário. Essa permissão não é gravada.'
                : 'Apenas contas de painel já autorizadas são listadas. Novos acessos não podem ser concedidos por esta tela.'}
            </p>
          </div>
        </div>
        <p className="mt-1 text-sm text-[#5d4454]">
          {developmentAdminOverride
            ? 'A exceção depende do issuer local do Supabase e não concede acesso em produção.'
            : 'A permissão é verificada no banco a cada sessão e nas policies RLS.'}
        </p>
        {message && <p role="status" className="mt-4 rounded-2xl bg-[#f8e9ef] p-3 text-sm text-[#5d4454]">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}

        {loading ? (
          <p role="status" className="mt-5 text-sm text-[#5d4454]">Carregando usuários...</p>
        ) : users.length > 0 ? (
          <ul className="mt-5 divide-y divide-[#f1dfe9]">
            {users.map((member) => (
              <li key={member.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-full bg-[#f8e9ef] p-2 text-[#8B5E7C]"><UserRound size={18} /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#2d1d25]">{member.email}</p>
                    <p className="mt-1 text-xs text-[#76506a]">Administrador</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving || developmentAdminOverride}
                  onClick={() => void handleRevoke(member)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#efd7e7] px-3 text-xs text-[#76506a] disabled:opacity-50"
                >
                  <UserRoundX size={15} />
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-2xl bg-[#fffafc] p-4 text-sm text-[#5d4454]">Nenhum usuário autorizado foi encontrado.</p>
        )}
        <p className="mt-4 text-xs leading-5 text-[#76506a]">
          O sistema impede revogar o último administrador. Revogar o acesso não exclui a conta Auth.
        </p>
      </div>
    </section>
  );
}
