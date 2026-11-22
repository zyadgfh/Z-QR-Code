import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { custT, money, Lang } from '../../lib/i18n';
import { useCart, lineTotal } from '../../stores/cart';
import { staggerCards, fadeInUp } from '../../lib/anim';

export default function CartPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const table = params.get('t') ? Number(params.get('t')) : null;
  const navigate = useNavigate();

  const lines = useCart((s) => s.bySlug[slug] || []);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);

  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // طلب خارجي (F-11) + كود خصم (F-06)
  const [service, setService] = useState<'takeaway' | 'delivery' | null>(null);
  const [phone, setPhone] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  // الولاء (F-17): رصيد بالهاتف + استرداد اختياري
  const [loy, setLoy] = useState<{ points: number; redeem_value: number; max_percent: number } | null>(null);
  const [redeem, setRedeem] = useState('');
  // الإكرامية (D6) — تُضاف فوق الإجمالي في الخادم
  const [tip, setTip] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const branchId = useCart((s) => s.branchBySlug[slug] || '');
  const branches = useCart((s) => s.branchesBySlug[slug] || []);
  const setBranch = useCart((s) => s.setBranch);

  const lang = (new URLSearchParams(location.search).get('lang') as Lang) || 'ar';
  const t = custT(lang);

  useEffect(() => {
    staggerCards(listRef.current);
    fadeInUp(headRef.current);
  }, [lines.length]);

  const total = Math.round(lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
  const canSend = Boolean(lines.length) && (Boolean(table) || service === 'takeaway' || service === 'delivery');

  // رصيد الولاء عند توفر الهاتف (مسار مقيّد بالمعدل — بتهدئة بسيطة)
  useEffect(() => {
    const ph = phone.trim();
    if (!ph || ph.length < 6) {
      setLoy(null);
      return;
    }
    const id = setTimeout(() => {
      api<any>(`/api/public/shops/${slug}/loyalty?phone=${encodeURIComponent(ph)}`)
        .then((r) => setLoy(r.enabled ? { points: r.points, redeem_value: r.redeem_value, max_percent: r.max_percent } : null))
        .catch(() => setLoy(null));
    }, 400);
    return () => clearTimeout(id);
  }, [phone, slug]);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        note,
        items: lines.map((l) => ({
          item_id: l.item_id,
          qty: l.qty,
          option_ids: l.options.map((o) => o.option_id),
        })),
      };
      if (table) body.table = table;
      else {
        body.service = service;
        if (phone.trim()) body.customer_phone = phone.trim();
      }
      if (branchId) body.branch_id = branchId;
      if (phone.trim()) body.customer_phone = phone.trim();
      if (discountCode.trim()) body.discount_code = discountCode.trim();
      const rp = Math.floor(Number(redeem));
      if (loy && rp > 0) body.redeem_points = rp;
      if (tip > 0) body.tip = tip;
      const res = await api<{ id: string }>(`/api/public/shops/${slug}/orders`, { method: 'POST', body });
      if (table) localStorage.setItem(`qm-order:${slug}:${table}`, res.id);
      clear(slug);
      navigate(`/${slug}/o/${res.id}`, { replace: true });
    } catch (e: any) {
      setError(e.message || 'خطأ');
      setSending(false);
    }
  };

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="mx-auto min-h-dvh max-w-lg bg-[#f5f5f7] pb-32">
      <header className="glass sticky top-0 z-30 flex items-center gap-3 px-4 py-3">
        <Link to={`/${slug}${table ? `/t/${table}` : ''}`} className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-stone-600 shadow-sm backdrop-blur">
          ‹ {t('back')}
        </Link>
        <h1 className="flex-1 text-[17px] font-extrabold text-stone-900">🛒 {t('cart')}</h1>
        {table && <span className="rounded-full bg-teal-700 px-3 py-1 text-xs font-extrabold text-white">{t('table')} {table}</span>}
      </header>

      <div ref={listRef} className="space-y-3 p-4">
        {!lines.length && <p className="rounded-[22px] bg-white p-6 text-center text-sm font-bold text-stone-400 shadow-apple">{t('emptyCart')}</p>}
        {lines.map((l) => (
          <div key={l.key} data-card className="rounded-[22px] border border-black/[0.04] bg-white p-3.5 shadow-apple">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-stone-900">{lang === 'en' && l.name_en ? l.name_en : l.name}</p>
                {l.options.length > 0 && (
                  <p className="mt-0.5 text-xs text-stone-500">
                    {l.options.map((o) => `${lang === 'en' && o.name_en ? o.name_en : o.option_name}${o.price_delta ? ` +${o.price_delta}` : ''}`).join(' · ')}
                  </p>
                )}
                <p className="mt-1 text-sm font-extrabold text-teal-700">{money(lang, l.unit_price)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-stone-200">
                <button onClick={() => setQty(slug, l.key, l.qty - 1)} className="px-2.5 py-1.5 font-black text-stone-500">−</button>
                <span className="w-5 text-center text-sm font-extrabold">{l.qty}</span>
                <button onClick={() => setQty(slug, l.key, Math.min(10, l.qty + 1))} className="px-2.5 py-1.5 font-black text-stone-500">+</button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button onClick={() => remove(slug, l.key)} className="text-xs font-bold text-red-500">✕ {lang === 'ar' ? 'إزالة' : 'Remove'}</button>
              <span className="text-sm font-extrabold text-stone-700">{money(lang, lineTotal(l))}</span>
            </div>
          </div>
        ))}

        {lines.length > 0 && (
          <>
            <div className="rounded-[22px] border border-black/[0.04] bg-white p-3.5 shadow-apple">
              <label className="mb-1 block text-xs font-bold text-stone-500">{t('note')}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                placeholder={t('notePh')}
                rows={2}
                className="w-full resize-none rounded-2xl border border-stone-200 p-2.5 text-sm outline-none focus:border-teal-600"
              />
            </div>

            {/* نوع الخدمة للطلب الخارجي (F-11) */}
            {!table && (
              <div className="rounded-[22px] border border-black/[0.04] bg-white p-3.5 shadow-apple">
                <label className="mb-2 block text-xs font-bold text-stone-500">{t('externalService')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['takeaway', 'delivery'] as const).map((sv) => (
                    <button
                      key={sv}
                      onClick={() => setService(sv)}
                      className={`rounded-2xl border px-3 py-3 text-sm font-extrabold transition active:scale-95 ${
                        service === sv ? 'border-teal-700 bg-teal-50 text-teal-800 shadow-sm' : 'border-stone-200 bg-white text-stone-600'
                      }`}
                    >
                      {t(sv)}
                    </button>
                  ))}
                </div>
                {service === 'delivery' && (
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.slice(0, 20))}
                    placeholder={t('customerPhone')}
                    inputMode="tel"
                    dir="ltr"
                    className="mt-2 w-full rounded-2xl border border-stone-200 p-2.5 text-sm outline-none focus:border-teal-600"
                  />
                )}
              </div>
            )}

            {/* الفرع المختار (F-04) */}
            {branches.length > 0 && (
              <div className="rounded-[22px] border border-black/[0.04] bg-white p-3.5 shadow-apple">
                <label className="mb-2 block text-xs font-bold text-stone-500">{t('branch')}</label>
                <div className="flex flex-wrap gap-2">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBranch(slug, b.id)}
                      className={`rounded-2xl border px-3 py-1.5 text-xs font-extrabold transition active:scale-95 ${
                        branchId === b.id ? 'border-teal-700 bg-teal-50 text-teal-800 shadow-sm' : 'border-stone-200 bg-white text-stone-600'
                      }`}
                    >
                      🏢 {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* الولاء (F-17): رصيد واسترداد */}
            {!table && loy && (
              <div className="rounded-[22px] border border-black/[0.04] bg-white p-3.5 shadow-apple">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-500">⭐ {t('myPoints')}</span>
                  <span className="text-sm font-black text-teal-700" dir="ltr">
                    {loy.points} · {t('pointsWorth')} ≈ {Math.round(loy.points * loy.redeem_value * 100) / 100}
                  </span>
                </div>
                {loy.points > 0 && (
                  <input
                    value={redeem}
                    onChange={(e) => setRedeem(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder={t('redeemPoints')}
                    inputMode="numeric"
                    dir="ltr"
                    className="mt-2 w-full rounded-2xl border border-stone-200 p-2.5 text-sm font-extrabold outline-none focus:border-teal-600"
                  />
                )}
              </div>
            )}

            {/* حقل الهاتف للجلوس عند تفعيل الولاء (بدونه لا يُحسب الرصيد) */}
            {/* الإكرامية (D6) */}
            <div className="rounded-[22px] border border-black/[0.04] bg-white p-3.5 shadow-apple">
              <label className="mb-2 block text-xs font-bold text-stone-500">💖 {t('tipTitle')}</label>
              <div className="grid grid-cols-4 gap-2">
                {[0, 5, 10, 15].map((v) => (
                  <button
                    key={v}
                    onClick={() => setTip(v)}
                    className={`rounded-2xl border px-2 py-2.5 text-sm font-extrabold transition active:scale-95 ${
                      tip === v ? 'border-teal-700 bg-teal-50 text-teal-800 shadow-sm' : 'border-stone-200 bg-white text-stone-600'
                    }`}
                  >
                    {v === 0 ? t('tipNone') : `${v}`}
                  </button>
                ))}
              </div>
            </div>

            {/* كود الخصم (F-06) — التحقق والحساب في الخادم */}
            <div className="rounded-[22px] border border-black/[0.04] bg-white p-3.5 shadow-apple">
              <label className="mb-1 block text-xs font-bold text-stone-500">{t('discountCode')}</label>
              <input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase().slice(0, 40))}
                placeholder="SAVE10"
                dir="ltr"
                className="w-full rounded-2xl border border-stone-200 p-2.5 text-sm font-extrabold outline-none focus:border-teal-600"
              />
            </div>

            <div className="flex items-center justify-between rounded-[22px] bg-white px-4 py-3 shadow-apple">
              <span className="font-extrabold text-stone-900">{t('total')}</span>
              <span className="text-lg font-black text-teal-700">{money(lang, Math.round((total + tip) * 100) / 100)}</span>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
          </>
        )}
      </div>

      {lines.length > 0 && canSend && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg p-3">
          <button
            onClick={send}
            disabled={sending}
            className="glass-float w-full rounded-[22px] border border-white/60 py-4 text-lg font-extrabold text-teal-800 shadow-apple transition active:scale-[0.98] disabled:opacity-60"
          >
            {sending ? t('sending') : `${t('send')} · ${money(lang, Math.round((total + tip) * 100) / 100)}`}
          </button>
        </div>
      )}
    </div>
  );
}
