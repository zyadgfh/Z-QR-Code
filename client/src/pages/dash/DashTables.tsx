import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../lib/api';
import { dashT } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { useAuth } from '../../stores/auth';
import { Btn, Field, Input, Ok, Spinner } from '../../components/ui';

export default function DashTables() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const me = useAuth((s) => s.me);
  const shop = me?.memberships[0]?.shop;

  const [count, setCount] = useState(shop?.table_count || 5);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!shop) return;
    const origin = window.location.origin;
    const gen: Record<number, string> = {};
    (async () => {
      for (let i = 1; i <= count; i++) {
        gen[i] = await QRCode.toDataURL(`${origin}/${shop.slug}/t/${i}`, { width: 320, margin: 1.5, color: { dark: '#134e4a' } });
      }
      setQrUrls(gen);
    })();
  }, [shop, count]);

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/shop/settings', { method: 'PUT', body: { table_count: count } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      alert(e.message);
    }
    setBusy(false);
  };

  if (!shop) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="no-print rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label={t('tablesCount')}>
              <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
            </Field>
          </div>
          <Btn onClick={save} disabled={busy || count === shop.table_count}>{t('save')}</Btn>
          {saved && <Ok>{t('saved')}</Ok>}
          <Btn variant="dark" className="ms-auto" onClick={() => window.print()}>🖨 {t('print')}</Btn>
        </div>
        <p className="mt-2 text-xs text-stone-400">{t('scanHint')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
          <div key={n} className="print-card rounded-3xl border border-stone-200 bg-white p-4 text-center shadow-sm">
            <p className="mb-1 text-sm font-black text-stone-700">
              {t('table')} {n}
            </p>
            <p className="mb-2 truncate text-[11px] font-bold text-stone-400">{shop.name}</p>
            {qrUrls[n] ? (
              <img src={qrUrls[n]} alt={`QR ${n}`} className="mx-auto aspect-square w-full max-w-[180px]" />
            ) : (
              <div className="mx-auto aspect-square w-full max-w-[180px] animate-pulse rounded-xl bg-stone-100" />
            )}
            <p dir="ltr" className="mt-2 truncate text-[10px] text-stone-300">
              /{shop.slug}/t/{n}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
