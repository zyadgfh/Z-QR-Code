import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Card, CardHead, Err, Field, Input, Ok } from './ui';

type Config = { enabled: boolean; earn_per: number; redeem_value: number; max_percent: number };
type Account = { id: string; phone: string; points: number; earned_total: number; redeemed_total: number };

/** الولاء بالنقاط (F-17) — إعداد المحل + أعلى الزبائن رصيدًا؛ الاحتساب خادمي حصريًا */
export default function LoyaltyCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any>('/api/shop/summary')
      .then(async (s) => {
        const l = (s.shop as any).loyalty;
        setCfg(l ? { ...l } : { enabled: false, earn_per: 50, redeem_value: 1, max_percent: 50 });
      })
      .catch((e) => setError(e.message));
    api<Account[]>('/api/shop/loyalty/accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api<any>('/api/shop/settings', { method: 'PUT', body: { loyalty: cfg } });
      setCfg(out.loyalty);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (!cfg) return null;
  return (
    <Card data-card>
      <CardHead icon="🎁" title={t('loyalty')} desc={t('loyaltyDesc')} />
      {error && <Err error={error} />}
      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-extrabold text-stone-700">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          className="h-4 w-4 accent-teal-700"
        />
        {t('loyaltyEnable')}
      </label>
      {cfg.enabled && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label={t('loyaltyEarnPer')}>
            <Input type="number" min={1} step="0.5" dir="ltr" value={cfg.earn_per} onChange={(e) => setCfg({ ...cfg, earn_per: Number(e.target.value) })} />
          </Field>
          <Field label={t('loyaltyRedeemValue')}>
            <Input type="number" min={0.1} step="0.1" dir="ltr" value={cfg.redeem_value} onChange={(e) => setCfg({ ...cfg, redeem_value: Number(e.target.value) })} />
          </Field>
          <Field label={t('loyaltyMaxPercent')}>
            <Input type="number" min={5} max={100} dir="ltr" value={cfg.max_percent} onChange={(e) => setCfg({ ...cfg, max_percent: Number(e.target.value) })} />
          </Field>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2">
        <Btn onClick={save} disabled={busy}>{busy ? '…' : t('saveThisSection')}</Btn>
        {saved && <Ok>{t('saved')}</Ok>}
      </div>

      {accounts && accounts.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-4">
          <p className="mb-2 text-xs font-black text-stone-400">🏆 {t('loyaltyAccounts')}</p>
          <ul className="space-y-1.5">
            {accounts.slice(0, 8).map((a) => (
              <li key={a.id} data-card className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] px-3 py-2">
                <span className="text-sm font-bold text-stone-600" dir="ltr">{a.phone}</span>
                <span className="ms-auto rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-black text-teal-800" dir="ltr">{a.points} ⭐</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
