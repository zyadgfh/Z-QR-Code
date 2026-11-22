import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Err, Field, Input, Ok } from './ui';
import { fadeInUp, popIn } from '../lib/anim';

type Setup = { secret: string; otpauth: string };

/** كرات الضوء المحيطية (Liquid Glass) — زخرفة معلنة aria-hidden تتوقف مع reduced-motion */
function Ambient() {
  return (
    <>
      <div className="auth-orb auth-orb--teal" aria-hidden />
      <div className="auth-orb auth-orb--mint" aria-hidden />
      <div className="auth-orb auth-orb--indigo" aria-hidden />
    </>
  );
}

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
  const cardRef = useRef<HTMLDivElement | null>(null);
  const qrRef = useRef<HTMLDivElement | null>(null);
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
    const mm = fadeInUp(cardRef.current);
    start();
    return () => mm?.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (qr) popIn(qrRef.current);
  }, [qr]);

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

  const shell = variant === 'gate' ? 'auth-ambient relative flex min-h-dvh items-center justify-center overflow-hidden p-4' : '';
  const glass = variant === 'gate' ? 'auth-glass relative z-10 rounded-[28px] p-8' : 'rounded-3xl bg-white p-7 shadow-apple';

  if (recovery) {
    return (
      <div className={shell}>
        {variant === 'gate' && <Ambient />}
        <div className={`${glass} w-full max-w-md`}>
          <h2 className="text-lg font-extrabold text-stone-900">🔑 {t('mfaRecoveryTitle')}</h2>
          <p className="mt-1 text-sm text-stone-500">{t('mfaRecoveryDesc')}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#f5f5f7] p-4 ring-1 ring-black/5" dir="ltr">
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
      {variant === 'gate' && <Ambient />}
      <div ref={cardRef} className={`${glass} w-full max-w-md`}>
        <div className="mb-5 text-center">
          <div className="relative mx-auto mb-4 h-16 w-16">
            <div className="absolute inset-0 scale-125 rounded-full bg-teal-400/40 blur-lg" aria-hidden />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-teal-500 to-teal-700 text-2xl text-white ring-1 ring-white/40 shadow-apple">🔐</div>
          </div>
          <h2 className="text-[26px] font-black tracking-tight text-stone-900">{t('mfaGateTitle')}</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-stone-500">{t('mfaGateDesc')}</p>
        </div>
        {qr && setup && (
          <div ref={qrRef} className="mt-4 flex flex-col items-center gap-3">
            <img src={qr} alt="TOTP QR" className="rounded-[1.4rem] bg-white p-2.5 shadow-apple ring-1 ring-black/5" width={200} height={200} />
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
            <Btn disabled={busy || code.length !== 6} onClick={verify} variant="dark" className="w-full py-3">
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
