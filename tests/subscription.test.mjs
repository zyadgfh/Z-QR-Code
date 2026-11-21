import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, login, ADMIN, NILE_OWNER, NILE_STAFF } from './helpers.mjs';

const DAY = 86400000;

test('انتهاء التجربة: القفل الكامل على مستوى الخادم ثم «تم الدفع» يعيد التشغيل', async () => {
  const { base, db } = await startServer();

  // تجربة نشطة الآن (بدأ قبل 5 أيام من 13)
  let menu = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(menu.json.open, true);

  // إنهاء التجربة
  await db.update('shops', 'shop_nile', { trial_ends_at: Date.now() - DAY });

  // قائمة العميل: غير متاح + رفض الطلب على مستوى الـ API
  menu = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(menu.status, 200);
  assert.equal(menu.json.open, false);
  assert.equal(menu.json.reason, 'locked');
  assert.equal(menu.json.shop.name, 'كافيه النيل');

  const order = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] },
  });
  assert.equal(order.status, 423);
  assert.equal(order.json.error.code, 'SHOP_CLOSED');

  // المالك يرى الحالة مغلقة وبيانات الاشتراك
  const ownerT = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const sum = await api(base, '/api/shop/summary', { token: ownerT });
  assert.equal(sum.json.shop.status, 'locked');

  // الموظف يرى رسالة الحالة أيضًا (لا يزال يمكنه متابعة طلبات قديمة)
  const staffT = await login(base, NILE_STAFF.email, NILE_STAFF.password);
  const staffSum = await api(base, '/api/shop/summary', { token: staffT });
  assert.equal(staffSum.json.shop.status, 'locked');

  // «تم الدفع» من الأدمن → شهر كامل → العودة للعمل
  const adminT = await login(base, ADMIN.email, ADMIN.password);
  const paid = await api(base, '/api/admin/shops/shop_nile/mark-paid', { token: adminT, method: 'POST' });
  assert.equal(paid.status, 200);
  assert.ok(paid.json.paid_until > Date.now() + 29 * DAY);

  menu = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(menu.json.open, true);

  const order2 = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] },
  });
  assert.equal(order2.status, 201);
});

test('تمديد الدفع يتراكم من تاريخ الانتهاء الحالي لا من الآن', async () => {
  const { base, db } = await startServer();
  const adminT = await login(base, ADMIN.email, ADMIN.password);
  const DAY = 86400000;
  const future = Date.now() + 10 * DAY;
  await db.update('shops', 'shop_nile', { paid_until: future });

  const paid = await api(base, '/api/admin/shops/shop_nile/mark-paid', { token: adminT, method: 'POST' });
  assert.ok(paid.json.paid_until > future + 29 * DAY);
  assert.ok(paid.json.paid_until < future + 31 * DAY);
});

test('القفل اليدوي من الأدمن يغلق المحل ويفتحه', async () => {
  const { base } = await startServer();
  const adminT = await login(base, ADMIN.email, ADMIN.password);

  const locked = await api(base, '/api/admin/shops/shop_nile/lock', { token: adminT, method: 'POST', body: { locked: true } });
  assert.equal(locked.status, 200);
  assert.equal(locked.json.locked, true);

  let menu = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(menu.json.open, false);

  // لاحظ: paid_until مستقبلية لكن القفل اليدوي أولوية
  const ownerT = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const sum = await api(base, '/api/shop/summary', { token: ownerT });
  assert.equal(sum.json.shop.status, 'locked');

  await api(base, '/api/admin/shops/shop_nile/lock', { token: adminT, method: 'POST', body: { locked: false } });
  menu = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(menu.json.open, true);
});

test('الأدمن يرى قائمة المحلات بالحالة الصحيحة', async () => {
  const { base, db } = await startServer();
  const adminT = await login(base, ADMIN.email, ADMIN.password);
  const list = await api(base, '/api/admin/shops', { token: adminT });
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 2);
  const nile = list.json.find((s) => s.slug === 'nile-cafe');
  assert.equal(nile.status, 'trial');
  assert.equal(nile.owner_email, 'owner@nile.app');
  assert.ok(nile.trial_ends_at > Date.now());
  assert.equal(nile.paid_until, null);
});
