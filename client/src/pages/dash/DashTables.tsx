import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../lib/api';
import { dashT } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { useAuth } from '../../stores/auth';
import { Btn, Field, Input, Ok, Select, Spinner } from '../../components/ui';
import { staggerCards } from '../../lib/anim';

type Style = 'classic' | 'bold' | 'minimal';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** تركيب بطاقة طاولة جاهزة للطباعة (F-03): نمط + لون هوية + شعار المحل */
async function composeCard(opts: { style: Style; brand: string; logoUrl: string | null; shopName: string; table: number; slug: string; langWord: string }): Promise<Blob | null> {
  const { style, brand, logoUrl, shopName, table, slug, langWord } = opts;
  const origin = window.location.origin;
  const qr = await QRCode.toDataURL(`${origin}/${slug}/t/${table}`, { width: 640, margin: 1, color: { dark: '#134e4a' } });
  const qrImg = new Image();
  qrImg.src = qr;
  await qrImg.decode();

  const logo = logoUrl ? new Image() : null;
  if (logo && logoUrl) {
    logo.src = logoUrl;
    try {
      await logo.decode();
    } catch {
      /* شعار تالف — نتجاهله */
    }
  }

  const W = 900;
  const H = 1200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const dark = '#134e4a';
  if (style === 'bold') {
    ctx.fillStyle = brand;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    rr(ctx, 60, 330, W - 120, 660, 44);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 74px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(shopName, W / 2, 130);
    ctx.font = '800 52px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(`${langWord} ${table}`, W / 2, 230);
    ctx.drawImage(qrImg, 150, 390, 600, 600);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = '600 26px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(`/${slug}/t/${table}`, W / 2, 1055);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(langWord === 'Table' ? 'Scan to order' : 'امسح للطلب', W / 2, 1130);
  } else if (style === 'minimal') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = brand;
    ctx.lineWidth = 6;
    rr(ctx, 28, 28, W - 56, H - 56, 40);
    ctx.stroke();
    ctx.drawImage(qrImg, 170, 210, 560, 560);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1c1917';
    ctx.font = '800 56px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(`${langWord} ${table}`, W / 2, 860);
    ctx.fillStyle = '#78716c';
    ctx.font = '700 34px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(shopName, W / 2, 130);
    ctx.font = '600 24px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(`/${slug}/t/${table}`, W / 2, 930);
  } else {
    // classic: شريط علوي بلون الهوية + شعار + QR على أبيض
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = brand;
    ctx.fillRect(0, 0, W, 210);
    if (logo && logo.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, 300, 78, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.clip();
      const ratio = Math.max(156 / logo.naturalWidth, 156 / logo.naturalHeight);
      const lw = logo.naturalWidth * ratio;
      const lh = logo.naturalHeight * ratio;
      ctx.drawImage(logo, W / 2 - lw / 2, 300 - lh / 2, lw, lh);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 54px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(shopName, W / 2, 110);
    ctx.font = '800 44px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(`${langWord} ${table}`, W / 2, 170);
    ctx.drawImage(qrImg, 170, 430, 560, 560);
    ctx.fillStyle = dark;
    ctx.font = '800 46px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(langWord === 'Table' ? 'Scan to order' : 'امسح للطلب', W / 2, 1055);
    ctx.fillStyle = '#a8a29e';
    ctx.font = '600 22px -apple-system, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(`/${slug}/t/${table}`, W / 2, 1105);
  }

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

export default function DashTables() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const me = useAuth((s) => s.me);
  const shop = me?.memberships[0]?.shop;
  const brand = (shop as any)?.brand_color || '#0f766e';
  const logoUrl = shop?.logo_url || null;

  const [count, setCount] = useState(shop?.table_count || 5);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});
  const [style, setStyle] = useState<Style>(() => (localStorage.getItem('qm-qr-style') as Style) || 'classic');
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    staggerCards(gridRef.current);
  }, [count]);
  const [dl, setDl] = useState<number | null>(null);

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

  useEffect(() => {
    localStorage.setItem('qm-qr-style', style);
  }, [style]);

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

  const downloadOne = async (n: number) => {
    if (!shop) return;
    setDl(n);
    const blob = await composeCard({
      style,
      brand,
      logoUrl: style === 'classic' ? logoUrl : null,
      shopName: shop.name,
      table: n,
      slug: shop.slug,
      langWord: lang === 'ar' ? 'ترابيزة' : 'Table',
    });
    if (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qr-${shop.slug}-${n}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setDl(null);
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
          <div className="w-44">
            <Field label={t('qrStyle')}>
              <Select value={style} onChange={(e) => setStyle(e.target.value as Style)}>
                <option value="classic">{t('qrClassic')}</option>
                <option value="bold">{t('qrBold')}</option>
                <option value="minimal">{t('qrMinimal')}</option>
              </Select>
            </Field>
          </div>
          <Btn onClick={save} disabled={busy || count === shop.table_count}>{t('save')}</Btn>
          {saved && <Ok>{t('saved')}</Ok>}
          <Btn variant="dark" className="ms-auto" onClick={() => window.print()}>🖨 {t('print')}</Btn>
        </div>
        <p className="mt-2 text-xs text-stone-400">{t('scanHint')}</p>
      </div>

      <div ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            data-card
            className="print-card rounded-3xl border bg-white p-4 text-center shadow-sm"
            style={{ borderColor: style === 'bold' ? brand : '#e7e5e4', borderTopWidth: style === 'bold' ? 8 : 1 }}
          >
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
            <button
              onClick={() => downloadOne(n)}
              disabled={dl !== null}
              className="no-print mt-2 w-full rounded-xl bg-stone-100 px-2 py-1.5 text-xs font-extrabold text-stone-600 transition hover:bg-stone-200"
            >
              {dl === n ? t('downloading') : `⬇ ${t('downloadPng')}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
