'use strict';

/**
 * تحليلات المحل (D6) — تُحسب خادميًا من وثائق الطلبات الحقيقية في النافذة المطلوبة.
 * لا أرقام مقدّرة: كل مقياس مشتق مباشرة من مجموعات orders.
 */

const DAY = 24 * 60 * 60 * 1000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** ملخص تحليلي كامل للمحل ضمن آخر `days` يومًا */
async function shopAnalytics(db, shopId, days) {
  const windowDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
  const since = Date.now() - windowDays * DAY;
  const orders = (await db.query('orders', [{ field: 'shop_id', value: shopId }])).filter(
    (o) => o.created_at >= since
  );

  let revenue = 0;
  let tips = 0;
  let discounts = 0;
  let taxTotal = 0;
  let loyaltyDiscount = 0;
  let pointsEarned = 0;
  const statusCounts = { pending: 0, preparing: 0, ready: 0, done: 0 };
  const hourly = new Array(24).fill(0);
  const branchMap = new Map();
  const itemMap = new Map();
  const dist = [0, 0, 0, 0, 0]; // ★1..★5
  let rated = 0;
  let ratingSum = 0;

  for (const o of orders) {
    revenue += o.total || 0;
    tips += o.tip || 0;
    discounts += o.discount_amount || 0;
    taxTotal += o.tax_total || 0;
    loyaltyDiscount += o.loyalty_discount || 0;
    pointsEarned += o.points_earned || 0;
    if (statusCounts[o.status] !== undefined) statusCounts[o.status] += 1;
    hourly[new Date(o.created_at).getHours()] += 1;

    const key = o.branch_name || '';
    const rec = branchMap.get(key) || { name: key || null, orders: 0, revenue: 0 };
    rec.orders += 1;
    rec.revenue = round2(rec.revenue + (o.total || 0));
    branchMap.set(key, rec);

    for (const it of o.items || []) {
      const item = itemMap.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
      item.qty += it.qty;
      item.revenue = round2(item.revenue + (it.line_total || 0));
      itemMap.set(it.name, item);
    }

    if (o.rating && o.rating.stars >= 1 && o.rating.stars <= 5) {
      rated += 1;
      ratingSum += o.rating.stars;
      dist[o.rating.stars - 1] += 1;
    }
  }

  const ordersCount = orders.length;
  return {
    days: windowDays,
    orders_count: ordersCount,
    revenue: round2(revenue),
    avg_basket: ordersCount ? round2(revenue / ordersCount) : 0,
    tips_total: round2(tips),
    discount_total: round2(discounts),
    tax_total: round2(taxTotal),
    loyalty_discount_total: round2(loyaltyDiscount),
    points_earned_total: pointsEarned,
    status_counts: statusCounts,
    top_items: [...itemMap.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 8),
    hourly,
    branches: [...branchMap.values()].sort((a, b) => b.revenue - a.revenue),
    ratings: { count: rated, avg: rated ? round2(ratingSum / rated) : null, dist },
  };
}

module.exports = { shopAnalytics };
