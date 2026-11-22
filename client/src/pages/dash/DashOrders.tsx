import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import { dashT, timeAgo } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { alertBeep, ensureAudio } from '../../lib/sound';
import { Btn, Err, Input, Label, Modal, Spinner } from '../../components/ui';
import { staggerCards } from '../../lib/anim';
import { useOrdersLive, type Order } from '../../hooks/useOrdersLive';
import { enablePush, disablePush } from '../../lib/push';

export type { Order };
export type { OrderItem } from '../../hooks/useOrdersLive';

export default function DashOrders() {
  const { mem } = useOutletContext<{ mem: { role: 'owner' | 'staff' } }>();
  const { lang } = useDashLang();
  const t = dashT(lang);

  const { orders, error, load, live } = useOrdersLive();
  const [now, setNow] = useState(Date.now());
  const [accepting, setAccepting] = useState<Order | null>(null);
  const [eta, setEta] = useState(15);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef<number | null>(null);
  const [pushOn, setPushOn] = useState(() => localStorage.getItem('qm-push') === '1');
  const [pushError, setPushError] = useState<string | null>(null);

  // الصوت: مفعّل بعد أول لمسة، ومحفوظ لزيارات لاحقة
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('qm-sound') === '1');
  const pendingCount = useMemo(() => orders?.filter((o) => o.status === 'pending').length ?? 0, [orders]);
  const prevPending = useRef<number | null>(null);

  // دخول متدرج للبطاقات عند أول تحميل وكل وصول دفعة طلبات جديدة
  useEffect(() => {
    if (orders && orders.length && orders.length !== lastCount.current) {
      lastCount.current = orders.length;
      staggerCards(listRef.current);
    }
  }, [orders]);

  // عدّاد الوقت لأعمار الطلبات
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(tick);
  }, []);

  // صفير متكرر ما دام هناك طلبات في الانتظار + صفير فوري عند طلب جديد
  useEffect(() => {
    if (prevPending.current !== null && pendingCount > prevPending.current && soundOn) alertBeep();
    prevPending.current = pendingCount;
    if (!soundOn || pendingCount === 0) return;
    alertBeep();
    const iv = setInterval(alertBeep, 3000);
    return () => clearInterval(iv);
  }, [soundOn, pendingCount]);

  const toggleSound = () => {
    ensureAudio();
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('qm-sound', next ? '1' : '0');
    if (next) setTimeout(alertBeep, 120);
  };

  // تنبيهات المتصفح (NOTIF-01): تظهر حتى والتبويب مغلق
  const togglePush = async () => {
    if (pushOn) {
      await disablePush();
      setPushOn(false);
      localStorage.removeItem('qm-push');
      return;
    }
    const r = await enablePush();
    if (r === 'ok') {
      setPushOn(true);
      localStorage.setItem('qm-push', '1');
    } else if (r === 'denied') {
      setPushError(t('pushBlocked'));
    } else {
      setPushError(t('pushUnsupported'));
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    await fn;
    await load();
  };

  if (error) return <div className="p-4"><Err error={error} /></div>;
  if (!orders) return <Spinner label={t('loading')} />;

  const pending = orders.filter((o) => o.status === 'pending');
  const preparing = orders.filter((o) => o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');
  const done = orders.filter((o) => o.status === 'done').slice(0, 8);

  return (
    <div ref={listRef} className="space-y-4">
      {/* شريط الحالة */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-stone-600 shadow-sm ${live ? '' : 'opacity-60'}`}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-green-500' : 'bg-stone-400'}`} />
          </span>
          {t('live')}
        </span>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-stone-600 shadow-sm">
          {t('newOrders')}: <span className={pendingCount ? 'text-red-600' : ''}>{pendingCount}</span>
        </span>
        <button
          onClick={togglePush}
          className={`rounded-full px-4 py-1.5 text-xs font-extrabold shadow-sm transition ${
            pushOn ? 'bg-teal-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
          }`}
        >
          {pushOn ? `🔔 ${t('pushOn')}` : `🔕 ${t('pushEnable')}`}
        </button>
        <button
          onClick={toggleSound}
          className={`ms-auto rounded-full px-4 py-1.5 text-xs font-extrabold shadow-sm transition ${
            soundOn ? 'bg-teal-700 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
          }`}
        >
          {soundOn ? `🔔 ${t('muteSound')}` : `🔕 ${t('enableSound')}`}
        </button>
      </div>

      {!soundOn && pendingCount > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-800">
          ⚠️ {t('soundOffWarn')}
        </div>
      )}

      {pushError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-extrabold text-red-700">
          ⚠️ {pushError}
        </div>
      )}

      {orders.length === 0 && (
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          <p className="mb-1 text-4xl">🧾</p>
          <p className="text-sm font-bold text-stone-400">{t('emptyOrders')}</p>
        </div>
      )}

      <Group title={`🔴 ${t('newOrders')}`} orders={pending} tone="red" now={now} t={t} lang={lang} onAccept={(o) => { setAccepting(o); setEta(15); }} onStage={(o, s) => act(() => api(`/api/shop/orders/${o.id}/stage`, { method: 'POST', body: { stage: s } }))} />
      <Group title={`👨‍🍳 ${t('preparing')}`} orders={preparing} tone="sky" now={now} t={t} lang={lang} onStage={(o, s) => act(() => api(`/api/shop/orders/${o.id}/stage`, { method: 'POST', body: { stage: s } }))} />
      <Group title={`✅ ${t('ready')}`} orders={ready} tone="green" now={now} t={t} lang={lang} onStage={(o, s) => act(() => api(`/api/shop/orders/${o.id}/stage`, { method: 'POST', body: { stage: s } }))} />
      {done.length > 0 && (
        <details className="rounded-3xl bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-extrabold text-stone-500">✔️ {t('done')} ({done.length})</summary>
          <div className="mt-3 space-y-2 opacity-70">
            {done.map((o) => <OrderCard key={o.id} o={o} now={now} t={t} lang={lang} />)}
          </div>
        </details>
      )}

      {/* قبول بالوقت المتوقع */}
      <Modal open={Boolean(accepting)} onClose={() => setAccepting(null)} title={t('accept')}>
        {accepting && (
          <div className="space-y-3">
            <p className="text-sm text-stone-500">
              {t('table')} {accepting.table_number} · {accepting.items.reduce((s, i) => s + i.qty, 0)} items
            </p>
            <Label>{t('etaLabel')}</Label>
            <Input type="number" min={1} max={300} value={eta} onChange={(e) => setEta(Number(e.target.value))} />
            <Btn
              className="w-full py-2.5"
              onClick={() => {
                const id = accepting.id;
                setAccepting(null);
                act(() => api(`/api/shop/orders/${id}/accept`, { method: 'POST', body: { eta_minutes: eta } }));
              }}
            >
              ⏱ {t('confirmAccept')}
            </Btn>
          </div>
        )}
      </Modal>
    </div>
  );
}

const TONES: Record<string, string> = {
  red: '!border-red-200 !bg-red-50/70',
  sky: '!border-sky-200 !bg-sky-50/70',
  green: '!border-green-200 !bg-green-50/70',
};

function Group({
  title,
  orders,
  tone,
  now,
  t,
  lang,
  onAccept,
  onStage,
}: {
  title: string;
  orders: Order[];
  tone: 'red' | 'sky' | 'green';
  now: number;
  t: (k: any) => string;
  lang: 'ar' | 'en';
  onAccept?: (o: Order) => void;
  onStage: (o: Order, stage: 'ready' | 'done') => void;
}) {
  if (!orders.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-extrabold text-stone-600">{title} ({orders.length})</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {orders.map((o) => (
          <OrderCard key={o.id} o={o} now={now} t={t} lang={lang} tone={tone} onAccept={onAccept} onStage={onStage} />
        ))}
      </div>
    </section>
  );
}

function OrderCard({
  o,
  now,
  t,
  lang,
  tone,
  onAccept,
  onStage,
}: {
  o: Order;
  now: number;
  t: (k: any) => string;
  lang: 'ar' | 'en';
  tone?: 'red' | 'sky' | 'green';
  onAccept?: (o: Order) => void;
  onStage?: (o: Order, stage: 'ready' | 'done') => void;
}) {
  return (
    <div data-card className={`rounded-3xl border border-black/[0.04] bg-white p-4 shadow-apple ${tone ? TONES[tone] : ''}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-stone-800 px-3 py-1 text-xs font-black text-white">{t('table')} {o.table_number}</span>
        <span className="text-xs font-bold text-stone-400">{t('minAgo')} {Math.max(1, Math.floor((now - o.created_at) / 60000))} {t('min')}</span>
        {o.status === 'preparing' && o.eta_minutes && (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-teal-700">⏱ {o.eta_minutes} {t('min')}</span>
        )}
        <span className="ms-auto text-sm font-black text-stone-700">{o.total} {lang === 'ar' ? 'ج.م' : 'EGP'}</span>
      </div>
      <div className="space-y-1 text-sm">
        {o.items.map((it, i) => (
          <div key={i} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="font-bold text-stone-700">{it.qty}× {lang === 'en' && it.name_en ? it.name_en : it.name}</span>
              {it.options.length > 0 && (
                <span className="block text-xs text-stone-400">
                  {it.options.map((op) => `${lang === 'en' ? op.option_name : op.option_name}${op.price_delta ? ` (+${op.price_delta})` : ''}`).join(' · ')}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs font-bold text-stone-500">{it.line_total}</span>
          </div>
        ))}
      </div>
      {o.note && <p className="mt-2 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">📝 {o.note}</p>}
      <div className="mt-3 flex gap-2">
        {o.status === 'pending' && onAccept && (
          <Btn className="flex-1" onClick={() => onAccept(o)}>✓ {t('accept')}</Btn>
        )}
        {o.status === 'preparing' && onStage && (
          <Btn variant="dark" className="flex-1" onClick={() => onStage(o, 'ready')}>🍽 {t('startReady')}</Btn>
        )}
        {o.status === 'ready' && onStage && (
          <Btn variant="dark" className="flex-1" onClick={() => onStage(o, 'done')}>🤝 {t('delivered')}</Btn>
        )}
      </div>
    </div>
  );
}
