import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { dashT, fmtDate } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { useAuth, Shop } from '../../stores/auth';
import { compressImage } from '../../lib/img';
import { Btn, Err, Field, Input, Ok, Select, Spinner, StatusChip } from '../../components/ui';
import ChangePasswordCard from '../../components/ChangePassword';
import DiscountsCard from '../../components/DiscountsCard';

type Summary = {
  shop: Shop;
  my_role: string;
  subscription?: { monthly_price: number; payment_instructions: string };
};

export default function DashSettings() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const me = useAuth((s) => s.me);
  const loadMe = useAuth((s) => s.loadMe);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [menuLang, setMenuLang] = useState<'ar' | 'en'>('ar');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // مواعيد العمل (F-05) + الثيم ولون الهوية (MKT-03)
  const [hoursOn, setHoursOn] = useState(false);
  const [hours, setHours] = useState<Array<{ open: string; close: string } | null>>(Array(7).fill(null));
  const [theme, setTheme] = useState<string>('');
  const [brandColor, setBrandColor] = useState<string>('#0f766e');
  const [deliveryFee, setDeliveryFee] = useState('');

  useEffect(() => {
    api<Summary>('/api/shop/summary').then((s) => {
      setSummary(s);
      setName(s.shop.name);
      setPhone(s.shop.phone);
      setMenuLang(s.shop.menu_language);
      setLogoUrl(s.shop.logo_url);
      const h = (s.shop as any).hours as Array<{ open: string; close: string } | null> | null;
      if (Array.isArray(h) && h.length === 7) {
        setHoursOn(true);
        setHours(h.map((d) => (d ? { ...d } : null)));
      }
      setTheme((s.shop as any).theme || '');
      setBrandColor((s.shop as any).brand_color || '#0f766e');
      setDeliveryFee(String((s.shop as any).delivery_fee ?? ''));
    });
  }, []);

  if (!summary) return <Spinner label={t('loading')} />;
  const shop = summary.shop;

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await compressImage(file, 400, 0.85);
      const res = await api<{ url: string }>('/api/shop/uploads', { method: 'POST', body: { dataUrl } });
      setLogoUrl(res.url);
    } catch (e: any) {
      setError(e.message);
    }
    setUploading(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/shop/settings', {
        method: 'PUT',
        body: {
          name,
          phone,
          menu_language: menuLang,
          logo_url: logoUrl,
          hours: hoursOn ? hours : null,
          theme: theme || null,
          brand_color: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : null,
          delivery_fee: deliveryFee === '' ? 0 : Number(deliveryFee),
        },
      });
      await loadMe();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-black text-stone-400">⚙️ {t('settings')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('shopName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('phone')}><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" /></Field>
          <Field label={t('menuLanguage')}>
            <Select value={menuLang} onChange={(e) => setMenuLang(e.target.value as 'ar' | 'en')}>
              <option value="ar">العربية (RTL)</option>
              <option value="en">English (LTR)</option>
            </Select>
          </Field>
          <Field label={t('logo')}>
            <div className="flex items-center gap-3">
              {logoUrl && <img src={logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />}
              <label className="cursor-pointer rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50">
                {uploading ? t('uploading') : `🖼 ${t('uploadPhoto')}`}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </label>
            </div>
          </Field>
        </div>
        {error && <Err error={error} />}
        <div className="mt-3 flex items-center gap-2">
          <Btn onClick={save} disabled={busy}>{t('save')}</Btn>
          {saved && <Ok>{t('saved')}</Ok>}
        </div>
        <p className="mt-2 text-[11px] font-bold text-stone-400">ℹ️ {t('phone')}</p>

        {/* رسوم التوصيل (F-11) */}
        <div className="mt-4 border-t border-stone-100 pt-4">
          <Field label={t('deliveryFee')}>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        {/* الثيم ولون الهوية */}
        <div className="mt-4 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-2">
          <Field label={t('themeMenu')}>
            <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">{t('themeDefault')}</option>
              <option value="dark">🌙 Dark</option>
              <option value="neon">✨ Neon</option>
              <option value="sunset">🌅 Sunset</option>
              <option value="mono">◻ Mono</option>
            </Select>
          </Field>
          <Field label={t('brandColor')}>
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-xl border border-stone-300 bg-white p-1"
            />
          </Field>
        </div>

        {/* مواعيد العمل الأسبوعية */}
        <div className="mt-4 border-t border-stone-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-extrabold text-stone-700">
            <input type="checkbox" checked={hoursOn} onChange={(e) => setHoursOn(e.target.checked)} className="h-4 w-4 accent-teal-700" />
            ⏰ {t('hoursEnabled')}
          </label>
          <p className="mt-1 text-xs text-stone-400">{t('hoursDesc')}</p>
          {hoursOn && (
            <div className="mt-3 space-y-1.5">
              {hours.map((d, i) => {
                const dayName = new Date(2024, 0, 7 + i).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long' });
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-sm font-extrabold text-stone-600">{dayName}</span>
                    <button
                      onClick={() => setHours((hs) => hs.map((x, xi) => (xi === i ? (x ? null : { open: '09:00', close: '23:00' }) : x)))}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${d ? 'bg-teal-50 text-teal-700' : 'bg-stone-100 text-stone-400'}`}
                    >
                      {d ? '✓' : t('closedDay')}
                    </button>
                    {d && (
                      <>
                        <input
                          type="time"
                          value={d.open}
                          onChange={(e) => setHours((hs) => hs.map((x, xi) => (xi === i && x ? { ...x, open: e.target.value } : x)))}
                          className="rounded-xl border border-stone-300 px-2 py-1.5 text-sm"
                          dir="ltr"
                        />
                        <span className="text-stone-400">→</span>
                        <input
                          type="time"
                          value={d.close}
                          onChange={(e) => setHours((hs) => hs.map((x, xi) => (xi === i && x ? { ...x, close: e.target.value } : x)))}
                          className="rounded-xl border border-stone-300 px-2 py-1.5 text-sm"
                          dir="ltr"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-stone-400">💳 {t('subscription')}</h3>
          <StatusChip status={shop.status} t={t} />
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="font-bold text-stone-500">{t('trialEndsAt')}: </span><span className="font-extrabold">{fmtDate(lang, shop.trial_ends_at)}</span></p>
          <p><span className="font-bold text-stone-500">{t('paidUntilAt')}: </span><span className="font-extrabold">{fmtDate(lang, shop.paid_until)}</span></p>
          {summary.subscription && (
            <>
              <p><span className="font-bold text-stone-500">{t('monthlyPrice')}: </span><span className="font-extrabold text-teal-700">{summary.subscription.monthly_price} {lang === 'ar' ? 'ج.م' : 'EGP'}</span></p>
              <p className="sm:col-span-2 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">{summary.subscription.payment_instructions}</p>
            </>
          )}
        </div>
      </div>

      <ChangePasswordCard />
      <DiscountsCard />
    </div>
  );
}
