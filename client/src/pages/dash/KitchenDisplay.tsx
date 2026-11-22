import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { dashT } from '../../lib/i18n';
import { useDashLang, useDocDir } from '../../stores/dashlang';
import { useAuth } from '../../stores/auth';
import { useOrdersLive, Order } from '../../hooks/useOrdersLive';
import { alertBeep, ensureAudio } from '../../lib/sound';
import { staggerCards } from '../../lib/anim';
import { Err } from '../../components/ui';

const ETA_CHIPS = [10, 15, 20, 30];

function ageChip(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const tone = m < 5 ? 'bg-emerald-500/20 text-emerald-300' : m < 10 ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300 animate-pulse';
  return <span className={`rounded-full px-3 py-1 text-sm font-black ${tone}`}>⏱ {m} د</span>;
}

/**
 * شاشة مطبخ بملء الشاشة (F-16): أزرار عملاقة، أعمار ملونة، لمس واحد،
 * تحديث لحظي عبر useOrdersLive + صوت عند وصول طلب جديد.
 */
export default function KitchenDisplay() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  useDocDir(lang);
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const { orders, error, load, live } = useOrdersLive();
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('qm-sound') === '1');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);
  const prevPending = useRef<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // حماية بسيطة: بلا جلسة → دخول
  useEffect(() => {
    if (!token) navigate('/dash/login', { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(tick);
  }, []);

  const active = (orders || []).filter((o) => o.status !== 'done');
  const pendingCount = active.filter((o) => o.status === 'pending').length;

  // دخول متدرج + صفير فوري عند طلب جديد
  useEffect(() => {
    if (active.length) staggerCards(boardRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders?.length]);

  useEffect(() => {
    if (prevPending.current !== null && pendingCount > prevPending.current && soundOn) alertBeep();
    prevPending.current = pendingCount;
  }, [pendingCount, soundOn]);

  const toggleSound = () => {
    ensureAudio();
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('qm-sound', next ? '1' : '0');
    if (next) setTimeout(alertBeep, 120);
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActError(null);
    try {
      await fn;
      await load();
    } catch (e: any) {
      setActError(e.message);
    }
    setBusy(false);
  };

  const accept = (o: Order, eta: number) => act(() => api(`/api/shop/orders/${o.id}/accept`, { method: 'POST', body: { eta_minutes: eta } }));
  const stage = (o: Order, s: 'ready' | 'done') => act(() => api(`/api/shop/orders/${o.id}/stage`, { method: 'POST', body: { stage: s } }));

  const clock = new Date(now).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-dvh bg-stone-900 p-4 text-white">
      {/* شريط علوي مصغر */}
      <header className="mb-4 flex items-center gap-3">
        <span className="text-2xl">👨‍🍳</span>
        <h1 className="text-xl font-black">{t('kdsTitle')}</h1>
        <span className={`flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold ${live ? 'text-emerald-300' : 'text-stone-400'}`}>
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-stone-500'}`} />
          {t('live')}
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-stone-300" dir="ltr">{clock}</span>
        <div className="ms-auto flex items-center gap-2">
          <button onClick={toggleSound} className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${soundOn ? 'bg-teal-600 text-white' : 'bg-white/10 text-stone-300'}`}>
            {soundOn ? '🔔' : '🔕'}
          </button>
          <button onClick={() => navigate('/dash')} className="rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-stone-300 transition hover:bg-white/20">
            {t('kdsExit')}
          </button>
        </div>
      </header>

      {(error || actError) && (
        <div className="mb-3">
          <Err error={error || actError} />
        </div>
      )}

      {active.length === 0 ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-6xl">🍽</p>
          <p className="text-lg font-extrabold text-stone-300">{t('kdsEmpty')}</p>
        </div>
      ) : (
        <div ref={boardRef} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((o) => (
            <div key={o.id} className="data-card flex flex-col rounded-3xl border border-white/10 bg-stone-800/90 p-4 shadow-apple">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-4xl font-black">{o.table_number ? `🧾 ${o.table_number}` : o.service === 'delivery' ? '🛵' : '🥡'}</span>
                {o.customer_phone && <span className="text-sm font-bold text-stone-300" dir="ltr">{o.customer_phone}</span>}
                {ageChip(now - o.created_at)}
                <span className={`ms-auto rounded-full px-3 py-1 text-xs font-black ${o.status === 'pending' ? 'bg-red-500/20 text-red-300' : o.status === 'preparing' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                  {o.status === 'pending' ? t('newOrders') : o.status === 'preparing' ? t('preparing') : t('ready')}
                </span>
              </div>
              <ul className="mb-3 space-y-1.5">
                {o.items.map((it, i) => (
                  <li key={i} className="text-lg font-extrabold">
                    {lang === 'ar' ? it.name : it.name_en || it.name} <span className="text-teal-400">×{it.qty}</span>
                    {it.options.length > 0 && (
                      <span className="block text-xs font-bold text-stone-400">
                        {it.options.map((op) => op.option_name).join(' · ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {o.note && <p className="mb-3 rounded-2xl bg-white/5 px-3 py-2 text-sm font-bold text-amber-200">📝 {o.note}</p>}
              <div className="mt-auto">
                {o.status === 'pending' ? (
                  <div>
                    <p className="mb-1.5 text-xs font-black text-stone-400">{t('kdsAcceptIn')}</p>
                    <div className="flex gap-2">
                      {ETA_CHIPS.map((m) => (
                        <button
                          key={m}
                          disabled={busy}
                          onClick={() => accept(o, m)}
                          className="flex-1 rounded-2xl bg-teal-600 py-3 text-lg font-black transition active:scale-95 disabled:opacity-50 hover:bg-teal-500"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : o.status === 'preparing' ? (
                  <button
                    disabled={busy}
                    onClick={() => stage(o, 'ready')}
                    className="w-full rounded-2xl bg-emerald-600 py-4 text-2xl font-black transition active:scale-95 disabled:opacity-50 hover:bg-emerald-500"
                  >
                    ✅ {t('ready')}
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => stage(o, 'done')}
                    className="w-full rounded-2xl bg-stone-600 py-3 text-lg font-black transition active:scale-95 disabled:opacity-50 hover:bg-stone-500"
                  >
                    {t('done')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
