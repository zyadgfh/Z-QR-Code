import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { custT, money, Lang } from '../../lib/i18n';
import { useCart, lineTotal } from '../../stores/cart';

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

  const lang = (new URLSearchParams(location.search).get('lang') as Lang) || 'ar';
  const t = custT(lang);

  const total = Math.round(lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;

  const send = async () => {
    if (!table || !lines.length) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ id: string }>(`/api/public/shops/${slug}/orders`, {
        method: 'POST',
        body: {
          table,
          note,
          items: lines.map((l) => ({
            item_id: l.item_id,
            qty: l.qty,
            option_ids: l.options.map((o) => o.option_id),
          })),
        },
      });
      localStorage.setItem(`qm-order:${slug}:${table}`, res.id);
      clear(slug);
      navigate(`/${slug}/o/${res.id}`, { replace: true });
    } catch (e: any) {
      setError(e.message || 'خطأ');
      setSending(false);
    }
  };

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="mx-auto min-h-dvh max-w-lg bg-stone-50 pb-32">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link to={`/${slug}${table ? `/t/${table}` : ''}`} className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-bold text-stone-600">
          ‹ {t('back')}
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-stone-800">🛒 {t('cart')}</h1>
        {table && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-extrabold text-teal-800">{t('table')} {table}</span>}
      </header>

      <div className="space-y-3 p-4">
        {!lines.length && <p className="rounded-2xl bg-white p-6 text-center text-sm font-bold text-stone-400">{t('emptyCart')}</p>}
        {lines.map((l) => (
          <div key={l.key} className="rounded-2xl border border-stone-200 bg-white p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-stone-800">{lang === 'en' && l.name_en ? l.name_en : l.name}</p>
                {l.options.length > 0 && (
                  <p className="mt-0.5 text-xs text-stone-500">
                    {l.options.map((o) => `${lang === 'en' && o.name_en ? o.name_en : o.option_name}${o.price_delta ? ` +${o.price_delta}` : ''}`).join(' · ')}
                  </p>
                )}
                <p className="mt-1 text-sm font-extrabold text-teal-700">{money(lang, l.unit_price)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-stone-200">
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
            <div className="rounded-2xl border border-stone-200 bg-white p-3.5">
              <label className="mb-1 block text-xs font-bold text-stone-500">{t('note')}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                placeholder={t('notePh')}
                rows={2}
                className="w-full resize-none rounded-xl border border-stone-200 p-2.5 text-sm outline-none focus:border-teal-600"
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-teal-50 px-4 py-3">
              <span className="font-extrabold text-stone-700">{t('total')}</span>
              <span className="text-lg font-black text-teal-800">{money(lang, total)}</span>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
            {!table && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">{t('needTable')}</p>}
          </>
        )}
      </div>

      {lines.length > 0 && table && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg p-3">
          <button
            onClick={send}
            disabled={sending}
            className="w-full rounded-2xl bg-teal-700 py-4 text-lg font-extrabold text-white shadow-xl transition hover:bg-teal-800 active:scale-[0.99] disabled:bg-stone-400"
          >
            {sending ? t('sending') : `${t('send')} · ${money(lang, total)}`}
          </button>
        </div>
      )}
    </div>
  );
}
