import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { dashT, timeAgo } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Err, Field, Input, Ok } from './ui';
import MfaGate from './MfaGate';

type SessionRow = { id: string; current: boolean; ua: string; ip: string; created_at: number; last_seen: number };

function deviceLabel(ua: string) {
  if (/iphone|ipad/i.test(ua)) return '📱 iOS';
  if (/android/i.test(ua)) return '🤖 Android';
  if (/mac os/i.test(ua)) return '💻 macOS';
  if (/windows/i.test(ua)) return '💻 Windows';
  if (/linux/i.test(ua)) return '🐧 Linux';
  return '🌐 ' + (ua.slice(0, 24) || '—');
}

/** بطاقة الأمان (SEC-02 + SEC-03): الأجهزة النشطة + إدارة التحقق بخطوتين */
export default function SecurityCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const me = useAuth((s) => s.me);
  const loadMe = useAuth((s) => s.loadMe);
  const setToken = useAuth((s) => s.setToken);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);

  const load = async () => {
    try {
      const res = await api<{ sessions: SessionRow[] }>('/api/auth/sessions');
      setSessions(res.sessions);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (fn: () => Promise<{ token?: string; recovery_codes?: string[] }>) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fn();
      if (res?.token) setToken(res.token); // tv ارتفع — الجلسة الحالية تجدّد توكنها
      if (res?.recovery_codes) setNewCodes(res.recovery_codes);
      await load();
      await loadMe();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const mfaEnabled = !!me?.user.mfa_enabled;
  const setupFlow = !mfaEnabled && showDisable === false && newCodes === null && me?.user.role === 'staff';

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-black text-stone-400">🛡 {t('security')}</h3>

      {/* الأجهزة النشطة */}
      <p className="mb-3 text-xs text-stone-400">{t('sessionsDesc')}</p>
      {sessions === null ? (
        <p className="text-sm text-stone-400">…</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-stone-800">
                  {deviceLabel(s.ua)} {s.current && <span className="text-teal-700">· {t('currentDevice')}</span>}
                </p>
                <p className="text-[11px] text-stone-400" dir="ltr">
                  {s.ip || '—'} · {t('lastSeen')}: {timeAgo(lang, s.last_seen)}
                </p>
              </div>
              {!s.current && (
                <button
                  disabled={busy}
                  onClick={() => act(() => api(`/api/auth/sessions/${s.id}`, { method: 'DELETE' }))}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-red-600 shadow-sm transition hover:bg-red-50"
                >
                  {t('revokeDevice')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Btn variant="ghost" disabled={busy} onClick={() => act(() => api('/api/auth/logout-all', { method: 'POST' }))}>
          {t('logoutOthers')}
        </Btn>
      </div>

      {/* التحقق بخطوتين */}
      <div className="mt-5 border-t border-black/5 pt-4">
        <p className="text-sm font-extrabold text-stone-800">{mfaEnabled ? t('mfaOn') : t('mfaOff')}</p>
        {mfaEnabled ? (
          <>
            {!showDisable && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn variant="ghost" disabled={busy} onClick={() => setShowDisable(true)}>
                  {t('mfaDisable')}
                </Btn>
                <Btn variant="ghost" disabled={busy} onClick={() => act(() => api('/api/auth/2fa/recovery-codes', { method: 'POST', body: { password: pw } }))}>
                  {t('mfaRegen')}
                </Btn>
              </div>
            )}
            {showDisable && (
              <div className="mt-3 grid gap-3 rounded-2xl bg-[#f5f5f7] p-3 sm:grid-cols-2">
                <p className="text-xs font-bold text-stone-500 sm:col-span-2">{t('mfaDisableHint')}</p>
                <Field label={t('confirmPasswordTitle')}>
                  <Input dir="ltr" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
                </Field>
                <Field label={t('mfaChallenge')}>
                  <Input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
                <div className="flex gap-2 sm:col-span-2">
                  <Btn
                    disabled={busy || !pw || code.length !== 6}
                    onClick={() =>
                      act(() => api('/api/auth/2fa/disable', { method: 'POST', body: { password: pw, code } })).then(() => setShowDisable(false))
                    }
                  >
                    {t('mfaDisable')}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setShowDisable(false)}>✕</Btn>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs text-stone-400">{t('mfaChallengeDesc')}</p>
        )}
      </div>

      {/* تفعيل اختياري (موظفون) — نفس تدفق البوابة داخل البطاقة */}
      {setupFlow && <div className="mt-4"><MfaGate variant="card" /></div>}

      {/* أكواد الاسترداد الجديدة */}
      {newCodes && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4">
          <p className="text-sm font-extrabold text-amber-900">{t('mfaRecoveryTitle')}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5" dir="ltr">
            {newCodes.map((c) => (
              <code key={c} className="font-mono text-xs font-bold text-amber-900">{c}</code>
            ))}
          </div>
        </div>
      )}

      {error && <div className="mt-3"><Err error={error} /></div>}
      {ok && <div className="mt-3"><Ok>{ok}</Ok></div>}
    </div>
  );
}
