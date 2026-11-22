import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Card, CardHead, Err, Field, Ok, Textarea } from './ui';
import { toast } from '../lib/toast';

/** قالب الإيصال (الطور 5): ختامية تُطبع أسفل إيصال كل طلب */
export default function ReceiptCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any>('/api/shop/settings')
      .then((s) => setNote(String(s.receipt_note ?? '')))
      .catch((e) => setError(e.message));
  }, []);

  const save = async () => {
    if (note === null) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/shop/settings', { method: 'PUT', body: { receipt_note: note } });
      setSaved(true);
      toast(t('receiptSavedToast'));
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (note === null) return null;
  return (
    <Card data-card>
      <CardHead icon="🖨" title={t('receiptTitle')} desc={t('receiptDesc')} />
      <Field label={t('receiptNote')}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder={t('receiptPh')} />
      </Field>
      <div className="mt-3 flex items-center gap-2">
        <Btn onClick={save} disabled={busy}>{busy ? '…' : t('saveThisSection')}</Btn>
        {saved && <Ok>{t('saved')}</Ok>}
      </div>
      {error && <Err error={error} />}
    </Card>
  );
}
