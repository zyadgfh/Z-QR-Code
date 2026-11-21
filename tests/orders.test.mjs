import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, login, NILE_OWNER, NILE_STAFF } from './helpers.mjs';

const postOrder = (base, body) =>
  api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body });

test('طلب صحيح: الإجمالي يُحسب من قاعدة البيانات (أسعار العميل تُهمَل)', async () => {
  const { base } = await startServer();
  // لاتيه كبير (40+8) ×2 = 96 + شاي 15 = 111
  const res = await postOrder(base, {
    table: 3,
    note: 'بدون سكر',
    items: [
      { item_id: 'nit_latte', qty: 2, option_ids: ['nopt_l_l'], price: 0.5, unit_price: 0.5, line_total: 0.5 },
      { item_id: 'nit_tea', qty: 1, option_ids: [], price: 0.01 },
    ],
    total: 0.5,
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.total, 111);
  assert.equal(res.json.table_number, 3);

  const status = await api(base, `/api/public/orders/${res.json.id}`);
  assert.equal(status.status, 200);
  assert.equal(status.json.state, 'waiting');
  assert.equal(status.json.eta_minutes, null);
  assert.equal(status.json.shop.phone, '01001234567');
  assert.equal(status.json.total, 111);
  assert.equal(status.json.items.length, 2);
});

test('دقة الأسعار العشرية: 12.5 + 1.25 ×3 = 41.25', async () => {
  const { base } = await startServer();
  const ownerT = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  const cat = await api(base, '/api/shop/categories', { token: ownerT, method: 'POST', body: { name: 'اختبار الدقة' } });
  const item = await api(base, '/api/shop/items', {
    token: ownerT,
    method: 'POST',
    body: { category_id: cat.json.id, name: 'صنف دقة', price: 12.5 },
  });
  const grp = await api(base, `/api/shop/items/${item.json.id}/groups`, {
    token: ownerT,
    method: 'POST',
    body: { name: 'إضافة', selection: 'multi', required: false, options: [{ name: 'علبة', price_delta: 1.25 }] },
  });
  assert.equal(grp.status, 201);

  // نجيب معرف الخيار من قائمة المنيو (المرجع الفعلي)
  const menu = await api(base, '/api/shop/menu', { token: ownerT });
  const created = menu.json.items.find((i) => i.name === 'صنف دقة');
  const optId = created.groups[0].options[0].id;
  const res = await postOrder(base, {
    table: 1,
    items: [{ item_id: created.id, qty: 3, option_ids: [optId] }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.total, 41.25);
});

test('رفض: خيار مطلوب ناقص / خياران من مجموعة مفردة / خيار لا يتبع الصنف', async () => {
  const { base } = await startServer();

  // اللاتيه له مجموعة «الحجم» إجبارية بدون خيار → رفض
  const r1 = await postOrder(base, { table: 1, items: [{ item_id: 'nit_latte', qty: 1, option_ids: [] }] });
  assert.equal(r1.status, 400);
  assert.equal(r1.json.error.code, 'INVALID_OPTIONS');

  // خياران من مجموعة مفردة
  const r2 = await postOrder(base, { table: 1, items: [{ item_id: 'nit_latte', qty: 1, option_ids: ['nopt_l_m', 'nopt_l_l'] }] });
  assert.equal(r2.status, 400);

  // خيار من صنف آخر (كبير التركية على اللاتيه)
  const r3 = await postOrder(base, { table: 1, items: [{ item_id: 'nit_latte', qty: 1, option_ids: ['nopt_t_l'] }] });
  assert.equal(r3.status, 400);

  // خيار غير موجود أصلًا
  const r4 = await postOrder(base, { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: ['nope'] }] });
  assert.equal(r4.status, 400);
});

test('رفض: صنف غير متاح / رقم ترابيزة خارج النطاق / كمية خاطئة', async () => {
  const { base } = await startServer();
  const ownerT = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  await api(base, '/api/shop/items/nit_mango', { token: ownerT, method: 'PUT', body: { name: 'مانجو', price: 50, available: false } });
  const r1 = await postOrder(base, { table: 1, items: [{ item_id: 'nit_mango', qty: 1, option_ids: [] }] });
  assert.equal(r1.status, 400);
  assert.equal(r1.json.error.code, 'ITEM_UNAVAILABLE');

  const r2 = await postOrder(base, { table: 99, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] });
  assert.equal(r2.status, 400);
  assert.equal(r2.json.error.code, 'INVALID_TABLE');

  const r3 = await postOrder(base, { table: 1, items: [{ item_id: 'nit_tea', qty: 0, option_ids: [] }] });
  assert.equal(r3.status, 400);

  const r4 = await postOrder(base, { table: 1, items: [] });
  assert.equal(r4.status, 400);
});

test('دورة الطلب كاملة: قبول بالوقت ثم مراحل حتى «تم» — العميل لا يرى المراحل', async () => {
  const { base } = await startServer();
  const staffT = await login(base, NILE_STAFF.email, NILE_STAFF.password);

  const ord = await postOrder(base, { table: 4, note: 'توصيل للترابيزة', items: [{ item_id: 'nit_mojito', qty: 1, option_ids: ['nopt_m_m'] }] });
  assert.equal(ord.status, 201);
  const id = ord.json.id;

  // قبل القبول: انتظار
  let status = await api(base, `/api/public/orders/${id}`);
  assert.equal(status.json.state, 'waiting');

  // قبول برقم غير صالح → 400
  assert.equal((await api(base, `/api/shop/orders/${id}/accept`, { token: staffT, method: 'POST', body: { eta_minutes: 0 } })).status, 400);
  assert.equal((await api(base, `/api/shop/orders/${id}/accept`, { token: staffT, method: 'POST', body: { eta_minutes: 999 } })).status, 400);

  // القبول → قيد التحضير + وقت متوقع يظهر للعميل فقط
  const acc = await api(base, `/api/shop/orders/${id}/accept`, { token: staffT, method: 'POST', body: { eta_minutes: 20 } });
  assert.equal(acc.status, 200);
  assert.equal(acc.json.status, 'preparing');
  assert.equal(acc.json.eta_minutes, 20);

  status = await api(base, `/api/public/orders/${id}`);
  assert.equal(status.json.state, 'accepted');
  assert.equal(status.json.eta_minutes, 20);
  assert.ok(!('status' in status.json), 'لا يجب كشف اسم المرحلة الداخلية للعميل');

  // القبول مرتين → 409
  assert.equal((await api(base, `/api/shop/orders/${id}/accept`, { token: staffT, method: 'POST', body: { eta_minutes: 20 } })).status, 409);

  // انتقالات المراحل الصحيحة فقط
  assert.equal((await api(base, `/api/shop/orders/${id}/stage`, { token: staffT, method: 'POST', body: { stage: 'done' } })).status, 400);
  assert.equal((await api(base, `/api/shop/orders/${id}/stage`, { token: staffT, method: 'POST', body: { stage: 'ready' } })).status, 200);
  assert.equal((await api(base, `/api/shop/orders/${id}/stage`, { token: staffT, method: 'POST', body: { stage: 'done' } })).status, 200);

  status = await api(base, `/api/public/orders/${id}`);
  assert.equal(status.json.state, 'accepted');
  assert.equal(status.json.eta_minutes, 20);
});

test('طلب غير موجود برقم عشوائي → 404', async () => {
  const { base } = await startServer();
  const status = await api(base, '/api/public/orders/ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert.equal(status.status, 404);
});
