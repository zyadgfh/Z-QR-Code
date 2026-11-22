import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { custT, money, Lang } from '../../lib/i18n';
import { Spinner } from '../../components/ui';
import { popIn, haloPulse } from '../../lib/anim';

type Status = {
  id: string;
  state: 'waiting' | 'accepted';
  eta_minutes: number | null;
  created_at: number;
  table_number: number;
  service?: 'dine_in' | 'takeaway' | 'delivery';
  branch_name: string | null;
  customer_phone: string | null;
  points_earned?: number;
  loyalty_discount: number;
  tip: number;
  tax_percent: number;
  tax_total: number;
  rating: { stars: number; comment: string } | null;
  total: number;
  items: { name: string; name_en: string | null; qty: number; unit_price: number; options: { group_name: string; option_name: string; price_delta: number }[]; line_total: number }[];
  note: string;
  shop: { name: string; phone: string; menu_language: Lang } | null;
};

/** متابعة حالة الطلب — العميل يرى الانتظار أو القبول بالوقت المتوقع فقط،
 *  وبعد 3 دقائق بلا قبول تظهر رسالة الانشغال برقم المحل (الطلب يظل صالحًا). */
export default function OrderStatus() {
  const { slug = '', orderId = '' } = useParams();
  const [st, setSt] = useState<Status | null>(null);
  const [gone, setGone] = useState(false);
  const [now, setNow] = useState(Date.now());
  // تسجيل هاتف الزبون الجالس (F-17) لكسب النقاط
  const [regPhone, setRegPhone] = useState('');
  const [phoneSaved, setPhoneSaved] = useState(false);
  // تقييم الطلب (D6) — مرة واحدة
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [rateSent, setRateSent] = useState(false);
  const [rateErr, setRateErr] = useState<string | null>(null);

  const checkRef = useRef<HTMLParagraphElement>(null);
  const busyRef = useRef<HTMLDivElement>(null);
  const pulsedBusy = useRef(false);
  const pulseMM = useRef<{ revert: () => void } | null>(null);
  const poppedCheck = useRef(false);

  const lang = (st?.shop?.menu_language || 'ar') as Lang;
  const t = custT(lang);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Status>(`/api/public/orders/${orderId}`)
        .then((d) => alive && setSt(d))
        .catch(() => alive && setGone(true));
    load();
    const poll = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [orderId]);

  const elapsedSec = Math.floor((now - (st?.created_at || now)) / 1000);
  const showBusy = st?.state === 'waiting' && elapsedSec >= 180;

  // نبضة هالة على بطاقة الانشغال + نبضة مرنة لأيقونة النجاح
  useEffect(() => {
    if (showBusy && !pulsedBusy.current) {
      pulsedBusy.current = true;
      pulseMM.current = busyRef.current ? haloPulse(busyRef.current) : null;
    }
    if (st?.state === 'accepted' && !poppedCheck.current) {
      poppedCheck.current = true;
      const mm = popIn(checkRef.current);
      return () => mm?.revert();
    }
  }, [showBusy, st?.state]);
  useEffect(() => () => pulseMM.current?.revert(), []);

  if (gone)
    return (
      <div dir="rtl" className="flex min-h-dvh items-center justify-center bg-[#f5f5f7] p-6 text-center">
        <p className="font-bold text-stone-500">لم يتم العثور على هذا الطلب</p>
      </div>
    );
  if (!st) return <Spinner />;

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="mx-auto min-h-dvh max-w-lg bg-[#f5f5f7] pb-10">
      <header className="glass sticky top-0 z-30 flex items-center gap-3 px-4 py-3">
        <Link to={`/${slug}${st.table_number ? `/t/${st.table_number}` : ''}`} className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-stone-600 shadow-sm backdrop-blur">
          ‹ {t('back')}
        </Link>
        <h1 className="flex-1 text-[17px] font-extrabold text-stone-900">{st.shop?.name}</h1>
        {st.branch_name && (
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-extrabold text-stone-600 shadow-sm backdrop-blur">
            🏢 {st.branch_name}
          </span>
        )}
        <span className="rounded-full bg-teal-700 px-3 py-1 text-xs font-extrabold text-white">
          {st.table_number ? `${t('table')} ${st.table_number}` : st.service === 'delivery' ? '🛵' : st.service === 'takeaway' ? '🥡' : ''}
        </span>
      </header>

      <div className="p-4">
        <div
          ref={busyRef}
          className={`rounded-[28px] border p-6 text-center shadow-apple ${
            showBusy ? 'border-amber-200 bg-amber-50' : st.state === 'waiting' ? 'border-black/[0.04] bg-white' : 'border-transparent bg-gradient-to-b from-teal-600 to-teal-800 text-white'
          }`}
        >
          {st.state === 'waiting' ? (
            <>
              {!showBusy && (
                <>
                  <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-[3px] border-stone-200 border-t-teal-700" />
                  <p className="text-lg font-extrabold text-stone-700">{t('waiting')}</p>
                </>
              )}
              {showBusy && (
                <>
                  <p className="mb-3 text-3xl">📞</p>
                  <p className="text-lg font-extrabold text-amber-900">{custT(lang)('busy', { phone: st.shop?.phone || '' })}</p>
                </>
              )}
            </>
          ) : (
            <>
              <p ref={checkRef} className="mb-2 text-4xl">✅</p>
              <p className="text-lg font-extrabold">{custT(lang)('accepted', { n: st.eta_minutes ?? '?' })}</p>
            </>
          )}
        </div>

        {/* ملخص الطلب */}
        <div className="mt-4 rounded-[22px] border border-black/[0.04] bg-white p-4 shadow-apple">
          <h2 className="mb-2 text-sm font-extrabold text-stone-500">{t('yourOrder')}</h2>
          <div className="space-y-1.5">
            {st.items.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-bold text-stone-800">
                    {it.qty} × {lang === 'en' && it.name_en ? it.name_en : it.name}
                  </span>
                  {it.options.length > 0 && (
                    <span className="block text-xs text-stone-400">
                      {it.options.map((o) => o.option_name).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-bold text-stone-600">{money(lang, it.line_total)}</span>
              </div>
            ))}
          </div>
          {st.note && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">📝 {st.note}</p>}
          {st.loyalty_discount > 0 && (
            <div className="mt-2 flex justify-between text-sm font-bold text-teal-700">
              <span>⭐ {t('loyaltyDiscount')}</span>
              <span>− {money(lang, st.loyalty_discount)}</span>
            </div>
          )}
          {st.tax_total > 0 && (
            <div className="mt-2 flex justify-between text-sm font-bold text-stone-500">
              <span>🧾 {t('taxRow')} ({st.tax_percent}%)</span>
              <span>{money(lang, st.tax_total)}</span>
            </div>
          )}
          {st.tip > 0 && (
            <div className="mt-2 flex justify-between text-sm font-bold text-stone-500">
              <span>💖 {t('tipTitle')}</span>
              <span>{money(lang, st.tip)}</span>
            </div>
          )}
          {st.total !== lineSum(st) && (
            <div className="mt-2 flex justify-between text-sm font-bold text-stone-500">
              <span>{t('subtotalRow')}</span>
              <span>{money(lang, lineSum(st))}</span>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-stone-100 pt-2 font-extrabold text-stone-900">
            <span>{t('total')}</span>
            <span>{money(lang, st.total)}</span>
          </div>
          {(st.points_earned || 0) > 0 && (
            <div className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-center text-xs font-black text-teal-800" dir="auto">
              ⭐ +{st.points_earned} {t('pointsEarnedHere')}
            </div>
          )}
        </div>

        {/* تسجيل الهاتف للزبون الجالس — لكسب نقاط الولاء */}
        {st.table_number > 0 && !st.customer_phone && !phoneSaved && (
          <div className="mt-4 rounded-[22px] border border-black/[0.04] bg-white p-4 shadow-apple">
            <p className="mb-2 text-sm font-extrabold text-stone-700">⭐ {t('phoneRegTitle')}</p>
            <div className="flex gap-2">
              <input
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value.slice(0, 20))}
                placeholder={t('customerPhone')}
                inputMode="tel"
                dir="ltr"
                className="flex-1 rounded-2xl border border-stone-200 p-2.5 text-sm outline-none focus:border-teal-600"
              />
              <button
                onClick={async () => {
                  if (regPhone.trim().length < 6) return;
                  try {
                    await api(`/api/public/orders/${orderId}/phone`, { method: 'PUT', body: { phone: regPhone.trim() } });
                    setPhoneSaved(true);
                  } catch {
                    /* تجاهل — المحاولة لاحقًا */
                  }
                }}
                className="rounded-2xl bg-teal-700 px-4 text-sm font-extrabold text-white transition active:scale-95"
              >
                {t('save')}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] font-bold text-stone-400">{t('phoneRegNote')}</p>
          </div>
        )}
        {phoneSaved && (
          <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-center text-xs font-black text-teal-800">✓ {t('phoneSaved')}</p>
        )}

        {/* تقييم الطلب (D6) — يظهر بعد قبول الطلب */}
        {st.state === 'accepted' && !st.rating && !rateSent && (
          <div className="mt-4 rounded-[22px] border border-black/[0.04] bg-white p-4 shadow-apple">
            <p className="mb-2 text-sm font-extrabold text-stone-700">{t('rateTitle')}</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setStars(n)}
                  className={`text-2xl transition active:scale-90 ${n <= stars ? 'text-amber-400' : 'text-stone-200'}`}
                  aria-label={`${n}★`}
                >
                  ★
                </button>
              ))}
            </div>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              placeholder={t('rateComment')}
              className="mt-2.5 w-full rounded-2xl border border-stone-200 p-2.5 text-sm outline-none focus:border-teal-600"
            />
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!stars) return;
                  setRateErr(null);
                  try {
                    await api(`/api/public/orders/${orderId}/rating`, { method: 'POST', body: { stars, comment: comment.trim() || undefined } });
                    setRateSent(true);
                  } catch (e: any) {
                    setRateErr(e.message);
                  }
                }}
                disabled={!stars}
                className="rounded-2xl bg-teal-700 px-5 py-2 text-sm font-extrabold text-white transition active:scale-95 disabled:opacity-50"
              >
                {t('rateSend')}
              </button>
              {rateErr && <span className="text-xs font-bold text-red-600">{rateErr}</span>}
            </div>
          </div>
        )}
        {(rateSent || st.rating) && (
          <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-center text-xs font-black text-teal-800">
            ⭐ {t('rateThanks')}
          </p>
        )}
      </div>
    </div>
  );
}

/** مجموع الأسطر قبل الخصومات — لعرض صف المجموع الجزئي عند وجود خصم/رسوم */
function lineSum(st: Status) {
  return Math.round(st.items.reduce((s, i) => s + i.line_total, 0) * 100) / 100;
}
