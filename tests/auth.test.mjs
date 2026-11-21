import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, login, ADMIN, NILE_OWNER, NILE_STAFF, BURGER_OWNER } from './helpers.mjs';

test('تسجيل الدخول: بيانات صحيحة وغير صحيحة', async () => {
  const { base } = await startServer();

  const bad1 = await api(base, '/api/auth/login', { method: 'POST', body: { email: NILE_OWNER.email, password: 'wrong' } });
  assert.equal(bad1.status, 401);
  assert.equal(bad1.json.error.code, 'BAD_CREDENTIALS');

  const bad2 = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'nobody@x.app', password: 'owner123' } });
  assert.equal(bad2.status, 401);

  const bad3 = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'not-an-email', password: 'x' } });
  assert.equal(bad3.status, 400);

  const ok = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.token);
  assert.equal(ok.json.user.role, 'owner');
});

test('/me يعيد المستخدم وعضويته مع بيانات المحل', async () => {
  const { base } = await startServer();
  const token = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const me = await api(base, '/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, NILE_OWNER.email);
  assert.equal(me.json.memberships.length, 1);
  assert.equal(me.json.memberships[0].role, 'owner');
  assert.equal(me.json.memberships[0].shop.slug, 'nile-cafe');
  assert.ok(me.json.memberships[0].shop.status);
});

test('رمز مُعبّث أو مفقود → 401', async () => {
  const { base } = await startServer();
  const token = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const tampered = token.slice(0, -3) + 'xxx';

  assert.equal((await api(base, '/api/auth/me', { token: tampered })).status, 401);
  assert.equal((await api(base, '/api/auth/me')).status, 401);
  assert.equal((await api(base, '/api/shop/summary', { token: tampered })).status, 401);
});

test('الأدوار: الموظف والأدمن والعزل بين نقاط النهاية', async () => {
  const { base } = await startServer();
  const adminT = await login(base, ADMIN.email, ADMIN.password);
  const ownerT = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const staffT = await login(base, NILE_STAFF.email, NILE_STAFF.password);
  const burgerT = await login(base, BURGER_OWNER.email, BURGER_OWNER.password);

  // أدمن المنصة فقط يرى المتاجر
  assert.equal((await api(base, '/api/admin/shops', { token: adminT })).status, 200);
  assert.equal((await api(base, '/api/admin/shops', { token: staffT })).status, 403);
  assert.equal((await api(base, '/api/admin/shops', { token: ownerT })).status, 403);
  assert.equal((await api(base, '/api/admin/shops')).status, 401);

  // الموظف لا يفتح المنيو/الإعدادات/الموظفين (فرض الخادم لا الأزرار)
  assert.equal((await api(base, '/api/shop/menu', { token: staffT })).status, 403);
  assert.equal((await api(base, '/api/shop/settings', { token: staffT, method: 'PUT', body: { phone: '0100' } })).status, 403);
  assert.equal((await api(base, '/api/shop/staff', { token: staffT })).status, 403);
  assert.equal((await api(base, '/api/shop/categories', { token: staffT, method: 'POST', body: { name: 'x' } })).status, 403);
  assert.equal((await api(base, '/api/shop/ai/extract-menu', { token: staffT, method: 'POST', body: { images: [] } })).status, 403);

  // مالك محل لا يصل لبيانات أدمن المنصة ولا موظفين محل آخر — لكن يعمل داخل محله
  assert.equal((await api(base, '/api/shop/staff', { token: ownerT })).status, 200);
  assert.equal((await api(base, '/api/shop/staff', { token: burgerT })).status, 200);
});

test('الأدمن ينشئ محلًا جديدًا بصاحبه ويُسجَّل المالك الدخول', async () => {
  const { base, db } = await startServer();
  const adminT = await login(base, ADMIN.email, ADMIN.password);

  const dup = await api(base, '/api/admin/shops', {
    token: adminT,
    method: 'POST',
    body: { name: 'مكرر', slug: 'nile-cafe', phone: '0100000000', table_count: 3, menu_language: 'ar', owner_email: 'new@x.app', owner_password: 'pass123' },
  });
  assert.equal(dup.status, 400);
  assert.equal(dup.json.error.code, 'SLUG_TAKEN');

  const created = await api(base, '/api/admin/shops', {
    token: adminT,
    method: 'POST',
    body: { name: 'محل الاختبار', slug: 'test-shop', phone: '01234567890', table_count: 4, menu_language: 'ar', owner_email: 'newowner@x.app', owner_password: 'pass123' },
  });
  assert.equal(created.status, 201);

  const ownerT = await login(base, 'newowner@x.app', 'pass123');
  const sum = await api(base, '/api/shop/summary', { token: ownerT });
  assert.equal(sum.status, 200);
  assert.equal(sum.json.shop.slug, 'test-shop');
  assert.equal(sum.json.shop.status, 'trial');
  assert.ok(sum.json.shop.days_left > 10 && sum.json.shop.days_left <= 13);
  assert.equal(sum.json.subscription.monthly_price, 300);

  // المنيو يبدأ فارغًا
  const menu = await api(base, '/api/shop/menu', { token: ownerT });
  assert.equal(menu.status, 200);
  assert.deepEqual(menu.json.categories, []);
});

test('الأدمن يعدّل إعدادات المنصة (السعر وتعليمات الدفع)', async () => {
  const { base } = await startServer();
  const adminT = await login(base, ADMIN.email, ADMIN.password);

  const bad = await api(base, '/api/admin/settings', { token: adminT, method: 'PUT', body: { monthly_price: -5 } });
  assert.equal(bad.status, 400);

  const ok = await api(base, '/api/admin/settings', { token: adminT, method: 'PUT', body: { monthly_price: 350, payment_instructions: 'حوّل على 0100' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.monthly_price, 350);

  const ownerT = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const sum = await api(base, '/api/shop/summary', { token: ownerT });
  assert.equal(sum.json.subscription.monthly_price, 350);
  assert.equal(sum.json.subscription.payment_instructions, 'حوّل على 0100');
});
