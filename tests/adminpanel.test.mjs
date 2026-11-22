import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, ADMIN, NILE_OWNER, NILE_STAFF } from './helpers.mjs';

/** توكن أدمن جاهز */
async function admin(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: ADMIN });
  return r.json.token;
}

async function owner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  return r.json.token;
}

test('نظرة عامة (overview): مقاييس المحلات والطلبات والإيراد المتوقع', async () => {
  const { base } = await startServer();
  const a = await admin(base);
  const ov = await api(base, '/api/admin/overview', { token: a });
  assert.equal(ov.status, 200);
  assert.equal(ov.json.shops_total, 2); // النيل + برجر بالبذرة
  assert.equal(ov.json.shops_free, 2);
  assert.equal(ov.json.mrr_estimate, 0);
  assert.equal(ov.json.monthly_price, 300);
  assert.ok(ov.json.items_total > 0);
  assert.ok(ov.json.orders_month >= 0);

  // طلب + ترقية pro → المقاييس تتحرك والإيراد = pro×300
  await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] } });
  const shopId = (await api(base, '/api/admin/shops', { token: a })).json.find((s) => s.slug === 'nile-cafe').id;
  await api(base, `/api/admin/shops/${shopId}/plan`, { token: a, method: 'POST', body: { plan: 'pro' } });
  const ov2 = await api(base, '/api/admin/overview', { token: a });
  assert.equal(ov2.json.shops_pro, 1);
  assert.equal(ov2.json.mrr_estimate, 300);
  assert.equal(ov2.json.orders_today, ov.json.orders_today + 1);
  assert.equal(ov2.json.orders_month, ov.json.orders_month + 1);

  // الموظف ممنوع
  const st = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  const f = await api(base, '/api/admin/overview', { token: st.json.token });
  assert.equal(f.status, 403);
});

test('بحث المحلات ?q=: بالاسم والرابط وبريد المالك، وفلتر الأرشيف', async () => {
  const { base } = await startServer();
  const a = await admin(base);

  const bySlug = await api(base, '/api/admin/shops?q=nile', { token: a });
  assert.equal(bySlug.status, 200);
  assert.ok(bySlug.json.some((s) => s.slug === 'nile-cafe'));
  assert.ok(!bySlug.json.some((s) => s.slug === 'burger-spot'));

  const byEmail = await api(base, '/api/admin/shops?q=owner@burger', { token: a });
  assert.ok(byEmail.json.some((s) => s.slug === 'burger-spot'));

  const miss = await api(base, '/api/admin/shops?q=nonexistent-xyz', { token: a });
  assert.equal(miss.json.length, 0);

  // أرشفة النيل → يختفي من الافتراضي ويظهر مع archived=1
  const nile = (await api(base, '/api/admin/shops', { token: a })).json.find((s) => s.slug === 'nile-cafe');
  const arc = await api(base, `/api/admin/shops/${nile.id}/archive`, { token: a, method: 'POST', body: { archived: true } });
  assert.equal(arc.status, 200);
  const def = await api(base, '/api/admin/shops', { token: a });
  assert.ok(!def.json.some((s) => s.slug === 'nile-cafe'));
  const arch = await api(base, '/api/admin/shops?archived=1', { token: a });
  assert.ok(arch.json.some((s) => s.slug === 'nile-cafe'));

  // استعادة → يعود
  await api(base, `/api/admin/shops/${nile.id}/archive`, { token: a, method: 'POST', body: { archived: false } });
  const back = await api(base, '/api/admin/shops', { token: a });
  assert.ok(back.json.some((s) => s.slug === 'nile-cafe'));
});

test('المحل المؤرشف مخفي من الزبائن: المنيو 404 والطلب 404', async () => {
  const { base } = await startServer();
  const a = await admin(base);
  const nile = (await api(base, '/api/admin/shops', { token: a })).json.find((s) => s.slug === 'nile-cafe');
  await api(base, `/api/admin/shops/${nile.id}/archive`, { token: a, method: 'POST', body: { archived: true } });

  const menu = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(menu.status, 404);

  const order = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] } });
  assert.equal(order.status, 404);
});

test('إعادة تعيين كلمة مرور المالك: مولّدة تعمل فورًا وتُبطل الجلسات القديمة', async () => {
  const { base } = await startServer();
  const a = await admin(base);
  const t = await owner(base);
  const nile = (await api(base, '/api/admin/shops', { token: a })).json.find((s) => s.slug === 'nile-cafe');

  // الجلسة القديمة تعمل قبل الإعادة
  assert.equal((await api(base, '/api/shop/orders', { token: t })).status, 200);

  const r = await api(base, `/api/admin/shops/${nile.id}/reset-owner-password`, { token: a, method: 'POST', body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.email, 'owner@nile.app');
  assert.equal(r.json.generated, true);
  assert.match(r.json.password, /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);

  // الجلسة القديمة أُبطلت (token_version)
  assert.equal((await api(base, '/api/shop/orders', { token: t })).status, 401);

  // الدخول بالكلمة الجديدة يعمل
  const login = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'owner@nile.app', password: r.json.password } });
  assert.equal(login.status, 200);

  // كلمة م مقدمة قصيرة → 400، وطويلة تُعتمد
  const weak = await api(base, `/api/admin/shops/${nile.id}/reset-owner-password`, { token: a, method: 'POST', body: { password: '123' } });
  assert.equal(weak.status, 400);
  const strong = await api(base, `/api/admin/shops/${nile.id}/reset-owner-password`, { token: a, method: 'POST', body: { password: 'newpass123' } });
  assert.equal(strong.json.generated, false);
  const login2 = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'owner@nile.app', password: 'newpass123' } });
  assert.equal(login2.status, 200);
});
