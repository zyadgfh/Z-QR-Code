import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Card, CardHead, Err, Field, Input, Ok } from './ui';
import { toast } from '../lib/toast';

/**
 * الدومين المخصص (MKT-02): ربط cafe.example.com بالمحل بعد إثبات الملكية
 * بسجل DNS TXT. التحذير الصريح: تغيير الدومين يعني إعادة طباعة كل QR.
 */
type DomainState = { custom_domain: string | null; domain_status: string | null; domain_token: string | null };

export default function DomainCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [state, setState] = useState<DomainState | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DomainState>('/api/shop/domain')
      .then((s) => {
        setState(s);
        setDraft(s.custom_domain || '');
      })
      .catch(() => {}); // لا صلاحية settings — البطاقة تخفى بصمت
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api<DomainState>('/api/shop/domain', { method: 'PUT', body: { domain: draft.trim() } });
      setState(s);
      setSaved(true);
      toast(t('domainSavedToast'));
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api<DomainState & { vercel_attached?: boolean }>('/api/shop/domain/verify', { method: 'POST' });
      setState({ custom_domain: s.custom_domain, domain_status: s.domain_status, domain_token: state?.domain_token ?? null });
      if (s.domain_status === 'verified') {
        setVerified(true);
        toast(t('domainVerifiedToast'));
        setTimeout(() => setVerified(false), 2500);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api<DomainState>('/api/shop/domain', { method: 'PUT', body: { domain: null } });
      setState(s);
      setDraft('');
      toast(t('domainRemovedToast'));
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const copyToken = async () => {
    if (!state?.domain_token) return;
    await navigator.clipboard.writeText(`z-qr-code=${state.domain_token}`);
    toast(t('copied'));
  };

  if (state === null) return null;
  const st = state.domain_status;
  return (
    <Card data-card>
      <CardHead icon="🌐" title={t('domainTitle')} desc={t('domainDesc')} />
      <Field label={t('domainLabel')}>
        <Input
          dir="ltr"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="cafe.example.com"
          disabled={st === 'verified'}
        />
      </Field>
      {st === 'verified' && (
        <div className="mt-2 flex items-center gap-2 text-sm font-bold text-green-700">
          <span className="rounded-full bg-green-50 px-2.5 py-0.5">✓ {t('domainVerified')}</span>
          <span dir="ltr" className="text-stone-500">https://{state.custom_domain}</span>
        </div>
      )}
      {st === 'pending' && (
        <div className="mt-2 rounded-2xl bg-amber-50 p-3 text-sm text-stone-700">
          <p className="font-bold text-stone-800">{t('domainPending')}</p>
          <p className="mt-1">{t('domainAddRecord')}</p>
          <div dir="ltr" className="mt-2 space-y-1 rounded-xl bg-white p-2.5 font-mono text-xs text-stone-700">
            <p><span className="font-bold">Host:</span> _z-qr-verify.{state.custom_domain}</p>
            <p><span className="font-bold">Type:</span> TXT</p>
            <p className="flex items-center gap-2">
              <span><span className="font-bold">Value:</span> z-qr-code={state.domain_token}</span>
              <button type="button" onClick={copyToken} className="rounded-lg bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">{t('domainCopy')}</button>
            </p>
          </div>
          <p className="mt-2 text-xs text-stone-500">{t('domainPropagNote')}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {st !== 'verified' ? (
          <>
            <Btn onClick={save} disabled={busy}>{busy ? '…' : t('domainSave')}</Btn>
            {st === 'pending' && <Btn variant="dark" onClick={verify} disabled={busy}>{t('domainVerify')}</Btn>}
          </>
        ) : (
          <Btn variant="ghost" onClick={remove} disabled={busy}>{t('domainRemove')}</Btn>
        )}
        {saved && <Ok>{t('saved')}</Ok>}
        {verified && <Ok>{t('domainVerified')}</Ok>}
      </div>
      <p className="mt-2 text-xs font-bold text-amber-600">⚠️ {t('domainReprintWarn')}</p>
      {error && <Err error={error} />}
    </Card>
  );
}
