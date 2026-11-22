import { useState } from 'react';
import { api, API_BASE } from '../lib/api';
import { useAuth } from '../stores/auth';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Card, CardHead, Err, Ok } from './ui';
import { toast } from '../lib/toast';

/** النسخة الاحتياطية (D6): تنزيل JSON كامل للمحل — مالك فقط (الاستعادة لاحقًا) */
export default function BackupCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = useAuth.getState().token;
      const res = await fetch(`${API_BASE}/api/shop/export`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('http');
      const blob = await res.blob();
      const slug = res.headers.get('content-disposition')?.match(/shop-([a-z0-9-]+)-/)?.[1] || 'shop';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `shop-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setDone(true);
      toast(t('backupDoneToast'));
      setTimeout(() => setDone(false), 2500);
    } catch (e: any) {
      setError(e.message || 'error');
    }
    setBusy(false);
  };

  return (
    <Card data-card>
      <CardHead icon="🗄️" title={t('backupTitle')} desc={t('backupDesc')} />
      <div className="flex items-center gap-2">
        <Btn variant="soft" onClick={download} disabled={busy}>{busy ? '…' : `⬇ ${t('backupBtn')}`}</Btn>
        {done && <Ok>{t('saved')}</Ok>}
      </div>
      {error && <Err error={error} />}
      <p className="mt-2 text-[11px] font-bold text-stone-400">{t('backupNote')}</p>
    </Card>
  );
}
