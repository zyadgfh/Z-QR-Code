import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth';
import { useDashLang, useDocDir } from '../../stores/dashlang';
import { dashT } from '../../lib/i18n';
import { Btn, Err, Field, Input, Ok } from '../../components/ui';
import { fadeInUp } from '../../lib/anim';

type LoginRes = {
  token?: string;
  mfa_required?: boolean;
  mfa_token?: string;
  user?: { id: string; email: string; role: string; mfa_enabled?: boolean; mfa_enforced?: boolean };
};

/** حقل كلمة مرور بكاشف الإظهار (Agency — إجراء حقيقي بسيط بأسلوب iOS) */
function PassField({
  t,
  label,
  autoComplete,
  value,
  onChange,
  required = true,
}: {
  t: (k: any) => string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          dir="ltr"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pe-20"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-extrabold text-teal-700"
          aria-label={show ? t('hidePassword') : t('showPassword')}
        >
          {show ? t('hidePassword') : t('showPassword')}
        </button>
      </div>
    </Field>
  );
}

/** تسجيل الدخول + استعادة كلمة المرور (SEC-01) + خطوة التحقق الثانية (SEC-03) — بلغة آبل: زجاج Liquid Glass على خلفية محيطية هادئة */
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
  const cardRef = useRef<HTMLFormElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const mm = fadeInUp(cardRef.current);
    return () => mm?.revert();
  }, []);
  // انتقال ناعم بين الوضعات (دخول/استعادة/تحقق) — سياق gsap.matchMedia يُنظف دائمًا
  useEffect(() => {
    const mm = fadeInUp(contentRef.current);
    return () => mm?.revert();
  }, [view]);
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
    <div dir={dir} className="auth-ambient flex min-h-dvh items-center justify-center p-4">
      <div className="auth-orb auth-orb--teal" aria-hidden />
      <div className="auth-orb auth-orb--mint" aria-hidden />
      <div className="auth-orb auth-orb--indigo" aria-hidden />
      <form
        ref={cardRef}
        onSubmit={view === 'mfa' ? submitChallenge : view === 'forgot' ? submitForgot : view === 'reset' ? submitReset : submitLogin}
        className="auth-glass relative z-10 w-full max-w-[400px] rounded-[28px] p-8"
      >
        <div className="mb-7 text-center">
          <div className="relative mx-auto mb-4 h-16 w-16">
            <div className="absolute inset-0 scale-125 rounded-full bg-teal-400/40 blur-lg" aria-hidden />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-teal-500 to-teal-700 text-[26px] text-white ring-1 ring-white/40 shadow-apple">
              ▦
            </div>
          </div>
          <h1 className="text-[26px] font-black tracking-tight text-stone-900">{title}</h1>
          <p className="mt-1.5 text-sm font-medium text-stone-500">{t('loginTagline')}</p>
        </div>
        <div ref={contentRef} className="space-y-3.5">
          {notice && <Ok>{notice}</Ok>}
          {children}
          {error && <Err error={error} />}
        </div>
        <p className="mt-7 text-center text-[11px] font-semibold text-stone-400">QR Menu</p>
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
            inputMode={recoveryMode ? 'text' : 'numeric'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={recoveryMode ? 'xxxx-xxxx' : '123456'}
            autoComplete="one-time-code"
            className="text-center text-lg tracking-[0.45em]"
          />
        </Field>
        <button type="button" onClick={() => setRecoveryMode((v) => !v)} className="text-xs font-extrabold text-teal-700 hover:underline">
          {recoveryMode ? t('mfaUseTotp') : t('mfaUseRecovery')}
        </button>
        <Btn type="submit" variant="dark" disabled={busy || !code} className="w-full py-3">
          {t('signin')}
        </Btn>
      </>,
      t('mfaChallenge')
    );
  }

  if (view === 'forgot') {
    return frame(
      <>
        <p className="text-sm leading-relaxed text-stone-500">{t('forgotDesc')}</p>
        <Field label={t('email')}>
          <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Btn type="submit" variant="dark" disabled={busy} className="w-full py-3">
          {t('sendReset')}
        </Btn>
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
        <PassField t={t} label={t('resetNew')} autoComplete="new-password" value={next} onChange={setNext} />
        <PassField t={t} label={t('resetNewConfirm')} autoComplete="new-password" value={confirm} onChange={setConfirm} />
        <Btn type="submit" variant="dark" disabled={busy} className="w-full py-3">
          {t('doReset')}
        </Btn>
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
      <PassField t={t} label={t('password')} autoComplete="current-password" value={password} onChange={setPassword} />
      <div className="flex justify-end">
        <button type="button" onClick={() => { setView('forgot'); setError(null); setNotice(null); }} className="text-xs font-extrabold text-teal-700 hover:underline">
          {t('forgot')}
        </button>
      </div>
      <Btn type="submit" variant="dark" disabled={busy} className="w-full py-3">
        {t('signin')}
      </Btn>
    </>,
    admin ? t('adminTitle') : t('dashboard')
  );
}
