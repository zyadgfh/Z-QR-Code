import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth';
import { useDashLang, useDocDir } from '../../stores/dashlang';
import { dashT } from '../../lib/i18n';
import { Btn, Err, Field, Input, Ok } from '../../components/ui';

type LoginRes = {
  token?: string;
  mfa_required?: boolean;
  mfa_token?: string;
  user?: { id: string; email: string; role: string; mfa_enabled?: boolean; mfa_enforced?: boolean };
};

/** تسجيل الدخول + استعادة كلمة المرور (SEC-01) + خطوة التحقق الثانية (SEC-03) */
export default function DashLogin({ admin = false }: { admin?: boolean }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useDocDir(lang);
  const setToken = useAuth((s) => s.setToken);
  const setMfaToken = useAuth((s) => s.setMfaToken);
  const mfaToken = useAuth((s) => s.mfaToken);
  const loadMe = useAuth((s) => s.loadMe);
  const navigate = useNavigate();

  const [view, setView] = useState<'login' | 'forgot' | 'reset' | 'mfa'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    new URLSearchParams(window.location.search).get('idle') ? t('idleNotice') : null
  );

  const proceed = async (me: any) => {
    if (!admin) {
      const isPlatformAdmin = me?.user.role === 'platform_admin' && !(me.memberships?.length > 0);
      navigate(isPlatformAdmin ? '/admin' : '/dash', { replace: true });
    } else {
      navigate('/admin', { replace: true });
    }
  };

  const post = async (path: string, body: unknown, token?: string) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message || 'خطأ');
    return json;
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const json: LoginRes = await post('/api/auth/login', { email, password });
      if (json.mfa_required && json.mfa_token) {
        setMfaToken(json.mfa_token);
        setView('mfa');
        setBusy(false);
        return;
      }
      if (!json.token) throw new Error('خطأ');
      setToken(json.token);
      const me = await loadMe();
      await proceed(me);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submitChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json = await post('/api/auth/2fa/challenge', { code }, mfaToken || undefined);
      setMfaToken(null);
      setToken(json.token);
      const me = await loadMe();
      await proceed(me);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/request-reset', { email });
      setNotice(t('resetSent'));
      setView('reset');
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (next.length < 8) return setError(t('weakPassword'));
    if (next !== confirm) return setError(t('passwordMismatch'));
    setBusy(true);
    try {
      await post('/api/auth/reset-password', { email, code, new_password: next });
      setNotice(t('resetOk'));
      setView('login');
      setPassword('');
      setCode('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  };

  const frame = (children: React.ReactNode, title: string) => (
    <div dir={dir} className="flex min-h-dvh items-center justify-center bg-[#f5f5f7] p-4">
      <form onSubmit={view === 'mfa' ? submitChallenge : view === 'forgot' ? submitForgot : view === 'reset' ? submitReset : submitLogin} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-apple">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-2xl text-white shadow-apple">▦</div>
          <h1 className="text-xl font-extrabold text-stone-800">{title}</h1>
          <p className="mt-1 text-xs text-stone-400">QR Menu</p>
        </div>
        <div className="space-y-3">
          {notice && <Ok>{notice}</Ok>}
          {children}
          {error && <Err error={error} />}
        </div>
      </form>
    </div>
  );

  if (view === 'mfa') {
    return frame(
      <>
        <p className="text-sm leading-relaxed text-stone-500">{t('mfaChallengeDesc')}</p>
        <Field label={recoveryMode ? t('mfaUseRecovery') : t('mfaChallenge')}>
          <Input
            dir="ltr"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={recoveryMode ? 'xxxx-xxxx' : '123456'}
            autoComplete="one-time-code"
          />
        </Field>
        <button type="button" onClick={() => setRecoveryMode((v) => !v)} className="text-xs font-extrabold text-teal-700 hover:underline">
          {recoveryMode ? t('mfaUseTotp') : t('mfaUseRecovery')}
        </button>
        <Btn type="submit" disabled={busy || !code} className="w-full py-2.5">
          {t('signin')}
        </Btn>
      </>,
      t('mfaChallenge')
    );
  }

  if (view === 'forgot') {
    return frame(
      <>
        <p className="text-sm leading-relaxed text-stone-500">{t('resetSent')}</p>
        <Field label={t('email')}>
          <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Btn type="submit" disabled={busy} className="w-full py-2.5">{t('signin')}</Btn>
        <button type="button" onClick={() => { setView('login'); setError(null); }} className="w-full text-xs font-extrabold text-teal-700 hover:underline">
          {t('backToLogin')}
        </button>
      </>,
      t('forgot')
    );
  }

  if (view === 'reset') {
    return frame(
      <>
        <Field label={t('resetCode')}>
          <Input dir="ltr" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
        </Field>
        <Field label={t('resetNew')}>
          <Input type="password" dir="ltr" required value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label={t('resetNewConfirm')}>
          <Input type="password" dir="ltr" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <Btn type="submit" disabled={busy} className="w-full py-2.5">{t('doReset')}</Btn>
        <button type="button" onClick={() => { setView('forgot'); setError(null); }} className="w-full text-xs font-extrabold text-teal-700 hover:underline">
          {t('forgot')}
        </button>
      </>,
      t('resetNew')
    );
  }

  return frame(
    <>
      <Field label={t('email')}>
        <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      </Field>
      <Field label={t('password')}>
        <Input type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </Field>
      <button type="button" onClick={() => { setView('forgot'); setError(null); setNotice(null); }} className="text-start text-xs font-extrabold text-teal-700 hover:underline">
        {t('forgot')}
      </button>
      <Btn type="submit" disabled={busy} className="w-full py-2.5">
        {t('signin')}
      </Btn>
    </>,
    admin ? t('adminTitle') : t('dashboard')
  );
}
