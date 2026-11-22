import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { dashT, money } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { Card, CardHead, Err, Spinner } from '../../components/ui';
import { staggerCards } from '../../lib/anim';

type Analytics = {
  days: number;
  orders_count: number;
  revenue: number;
  avg_basket: number;
  tips_total: number;
  discount_total: number;
  loyalty_discount_total: number;
  points_earned_total: number;
  status_counts: Record<string, number>;
  top_items: { name: string; qty: number; revenue: number }[];
  hourly: number[];
  branches: { name: string | null; orders: number; revenue: number }[];
  ratings: { count: number; avg: number | null; dist: number[] };
};

/** التحليلات (D6) — مالك فقط؛ كل الأرقام محسوبة خادميًا من الطلبات الحقيقية */
export default function DashAnalytics() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api<Analytics>(`/api/shop/analytics?days=${days}`)
      .then((d) => {
        setData(d);
        setTimeout(() => staggerCards(rootRef.current), 30);
      })
      .catch((e) => setError(e.message));
  }, [days]);

  const maxHour = data ? Math.max(1, ...data.hourly) : 1;
  const maxItem = data && data.top_items.length ? Math.max(1, ...data.top_items.map((i) => i.qty)) : 1;
  const maxDist = data ? Math.max(1, ...data.ratings.dist) : 1;

  return (
    <div ref={rootRef} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black text-stone-900">📊 {t('analytics')}</h2>
        <div className="ms-auto flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition active:scale-95 ${
                days === d ? 'bg-teal-700 text-white shadow-sm' : 'bg-white text-stone-500 shadow-sm'
              }`}
            >
              {d} {t('days')}
            </button>
          ))}
        </div>
      </div>

      {error && <Err error={error} />}
      {!data && !error && <Spinner label={t('loading')} />}

      {data && (
        <>
          {/* بطاقات المقاييس */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon="🧾" label={t('metricOrders')} value={String(data.orders_count)} />
            <MetricCard icon="💰" label={t('metricRevenue')} value={money(lang, data.revenue)} />
            <MetricCard icon="🧺" label={t('metricBasket')} value={money(lang, data.avg_basket)} />
            <MetricCard
              icon="⭐"
              label={t('metricRating')}
              value={data.ratings.avg != null ? `${data.ratings.avg} ★` : '—'}
              sub={`${data.ratings.count} ${t('ratingsCount')}`}
            />
          </div>

          {/* الأكثر مبيعًا */}
          <Card data-card>
            <CardHead icon="🏆" title={t('topItems')} />
            {data.top_items.length === 0 ? (
              <p className="text-sm font-bold text-stone-400">{t('noData')}</p>
            ) : (
              <ul className="space-y-2">
                {data.top_items.map((it, i) => (
                  <li key={i} data-card className="rounded-2xl bg-[#f5f5f7] px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-extrabold text-stone-700">{it.name}</span>
                      <span className="ms-auto text-xs font-black text-teal-700" dir="ltr">×{it.qty}</span>
                      <span className="text-xs font-bold text-stone-400">{money(lang, it.revenue)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                      <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(4, (it.qty / maxItem) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ساعات الذروة */}
          <Card data-card>
            <CardHead icon="🕐" title={t('hourlyTitle')} />
            <div className="flex h-32 items-end gap-[3px]">
              {data.hourly.map((v, h) => (
                <div key={h} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${h}:00 — ${v}`}>
                  <div
                    className={`w-full rounded-t-md ${v > 0 ? 'bg-teal-600/85' : 'bg-stone-200'}`}
                    style={{ height: `${Math.max(v ? 6 : 2, (v / maxHour) * 100)}%` }}
                  />
                  <span className="text-[9px] font-bold text-stone-400">{h}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* أداء الفروع */}
          {data.branches.length > 0 && (
            <Card data-card>
              <CardHead icon="🏢" title={t('branchesPerf')} />
              <ul className="space-y-1.5">
                {data.branches.map((b, i) => (
                  <li key={i} data-card className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] px-3 py-2.5 text-sm">
                    <span className="font-extrabold text-stone-700">{b.name || t('branchMain')}</span>
                    <span className="text-xs font-bold text-stone-400">{b.orders} {t('metricOrders')}</span>
                    <span className="ms-auto font-black text-teal-700">{money(lang, b.revenue)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* توزيع التقييمات */}
          <Card data-card>
            <CardHead icon="⭐" title={t('ratingsDist')} />
            {data.ratings.count === 0 ? (
              <p className="text-sm font-bold text-stone-400">{t('noRatings')}</p>
            ) : (
              <ul className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((s, idx) => {
                  const c = data.ratings.dist[s - 1];
                  return (
                    <li key={s} className="flex items-center gap-2 text-sm">
                      <span className="w-10 shrink-0 font-black text-amber-500">{s}★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(3, (c / maxDist) * 100)}%` }} />
                      </div>
                      <span className="w-8 text-end text-xs font-bold text-stone-400">{c}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* أرقام إضافية */}
          <Card data-card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label={t('tipsTotal')} value={money(lang, data.tips_total)} />
              <MiniStat label={t('discountTotal')} value={money(lang, data.discount_total)} />
              <MiniStat label={t('loyaltyDiscountTotal')} value={money(lang, data.loyalty_discount_total)} />
              <MiniStat label={t('pointsTotal')} value={String(data.points_earned_total)} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div data-card className="rounded-3xl border border-black/[0.04] bg-white p-4 shadow-apple">
      <p className="text-xs font-bold text-stone-400">{icon} {label}</p>
      <p className="mt-1.5 text-xl font-black text-stone-900" dir="auto">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-bold text-stone-400">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div data-card className="rounded-2xl bg-[#f5f5f7] px-3 py-2.5">
      <p className="text-[11px] font-bold text-stone-400">{label}</p>
      <p className="mt-0.5 text-sm font-black text-stone-800" dir="auto">{value}</p>
    </div>
  );
}
