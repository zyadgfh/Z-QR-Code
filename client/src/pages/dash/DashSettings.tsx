import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { dashT, fmtDate } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { useAuth, Shop } from '../../stores/auth';
import { compressImage } from '../../lib/img';
import { Btn, Card, CardHead, Err, Field, Input, Ok, Select, Spinner, StatusChip } from '../../components/ui';
import ChangePasswordCard from '../../components/ChangePassword';
import DiscountsCard from '../../components/DiscountsCard';
import BackupCard from '../../components/BackupCard';
import TaxCard from '../../components/TaxCard';
import ReceiptCard from '../../components/ReceiptCard';
import AuditCard from '../../components/AuditCard';
import BranchesCard from '../../components/BranchesCard';
import LoyaltyCard from '../../components/LoyaltyCard';
import { popIn, staggerCards } from '../../lib/anim';

type Summary = {
  shop: Shop;
  my_role: string;
  subscription?: { monthly_price: number; payment_instructions: string };
};

const THEMES = [
  { id: '', emoji: '◻️' },
  { id: 'dark', emoji: '🌙' },
  { id: 'neon', emoji: '✨' },
  { id: 'sunset', emoji: '🌅' },
  { id: 'mono', emoji: '⬜' },
];

const DAY_DATE = new Date(2024, 0, 7);

export default function DashSettings() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const me = useAuth((s) => s.me);
  const loadMe = useAuth((s) => s.loadMe);
  const [summary, setSummary] = useState<Summary | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // هوية المحل
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [menuLang, setMenuLang] = useState<'ar' | 'en'>('ar');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // المظهر
  const [theme, setTheme] = useState<string>('');
  const [brandColor, setBrandColor] = useState<string>('#0f766e');
  // الدوام
  const [hoursOn, setHoursOn] = useState(false);
  const [hours, setHours] = useState<Array<{ open: string; close: string } | null>>(Array(7).fill(null));
  // التوصيل
  const [deliveryFee, setDeliveryFee] = useState('');

  // حالة حفظ لكل قسم — رسائل مستقلة بأسلوب iOS
  const [busy, setBusy] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (summary) staggerCards(wrapRef.current);
  }, [summary]);

  if (!summary) return <Spinner label={t('loading')} />;
  const shop = summary.shop;

  const flashSaved = (key: string) => {
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2500);
  };

  const saveSection = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await api('/api/shop/settings', { method: 'PUT', body });
      await loadMe();
      flashSaved(key);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(null);
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await compressImage(file, 400, 0.85);
      const res = await api<{ url: string }>('/api/shop/uploads', { method: 'POST', body: { dataUrl } });
      setLogoUrl(res.url);
      await saveSection('identity', { logo_url: res.url });
    } catch (e: any) {
      setError(e.message);
    }
    setUploading(false);
  };

  const saved = (key: string) => savedKey === key && <Ok>{t('saved')}</Ok>;

  return (
    <div ref={wrapRef} className="space-y-4">
      {error && <Err error={error} />}

      {/* ---------- هوية المحل ---------- */}
      <Card data-card>
        <CardHead icon="🏪" title={t('secIdentity')} desc={t('identityDesc')} />
        <div className="grid gap-4 sm:grid-cols-2">
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
              {logoUrl && (
                <img
                  ref={(el) => el && popIn(el)}
                  src={logoUrl}
                  alt=""
                  className="h-12 w-12 rounded-2xl border border-stone-100 object-cover shadow-sm"
                />
              )}
              <label className="cursor-pointer rounded-2xl border border-stone-200 px-3.5 py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-50 active:scale-[0.97]">
                {uploading ? t('uploading') : `🖼 ${t('uploadPhoto')}`}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </label>
            </div>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Btn onClick={() => saveSection('identity', { name, phone, menu_language: menuLang, logo_url: logoUrl })} disabled={busy === 'identity'}>
            {busy === 'identity' ? '…' : t('saveThisSection')}
          </Btn>
          {saved('identity')}
        </div>
      </Card>

      {/* ---------- المظهر ---------- */}
      <Card data-card>
        <CardHead icon="🎨" title={t('secAppearance')} desc={t('appearanceDesc')} />
        <Field label={t('themeMenu')}>
          <div className="grid grid-cols-5 gap-2">
            {THEMES.map((th) => (
              <button
                key={th.id}
                onClick={() => setTheme(th.id)}
                className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xl transition-all duration-200 active:scale-95 ${
                  theme === th.id ? 'border-teal-600 bg-teal-50 shadow-sm ring-2 ring-teal-600/20' : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <span>{th.emoji}</span>
                <span className={`text-[10px] font-black ${theme === th.id ? 'text-teal-800' : 'text-stone-400'}`}>{th.id || 'default'}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('brandColor')}>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-11 w-16 cursor-pointer rounded-2xl border border-stone-200 bg-white p-1"
              />
              <span className="flex items-center gap-2 text-sm font-extrabold text-stone-600" dir="ltr">
                <span className="h-5 w-5 rounded-full border border-stone-100 shadow-sm" style={{ backgroundColor: brandColor }} />
                <code className="text-xs font-black text-stone-500">{brandColor.toUpperCase()}</code>
              </span>
            </div>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Btn
            onClick={() =>
              saveSection('appearance', {
                theme: theme || null,
                brand_color: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : null,
              })
            }
            disabled={busy === 'appearance'}
          >
            {busy === 'appearance' ? '…' : t('saveThisSection')}
          </Btn>
          {saved('appearance')}
        </div>
      </Card>

      {/* ---------- مواعيد العمل ---------- */}
      <Card data-card>
        <CardHead icon="⏰" title={t('secHours')} desc={t('hoursDesc')} />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-extrabold text-stone-700">
          <input type="checkbox" checked={hoursOn} onChange={(e) => setHoursOn(e.target.checked)} className="h-4 w-4 accent-teal-700" />
          {t('hoursEnabled')}
        </label>
        {hoursOn && (
          <div className="mt-3 space-y-2">
            {hours.map((d, i) => {
              const dayName = DAY_DATE.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long' });
              return (
                <div key={i} className="flex items-center gap-2 rounded-2xl bg-[#f5f5f7] px-3 py-2">
                  <span className="w-24 shrink-0 text-sm font-extrabold text-stone-600">{dayName}</span>
                  <button
                    onClick={() => setHours((hs) => hs.map((x, xi) => (xi === i ? (x ? null : { open: '09:00', close: '23:00' }) : x)))}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold transition active:scale-95 ${d ? 'bg-teal-700 text-white' : 'bg-white text-stone-400 shadow-sm'}`}
                  >
                    {d ? '✓ مفتوح' : 'مغلق'}
                  </button>
                  {d && (
                    <>
                      <input
                        type="time"
                        value={d.open}
                        onChange={(e) => setHours((hs) => hs.map((x, xi) => (xi === i && x ? { ...x, open: e.target.value } : x)))}
                        className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-sm font-bold"
                        dir="ltr"
                      />
                      <span className="text-stone-300">→</span>
                      <input
                        type="time"
                        value={d.close}
                        onChange={(e) => setHours((hs) => hs.map((x, xi) => (xi === i && x ? { ...x, close: e.target.value } : x)))}
                        className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-sm font-bold"
                        dir="ltr"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Btn onClick={() => saveSection('hours', { hours: hoursOn ? hours : null })} disabled={busy === 'hours'}>
            {busy === 'hours' ? '…' : t('saveThisSection')}
          </Btn>
          {saved('hours')}
        </div>
      </Card>

      {/* ---------- التوصيل ---------- */}
      <Card data-card>
        <CardHead icon="🛵" title={t('secDelivery')} desc={t('deliveryFeeHint')} />
        <Field label={t('deliveryFee')}>
          <div className="flex items-center gap-2 sm:max-w-xs">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              placeholder="0"
              dir="ltr"
            />
            <span className="text-sm font-black text-stone-400">{lang === 'ar' ? 'ج.م' : 'EGP'}</span>
          </div>
        </Field>
        <div className="mt-4 flex items-center gap-2">
          <Btn onClick={() => saveSection('delivery', { delivery_fee: deliveryFee === '' ? 0 : Number(deliveryFee) })} disabled={busy === 'delivery'}>
            {busy === 'delivery' ? '…' : t('saveThisSection')}
          </Btn>
          {saved('delivery')}
        </div>
      </Card>

      {/* ---------- الاشتراك ---------- */}
      <Card data-card>
        <CardHead
          icon="💳"
          title={t('subscription')}
          action={<StatusChip status={shop.status} t={t} />}
        />
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="font-bold text-stone-400">{t('trialEndsAt')}: </span><span className="font-extrabold">{fmtDate(lang, shop.trial_ends_at)}</span></p>
          <p><span className="font-bold text-stone-400">{t('paidUntilAt')}: </span><span className="font-extrabold">{fmtDate(lang, shop.paid_until)}</span></p>
          {summary.subscription && (
            <>
              <p>
                <span className="font-bold text-stone-400">{t('monthlyPrice')}: </span>
                <span className="font-extrabold text-teal-700">{summary.subscription.monthly_price} {lang === 'ar' ? 'ج.م' : 'EGP'}</span>
              </p>
              <p className="rounded-2xl bg-[#f5f5f7] p-3.5 text-xs font-semibold leading-relaxed text-stone-600 sm:col-span-2">
                {summary.subscription.payment_instructions}
              </p>
            </>
          )}
        </div>
      </Card>

      <BranchesCard />
      <LoyaltyCard />
      <TaxCard />
      <ReceiptCard />
      <BackupCard />
      <AuditCard />
      <ChangePasswordCard />
      <DiscountsCard />
    </div>
  );
}
