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

/** محلل CSV بسيط يدعم الاقتباسات والفواصل داخل الحقول — للتنسيق والاستيراد */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (ch === '\r') { /* تجاهل */ }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].length));
}

module.exports = { ordersCsv, parseCsv };
