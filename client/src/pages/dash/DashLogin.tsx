import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth';
import { useDashLang, useDocDir } from '../../stores/dashlang';
import { dashT } from '../../lib/i18n';
import { Btn, Err, Field, Input } from '../../components/ui';

export default function DashLogin({ admin = false }: { admin?: boolean }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useDocDir(lang);
  const setToken = useAuth((s) => s.setToken);
  const loadMe = useAuth((s) => s.loadMe);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'خطأ');
      setToken(json.token);
      const me = await loadMe();
      if (!admin) {
        const isPlatformAdmin = me?.user.role === 'platform_admin' && !(me.memberships?.length > 0);
        navigate(isPlatformAdmin ? '/admin' : '/dash', { replace: true });
      } else {
        navigate('/admin', { replace: true });
      }
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div dir={dir} className="flex min-h-dvh items-center justify-center bg-stone-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-2xl text-white">▦</div>
          <h1 className="text-xl font-extrabold text-stone-800">{admin ? t('adminTitle') : t('dashboard')}</h1>
          <p className="mt-1 text-xs text-stone-400">QR Menu</p>
        </div>
        <div className="space-y-3">
          <Field label={t('email')}>
            <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field label={t('password')}>
            <Input type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {error && <Err error={error} />}
          <Btn type="submit" disabled={busy} className="w-full py-2.5">
            {t('signin')}
          </Btn>
        </div>
      </form>
    </div>
  );
}
