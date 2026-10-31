import { useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getAdminLoginErrorMessage } from '../lib/adminAuth';
import maduLogo from '../assets/madu-logo-transparent.png';

export function AdminLoginPage() {
  const {
    user,
    role,
    roleLoading,
    roleError,
    sessionNotice,
    configured,
    signIn,
    signOut,
    sendPasswordReset,
  } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  if (user && !roleLoading && !roleError && role) {
    return <Navigate to={role === 'admin' ? '/admin' : '/admin/produtos'} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        setMessage(getAdminLoginErrorMessage(result.error));
        return;
      }
      if (!result.role) {
        setMessage('A autenticação foi concluída, mas esta conta não tem autorização para acessar o painel da MADU.');
        return;
      }

      navigate(result.role === 'admin' ? '/admin' : '/admin/produtos', { replace: true });
    } catch (error) {
      setMessage(getAdminLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setMessage('Informe seu e-mail para receber o link de recuperação.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    try {
      const error = await sendPasswordReset(email.trim());
      setMessage(error
        ? `Não foi possível enviar a recuperação: ${error}`
        : 'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.');
    } catch (error) {
      setMessage(`Não foi possível enviar a recuperação: ${error instanceof Error ? error.message : 'erro inesperado.'}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOutUnauthorized() {
    setIsSubmitting(true);
    const error = await signOut();
    setIsSubmitting(false);
    setMessage(error ? `Não foi possível encerrar a sessão: ${error}` : '');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f9eff4] px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-[#2d1d25]">
      <section className="my-auto w-full max-w-md rounded-[2rem] border border-[#f1dfe9] bg-white p-5 shadow-soft sm:p-9">
        <Link to="/" className="mb-8 inline-flex" aria-label="Voltar para a loja MADU">
          <img
            src={maduLogo}
            alt="Madu Acessórios"
            className="h-14 w-auto object-contain"
          />
        </Link>
        <h1 className="text-2xl font-semibold">Acesso administrativo</h1>
        <p className="mt-2 text-sm text-[#5d4454]">
          Entre com uma conta autorizada para administrar a MADU.
        </p>

        {!configured && (
          <p role="alert" className="mt-5 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            O Supabase não está configurado neste ambiente. O acesso administrativo está indisponível.
          </p>
        )}

        {user && roleLoading ? (
          <p role="status" className="mt-6 rounded-2xl bg-[#f8e9ef] p-3 text-sm text-[#5d4454]">
            Verificando as permissões desta conta...
          </p>
        ) : user ? (
          <div className="mt-6 space-y-4">
            <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">
              {roleError || (
                <>
                  Esta conta não tem autorização para acessar o painel da MADU neste ambiente.
                  <span className="mt-2 block">
                    Encerre a sessão para entrar com outra conta.
                  </span>
                </>
              )}
            </p>
            <button type="button" disabled={isSubmitting} onClick={() => void handleSignOutUnauthorized()} className="w-full rounded-full border border-[#efd7e7] px-4 py-3 text-sm font-medium text-[#5d4454] disabled:opacity-60">
              Encerrar sessão
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
            {sessionNotice && (
              <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">
                {sessionNotice}
              </p>
            )}
            <label className="block text-sm font-medium text-[#5d4454]">
              E-mail
              <input
                type="email"
                inputMode="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 min-h-12 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-4 py-3 text-[#2d1d25] outline-none focus:border-[#8B5E7C]"
              />
            </label>
            <label className="block text-sm font-medium text-[#5d4454]">
              Senha
              <span className="relative mt-1 block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-4 py-3 pr-12 text-[#2d1d25] outline-none focus:border-[#8B5E7C]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 inline-flex min-h-12 min-w-12 items-center justify-center text-[#8B5E7C]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {message && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{message}</p>}
            <button type="submit" disabled={!configured || isSubmitting} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#8B5E7C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#76506a] disabled:cursor-not-allowed disabled:opacity-60">
              {isSubmitting && <LoaderCircle size={17} className="animate-spin" />}
              {isSubmitting ? 'Aguarde...' : 'Entrar'}
            </button>
            <button type="button" disabled={!configured || isSubmitting} onClick={() => void handlePasswordReset()} className="min-h-11 w-full py-2 text-sm text-[#8B5E7C] underline-offset-4 hover:underline disabled:opacity-60">
              Esqueci minha senha
            </button>
          </form>
        )}
        <Link to="/" className="mt-5 inline-block text-sm text-[#5d4454] hover:text-[#8B5E7C]">
          Voltar para a loja
        </Link>
      </section>
    </main>
  );
}
