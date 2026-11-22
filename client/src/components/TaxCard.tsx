import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Card, CardHead, Err, Field, Input, Ok } from './ui';
import { toast } from '../lib/toast';

/** الضريبة (D8): نسبة 0..30% تُطبق خادميًا على القيمة الخاضعة (المجموع − الخصومات) */
export default function TaxCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any>('/api/shop/settings')
      .then((s) => setPct(Number(s.tax_percent ?? 0)))
      .catch((e) => setError(e.message));
  }, []);

  const save = async () => {
    if (pct === null) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api<any>('/api/shop/settings', { method: 'PUT', body: { tax_percent: pct } });
      setPct(Number(out.tax_percent ?? 0));
      setSaved(true);
      toast(t('taxSavedToast'));
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (pct === null) return null;
  return (
    <Card data-card>
      <CardHead icon="🧾" title={t('taxTitle')} desc={t('taxDesc')} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label={`${t('taxPercent')} (0-30)`}>
            <Input type="number" min={0} max={30} step="0.5" dir="ltr" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
          </Field>
        </div>
        <Btn onClick={save} disabled={busy}>{busy ? '…' : t('saveThisSection')}</Btn>
        {saved && <Ok>{t('saved')}</Ok>}
      </div>
      {error && <Err error={error} />}
    </Card>
  );
}
