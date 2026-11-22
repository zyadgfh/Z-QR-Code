'use strict';

/**
 * تصدير الطلبات CSV (ECO-02) — ترميز UTF-8 مع BOM ليفتح Excel عربيًا مباشرة،
 * حقول مقتبسة مع تهريب الاقتباس المزدوج.
 */
function ordersCsv(orders) {
  const q = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  const serviceLabel = (o) =>
    o.service === 'takeaway' ? 'تاك أوي' : o.service === 'delivery' ? 'توصيل' : o.table_number || '—';
  const statusLabel = { pending: 'بانتظار القبول', preparing: 'قيد التحضير', ready: 'جاهز', done: 'تم' };
  const lines = [
    ['رقم الطلب', 'التاريخ', 'النوع', 'الهاتف', 'الأصناف', 'الخصم', 'رسوم التوصيل', 'الإجمالي', 'الحالة']
      .map(q)
      .join(','),
  ];
  for (const o of orders) {
    const items = (o.items || [])
      .map((i) => `${i.qty}× ${i.name}${(i.options || []).length ? ` (${i.options.map((x) => x.option_name).join('، ')})` : ''}`)
      .join(' | ');
    lines.push(
      [
        (o.id || '').slice(-8),
        new Date(o.created_at).toLocaleString('ar-EG'),
        serviceLabel(o),
        o.customer_phone || '',
        items,
        o.discount_code ? `${o.discount_code} (${o.discount_amount || 0})` : '',
        o.delivery_fee || 0,
        o.total,
        statusLabel[o.status] || o.status,
      ]
        .map(q)
        .join(',')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

module.exports = { ordersCsv };
