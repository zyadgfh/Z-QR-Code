import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, NILE_OWNER } from './helpers.mjs';

async function owner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  return r.json.token;
}
const TEA = { item_id: 'nit_tea', qty: 1, option_ids: [] };

// ================= المخزون بكميات (الطور 5 — 86) =================

test('الطور 5: المخزون — خصم مع كل طلب، رفض الزيادة، نفاد آلي معتيم للزبون، وإعادة تعبئة', async () => {
  const { base } = await startServer();
  const t = await owner(base);

  // تفعيل التتبع: 10 وحدات وحد تنبيه 3
  const set = await api(base, '/api/shop/items/nit_tea', { token: t, method: 'PUT', body: { stock_qty: 10, low_stock_threshold: 3 } });
  assert.equal(set.status, 200);
  assert.equal(set.json.stock_qty, 10);

  // طلب 4 → المتبقي 6
  const o1 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [{ ...TEA, qty: 4 }] } });
  assert.equal(o1.status, 201);
  let menu = (await api(base, '/api/shop/menu', { token: t })).json;
  assert.equal(menu.items.find((i) => i.id === 'nit_tea').stock_qty, 6);

  // طلب 8 → مرفوض: كمية غير كافية (المخزون لا يتأثر)
  const o2 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [{ ...TEA, qty: 8 }] } });
  assert.equal(o2.status, 400);
  assert.equal(o2.json.error.code, 'INSUFFICIENT_STOCK');
  menu = (await api(base, '/api/shop/menu', { token: t })).json;
  assert.equal(menu.items.find((i) => i.id === 'nit_tea').stock_qty, 6);

  // طلب 6 → يستهلك كل المخزون (0)
  const o3 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [{ ...TEA, qty: 6 }] } });
  assert.equal(o3.status, 201);

  // النفاد الآلي: المنيو العام يعرضه نفد اليوم (بلا كشف الأرقام)
  const pub = (await api(base, '/api/public/shops/nile-cafe/menu')).json;
  assert.equal(pub.items.find((i) => i.id === 'nit_tea').sold_out, true);

  // طلب بعد النفاد → رفض
  const o4 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [TEA] } });
  assert.equal(o4.status, 400);
  assert.equal(o4.json.error.code, 'ITEM_SOLD_OUT');

  // إعادة تعبئة 5 → طلب 2 يعمل (المتبقي 3 = حد التنبيه)
  assert.equal((await api(base, '/api/shop/items/nit_tea', { token: t, method: 'PUT', body: { stock_qty: 5 } })).status, 200);
  const o5 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [{ ...TEA, qty: 2 }] } });
  assert.equal(o5.status, 201);

  // الصنف غير المتتبع لا يتأثر إطلاقًا: إلغاء التتبع ثم طلب حر
  assert.equal((await api(base, '/api/shop/items/nit_tea', { token: t, method: 'PUT', body: { stock_qty: null } })).status, 200);
  const other = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [{ ...TEA, qty: 3 }] } });
  assert.equal(other.status, 201);
  const after = (await api(base, '/api/shop/menu', { token: t })).json;
  assert.equal(after.items.find((i) => i.id === 'nit_tea').stock_qty, null);

  // قيمة رديئة مرفوضة
  assert.equal((await api(base, '/api/shop/items/nit_tea', { token: t, method: 'PUT', body: { stock_qty: -2 } })).status, 400);
});

// ================= قالب الإيصال (الطور 5) =================

test('الطور 5: ختامية الإيصال — حفظ متحقق ورفض الطويل', async () => {
  const { base } = await startServer();
  const t = await owner(base);

  const put = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { receipt_note: 'شكرًا لزيارتكم — تابعونا على إنستغرام' } });
  assert.equal(put.status, 200);
  assert.equal(put.json.receipt_note, 'شكرًا لزيارتكم — تابعونا على إنستغرام');

  // مسح الختامية
  assert.equal((await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { receipt_note: '' } })).json.receipt_note, '');

  // أطول من 300 حرف مرفوضة
  const long = 'x'.repeat(301);
  assert.equal((await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { receipt_note: long } })).status, 400);

  // الضريبة والإيصال معًا لا يتعارضان (حفظ جزئي)
  assert.equal((await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { receipt_note: 'ختامية', tax_percent: 5 } })).status, 200);
  const s = (await api(base, '/api/shop/settings', { token: t })).json;
  assert.equal(s.receipt_note, 'ختامية');
  assert.equal(s.tax_percent, 5);
});
