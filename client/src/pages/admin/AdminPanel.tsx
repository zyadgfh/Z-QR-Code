import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { dashT, fmtDate } from '../../lib/i18n';
import { useAuth, Me } from '../../stores/auth';
import { useDashLang, useDocDir } from '../../stores/dashlang';
import { Btn, Err, Field, Input, Modal, Ok, Select, Spinner, StatusChip } from '../../components/ui';
import ChangePasswordCard from '../../components/ChangePassword';
import SecurityCard from '../../components/SecurityCard';
import MfaGate from '../../components/MfaGate';
import { useIdleLogout } from '../../components/useIdleLogout';
import { staggerCards } from '../../lib/anim';

type AdminShop = {
  id: string;
  slug: string;
  name: string;
  phone: string;
  owner_email: string | null;
  created_at: number;
  trial_ends_at: number;
  paid_until: number | null;
  status: 'trial' | 'active' | 'locked';
  table_count: number;
};

type PlatformSettings = { monthly_price: number; payment_instructions: string };

export default function AdminPanel() {
  const { token, me, loadMe } = useAuth();
  const { lang, set: setLang } = useDashLang();
  const t = dashT(lang);
  useDocDir(lang);

  const [ready, setReady] = useState(false);
  const [shops, setShops] = useState<AdminShop[] | null>(null);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // دخول متدرج لصفوف جدول المحلات عند كل تحديث للقائمة
  useEffect(() => {
    if (shops) staggerCards(tableRef.current);
  }, [shops]);

  const isAdmin = me?.user.role === 'platform_admin';

  // خمول 30 دقيقة → خروج تلقائي (SEC-02)
  useIdleLogout(() => {
    useAuth.getState().logout();
    window.location.assign('/admin?idle=1');
  }, 30);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api<AdminShop[]>('/api/admin/shops'), api<PlatformSettings>('/api/admin/settings')]);
      setShops(s);
      setSettings(st);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setReady(true);
      return;
    }
    loadMe().then(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!ready) return <Spinner label={t('loading')} />;
  if (!isAdmin) return <AdminLogin idle={new URLSearchParams(window.location.search).get('idle') === '1'} />;

  // بوابة التحقق بخطوتين الإلزامية لأدمن المنصة (SEC-03)
  if (me && me.user.mfa_enforced && !me.user.mfa_enabled) {
    return (
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-dvh bg-[#f5f5f7]">
        <MfaGate />
      </div>
    );
  }

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn;
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-dvh bg-stone-100 p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex items-center gap-3">
          <h1 className="text-xl font-extrabold text-stone-800">🛡 {t('adminTitle')}</h1>
          <span className="text-xs text-stone-400" dir="ltr">{me?.user.email}</span>
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="ms-auto rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-stone-600 shadow-sm">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
        </header>

        {/* إعدادات المنصة */}
        {settings && (
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-stone-400">⚙️ {t('platformSettings')}</h3>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <Field label={t('monthlyPrice')}>
                <Input type="number" min={1} value={settings.monthly_price} onChange={(e) => setSettings({ ...settings, monthly_price: Number(e.target.value) })} />
              </Field>
              <Field label={t('paymentInstructions')}>
                <Input value={settings.payment_instructions} onChange={(e) => setSettings({ ...settings, payment_instructions: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Btn onClick={() => act(() => api('/api/admin/settings', { method: 'PUT', body: settings }))}>{t('save')}</Btn>
              {saved && <Ok>{t('saved')}</Ok>}
            </div>
          </div>
        )}

        {/* تغيير كلمة المرور */}
        <ChangePasswordCard />
        <SecurityCard />

        {/* المحلات */}
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-stone-400">🏪 {t('shops')} ({shops?.length ?? 0})</h3>
            <Btn onClick={() => setCreating(true)}>＋ {t('createShop')}</Btn>
          </div>
          {error && <Err error={error} />}
          {!shops ? (
            <Spinner label={t('loading')} />
          ) : shops.length === 0 ? (
            <p className="py-6 text-center text-sm font-bold text-stone-400">{t('noShops')}</p>
          ) : (
            <div ref={tableRef} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs text-stone-400">
                    <th className="p-2 text-start">{t('shopName')}</th>
                    <th className="p-2 text-start">{t('owner')}</th>
                    <th className="p-2 text-start">{t('tableCount')}</th>
                    <th className="p-2 text-start">{t('trialEndsAt')}</th>
                    <th className="p-2 text-start">{t('paidUntilAt')}</th>
                    <th className="p-2 text-start">{t('status')}</th>
                    <th className="p-2 text-start">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shops.map((s) => (
                    <tr key={s.id} data-card className="border-t border-stone-100">
                      <td className="p-2">
                        <p className="font-extrabold text-stone-800">{s.name}</p>
                        <p className="text-[11px] text-stone-400" dir="ltr">/{s.slug}</p>
                      </td>
                      <td className="p-2 text-xs text-stone-500" dir="ltr">{s.owner_email}</td>
                      <td className="p-2">{s.table_count}</td>
                      <td className="p-2 text-xs">{fmtDate(lang, s.trial_ends_at)}</td>
                      <td className="p-2 text-xs">{fmtDate(lang, s.paid_until)}</td>
                      <td className="p-2"><StatusChip status={s.status} t={t} /></td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1.5">
                          <Btn variant="soft" onClick={() => act(() => api(`/api/admin/shops/${s.id}/mark-paid`, { method: 'POST' }))}>💳 {t('markPaid')}</Btn>
                          {s.status === 'locked' ? (
                            <Btn onClick={() => act(() => api(`/api/admin/shops/${s.id}/lock`, { method: 'POST', body: { locked: false } }))}>🔓 {t('unlock')}</Btn>
                          ) : (
                            <Btn variant="danger" onClick={() => act(() => api(`/api/admin/shops/${s.id}/lock`, { method: 'POST', body: { locked: true } }))}>🔒 {t('lock')}</Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <CreateShopModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreateShopModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [form, setForm] = useState({ name: '', slug: '', phone: '', table_count: 5, menu_language: 'ar', owner_email: '', owner_password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/shops', { method: 'POST', body: form });
      onCreated();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open onClose={onClose} title={`＋ ${t('createShop')}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('shopName')}><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('slug')}><Input dir="ltr" value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="nile-cafe" /></Field>
          <Field label={t('phone')}><Input dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('tablesCount')}><Input type="number" min={1} max={100} value={form.table_count} onChange={(e) => set('table_count', Number(e.target.value))} /></Field>
          <Field label={t('menuLanguage')}>
            <Select value={form.menu_language} onChange={(e) => set('menu_language', e.target.value)}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label={t('ownerEmail')}><Input dir="ltr" type="email" value={form.owner_email} onChange={(e) => set('owner_email', e.target.value)} /></Field>
          <Field label={t('ownerPassword')}><Input dir="ltr" type="text" value={form.owner_password} onChange={(e) => set('owner_password', e.target.value)} /></Field>
        </div>
        {error && <Err error={error} />}
        <Btn className="w-full py-2.5" onClick={submit} disabled={busy}>{busy ? '…' : t('createShop')}</Btn>
      </div>
    </Modal>
  );
}

function AdminLogin({ idle = false }: { idle?: boolean }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const setToken = useAuth((s) => s.setToken);
  const loadMe = useAuth((s) => s.loadMe);
  const [phase, setPhase] = useState<'checking' | 'bootstrap' | 'login' | 'mfa'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(idle ? t('idleNotice') : null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    fetch('/api/auth/admin-exists')
      .then((r) => r.json())
      .then((d) => setPhase(d?.exists ? 'login' : 'bootstrap'))
      .catch(() => setPhase('login'));
  }, []);

  const afterAuth = async (token: string) => {
    setToken(token);
    await loadMe();
  };

  const submitLogin = async (e: React.FormEvent) => {
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
      // حساب مفعّل بـ 2FA → خطوة تحدٍّ ثانية بلا توكن كامل (SEC-03)
      if (json.mfa_required && json.mfa_token) {
        setMfaToken(json.mfa_token);
        setPhase('mfa');
        setBusy(false);
        return;
      }
      await afterAuth(json.token);
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
      const res = await fetch('/api/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${mfaToken}` },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'خطأ');
      await afterAuth(json.token);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submitBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError(t('passwordMismatch'));
    if (password.length < 10) return setError(lang === 'ar' ? 'كلمة المرور 10 أحرف على الأقل' : 'Password must be at least 10 characters');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/bootstrap-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'خطأ');
      await afterAuth(json.token);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={phase === 'bootstrap' ? submitBootstrap : phase === 'mfa' ? submitChallenge : submitLogin}
      className="mx-auto mt-10 w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
    >
      <h2 className="mb-1 text-center text-lg font-extrabold text-stone-800">
        🛡 {phase === 'bootstrap' ? t('setupTitle') : phase === 'mfa' ? t('mfaChallenge') : t('adminExistsTitle')}
      </h2>
      {notice && <p className="mb-3 rounded-xl bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{notice}</p>}
      {phase === 'bootstrap' && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
          {t('setupHint')}
        </p>
      )}
      {phase === 'checking' ? (
        <p className="py-6 text-center text-sm text-stone-400">…</p>
      ) : phase === 'mfa' ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-stone-500">{t('mfaChallengeDesc')}</p>
          <Field label={t('mfaChallenge')}>
            <Input dir="ltr" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
          </Field>
          {error && <Err error={error} />}
          <Btn type="submit" disabled={busy || !code} className="w-full py-2.5">
            {busy ? '…' : t('signin')}
          </Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t('email')}>
            <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field label={t('password')}>
            <Input type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={phase === 'bootstrap' ? 'new-password' : 'current-password'} />
          </Field>
          {phase === 'bootstrap' && (
            <Field label={t('confirmNewPassword')}>
              <Input type="password" dir="ltr" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
          )}
          {error && <Err error={error} />}
          <Btn type="submit" disabled={busy} className="w-full py-2.5">
            {busy ? '…' : phase === 'bootstrap' ? `🛡 ${t('createAdmin')}` : t('signin')}
          </Btn>
        </div>
      )}
    </form>
  );
}
