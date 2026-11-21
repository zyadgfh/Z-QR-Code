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

  const checkRef = useRef<HTMLParagraphElement>(null);
  const busyRef = useRef<HTMLDivElement>(null);
  const pulsedBusy = useRef(false);
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
      if (busyRef.current) haloPulse(busyRef.current);
    }
    if (st?.state === 'accepted' && !poppedCheck.current) {
      poppedCheck.current = true;
      popIn(checkRef.current);
    }
  }, [showBusy, st?.state]);

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
        <span className="rounded-full bg-teal-700 px-3 py-1 text-xs font-extrabold text-white">
          {t('table')} {st.table_number}
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
          <div className="mt-3 flex justify-between border-t border-stone-100 pt-2 font-extrabold text-stone-900">
            <span>{t('total')}</span>
            <span>{money(lang, st.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
