import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Err, Field, Input, Ok } from './ui';

type Setup = { secret: string; otpauth: string };

/**
 * بوابة التفعيل الإلزامي للتحقق بخطوتين (SEC-03) — تُعرض لحساب owner/platform_admin
 * قبل الوصول للوحة، ويعاد استخدام تدفقها في بطاقة الأمان للموظفين (prop variant="card").
 */
export default function MfaGate({ variant = 'gate' }: { variant?: 'gate' | 'card' }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const setToken = useAuth((s) => s.setToken);
  const loadMe = useAuth((s) => s.loadMe);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api<Setup>('/api/auth/2fa/setup', { method: 'POST' });
      setSetup(s);
      setQr(await QRCode.toDataURL(s.otpauth, { width: 200, margin: 1 }));
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  useEffect(() => {
    // البوابة الإلزامية (SEC-03/Q7) تبدأ الإعداد تلقائيًا — كان يبدأ فقط في وضع البطاقة
    // فعلِقت بوابة الإنتاج على «…» بلا زر (أُكتشف في أول دخول إنتاجي فعلي).
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; recovery_codes: string[]; token: string }>('/api/auth/2fa/verify', {
        method: 'POST',
        body: { code },
      });
      setToken(res.token);
      setRecovery(res.recovery_codes);
      setOkMsg(null);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const finish = async () => {
    await loadMe(); // يحدّث mfa_enabled فتختفي البوابة
  };

  const copyAll = async () => {
    if (!recovery) return;
    try {
      await navigator.clipboard.writeText(recovery.join('\n'));
      setOkMsg(t('mfaCopied'));
    } catch {
      /* الحافظة ممنوعة — النسخ اليدوي متاح */
    }
  };

  const shell = variant === 'gate' ? 'min-h-dvh flex items-center justify-center bg-[#f5f5f7] p-4' : '';

  if (recovery) {
    return (
      <div className={shell}>
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-apple">
          <h2 className="text-lg font-extrabold text-stone-900">🔑 {t('mfaRecoveryTitle')}</h2>
          <p className="mt-1 text-sm text-stone-500">{t('mfaRecoveryDesc')}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#f5f5f7] p-4" dir="ltr">
            {recovery.map((c) => (
              <code key={c} className="font-mono text-sm font-bold text-teal-800">{c}</code>
            ))}
          </div>
          {okMsg && <div className="mt-2"><Ok>{okMsg}</Ok></div>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Btn variant="ghost" onClick={copyAll}>⧉</Btn>
            <label className="flex items-center gap-2 text-sm font-bold text-stone-600">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 accent-teal-700" />
              {t('mfaSaved')}
            </label>
            <Btn disabled={!confirmed} onClick={finish} className="ms-auto">
              {t('mfaContinue')}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-apple">
        <h2 className="text-lg font-extrabold text-stone-900">🔐 {t('mfaGateTitle')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-500">{t('mfaGateDesc')}</p>
        {qr && setup && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <img src={qr} alt="TOTP QR" className="rounded-2xl border border-black/5" width={200} height={200} />
            <div className="text-center">
              <p className="text-xs font-bold text-stone-400">{t('mfaManual')}</p>
              <code className="mt-1 block break-all rounded-xl bg-[#f5f5f7] px-3 py-2 font-mono text-xs text-stone-700" dir="ltr">
                {setup.secret}
              </code>
            </div>
            <div className="w-full">
              <Field label={t('mfaChallenge')}>
                <Input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </Field>
            </div>
            {error && <Err error={error} />}
            <Btn disabled={busy || code.length !== 6} onClick={verify} className="w-full py-2.5">
              {t('mfaEnable')}
            </Btn>
          </div>
        )}
        {!qr && error && (
          <div className="mt-3">
            <Err error={error} />
            <Btn onClick={start} disabled={busy} className="mt-3 w-full">
              {t('mfaEnable')}
            </Btn>
          </div>
        )}
        {!qr && !error && variant === 'gate' && <p className="mt-4 text-sm text-stone-400">{busy ? '…' : ''}</p>}
      </div>
    </div>
  );
}
