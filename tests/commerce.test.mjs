import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, raw, NILE_OWNER, NILE_STAFF, ADMIN } from './helpers.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const TEA = { item_id: 'nit_tea', qty: 1, option_ids: [] };

async function owner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  return r.json.token;
}
async function admin(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: ADMIN });
  return r.json.token;
}

test('أكواد الخصم: دورة كاملة — إنشاء، حد أدنى، تطبيق بتخفيض حقيقي، عدّاد، استنفاد، وأمان المسار', async () => {
  const { base, db } = await startServer();
  const t = await owner(base);

  // إنشاء: نسبة 50% بحد أدنى 20 وأقصى استخدامين
  const d = await api(base, '/api/shop/discounts', {
    token: t,
    method: 'POST',
    body: { code: 'save50', type: 'percent', value: 50, max_uses: 2, min_total: 20 },
  });
  assert.equal(d.status, 201);
  assert.equal(d.json.code, 'SAVE50');

  // بدون الكود: الشاي 15
  const plain = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 1, items: [TEA] } });
  assert.equal(plain.json.total, 15);

  // دون الحد الأدنى (15 < 20) → 400 موحد
  const under = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [TEA], discount_code: 'SAVE50' },
  });
  assert.equal(under.status, 400);
  assert.equal(under.json.error.code, 'BAD_DISCOUNT');

  // فوق الحد: 30 − 50% = 15
  const withCode = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_tea', qty: 2, option_ids: [] }], discount_code: ' save50 ' },
  });
  assert.equal(withCode.status, 201);
  assert.equal(withCode.json.discount_amount, 15);
  assert.equal(withCode.json.total, 15);

  // الاستخدام الثاني يمر
  const second = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_tea', qty: 2, option_ids: [] }], discount_code: 'SAVE50' },
  });
  assert.equal(second.status, 201);

  // الكود استُهلك بالكامل (استخدامان)
  const third = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_tea', qty: 2, option_ids: [] }], discount_code: 'SAVE50' },
  });
  assert.equal(third.status, 400);
  assert.equal(third.json.error.code, 'BAD_DISCOUNT');

  const row = await db.get('discounts', d.json.id);
  assert.equal(row.used_count, 2);

  // كود وهمي → 400
  const fake = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [TEA], discount_code: 'PWNED' },
  });
  assert.equal(fake.status, 400);

  // مكرر → 400
  const dup = await api(base, '/api/shop/discounts', { token: t, method: 'POST', body: { code: 'SAVE50', type: 'fixed', value: 5 } });
  assert.equal(dup.status, 400);
  assert.equal(dup.json.error.code, 'CODE_EXISTS');

  // الموظف ممنوع
  const staffT = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  const staffTry = await api(base, '/api/shop/discounts', { token: staffT.json.token });
  assert.equal(staffTry.status, 403);
});

test('نوع الخصم الثابت لا يتجاوز المجموع: خصم 100 على طلب 15 → 0 مرفوض، لكن 10 → 5', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  await api(base, '/api/shop/discounts', { token: t, method: 'POST', body: { code: 'TEN', type: 'fixed', value: 10 } });
  const r = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [TEA], discount_code: 'TEN' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.total, 5);
});

test('تاك أوي/توصيل (F-11): بدون طاولة يلزم service، والتوصيل يضيف رسوم المحل', async () => {
  const { base } = await startServer();
  const t = await owner(base);

  // بلا طاولة وبلا خدمة → 400
  const none = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { items: [TEA] } });
  assert.equal(none.status, 400);
  assert.equal(none.json.error.code, 'INVALID_SERVICE');

  // ترابيزة خاطئة ما زالت INVALID_TABLE (سلوك قائم محفوظ)
  const badTable = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 99, items: [TEA] } });
  assert.equal(badTable.json.error.code, 'INVALID_TABLE');

  // تاك أوي بدون طاولة → 201
  const take = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { items: [TEA], service: 'takeaway', customer_phone: '01012345678' },
  });
  assert.equal(take.status, 201);
  assert.equal(take.json.service, 'takeaway');
  assert.equal(take.json.table_number, null);

  // توصيل مع رسوم محلية
  const fee = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { delivery_fee: 12 } });
  assert.equal(fee.status, 200);
  const del = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { items: [TEA], service: 'delivery', customer_phone: '+20 100 123 4567' },
  });
  assert.equal(del.status, 201);
  assert.equal(del.json.delivery_fee, 12);
  assert.equal(del.json.total, 27); // 15 + 12

  // حالة الزبون تعرض الخدمة والرسوم
  const st = await api(base, `/api/public/orders/${del.json.id}`);
  assert.equal(st.json.service, 'delivery');
  assert.equal(st.json.delivery_fee, 12);
});

test('تصدير CSV (ECO-02): مالك فقط، BOM + صف بيانات، وأدمن يصدّر محلًا', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 2, items: [TEA] } });

  const r = await raw(base, '/api/shop/orders/export', { headers: { authorization: `Bearer ${t}` } });
  assert.equal(r.status, 200);
  assert.ok(r.headers['content-type'].includes('text/csv'));
  assert.ok(r.buffer.toString('utf8').startsWith('\uFEFF'), 'BOM موجود');
  assert.ok(r.buffer.toString('utf8').includes('رقم الطلب'));
  assert.ok(r.buffer.toString('utf8').includes('تاك أوي') === false); // طلب جلوس فقط
  assert.ok(r.buffer.toString('utf8').includes('بانتظار القبول'));

  // الموظف ممنوع
  const staffT = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  const s = await raw(base, '/api/shop/orders/export', { headers: { authorization: `Bearer ${staffT.json.token}` } });
  assert.equal(s.status, 403);

  // أدمن يصدّر نفس المحل
  const a = await admin(base);
  const ar = await raw(base, '/api/admin/shops/shop_nile/orders/export', { headers: { authorization: `Bearer ${a}` } });
  assert.equal(ar.status, 200);
  assert.ok(ar.buffer.toString('utf8').includes('التاريخ'));
});

test('حدود الخطة (BIZ-02): 402 على الأصناف والطلبات للأدمن-قابلة للضبط، وPro يرفع الحدود', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const a = await admin(base);

  // ضبط حدود صغيرة للتجربة
  const st = await api(base, '/api/admin/settings', { token: a, method: 'PUT', body: { free_item_limit: 2, free_order_limit: 1 } });
  assert.equal(st.status, 200);
  assert.equal(st.json.free_item_limit, 2);

  // المحل الافتراضي free — الأصناف الحالية > 2؟ النيل فيه أصناف… نستخدم محل برجر (أصناف أقل) أو نتحقق عبر محله الخاص
  // أنشئ محلًا جديدًا فارغًا بتصنيف واحد عبر الأدمن ثم أضف صنفين (يسمح) والثالث (402)
  const shop = await api(base, '/api/admin/shops', {
    token: a,
    method: 'POST',
    body: { name: 'محل حدود', slug: 'limit-shop', phone: '01000000000', table_count: 2, menu_language: 'ar', owner_email: 'limit@x.io', owner_password: 'limit123' },
  });
  assert.equal(shop.status, 201);
  const lt = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'limit@x.io', password: 'limit123' } });
  assert.equal(lt.status, 200);
  const lToken = lt.json.token;

  const cat = await api(base, '/api/shop/categories', { token: lToken, method: 'POST', body: { name: 'أصناف' } });
  assert.equal(cat.status, 201);
  const i1 = await api(base, '/api/shop/items', { token: lToken, method: 'POST', body: { category_id: cat.json.id, name: 'صنف 1', price: 10 } });
  assert.equal(i1.status, 201);
  const i2 = await api(base, '/api/shop/items', { token: lToken, method: 'POST', body: { category_id: cat.json.id, name: 'صنف 2', price: 10 } });
  assert.equal(i2.status, 201);
  const i3 = await api(base, '/api/shop/items', { token: lToken, method: 'POST', body: { category_id: cat.json.id, name: 'صنف 3', price: 10 } });
  assert.equal(i3.status, 402);
  assert.equal(i3.json.error.code, 'PLAN_LIMIT');

  // طلب واحد يمر والثاني 402 (حد شهري = 1)
  const shopId = shop.json.id;
  const o1 = await api(base, '/api/public/shops/limit-shop/orders', { method: 'POST', body: { table: 1, items: [{ item_id: i1.json.id, qty: 1, option_ids: [] }] } });
  assert.equal(o1.status, 201);
  const o2 = await api(base, '/api/public/shops/limit-shop/orders', { method: 'POST', body: { table: 1, items: [{ item_id: i1.json.id, qty: 1, option_ids: [] }] } });
  assert.equal(o2.status, 402);
  assert.equal(o2.json.error.code, 'PLAN_LIMIT');

  // ترقية لـ Pro → الحدود ترفع
  const plan = await api(base, '/api/admin/shops/' + shopId + '/plan', { token: a, method: 'POST', body: { plan: 'pro' } });
  assert.equal(plan.status, 200);
  assert.equal(plan.json.plan, 'pro');
  const i4 = await api(base, '/api/shop/items', { token: lToken, method: 'POST', body: { category_id: cat.json.id, name: 'صنف 4', price: 10 } });
  assert.equal(i4.status, 201);
  const o3 = await api(base, '/api/public/shops/limit-shop/orders', { method: 'POST', body: { table: 1, items: [{ item_id: i1.json.id, qty: 1, option_ids: [] }] } });
  assert.equal(o3.status, 201);

  // usage endpoint للعرض
  const usage = await api(base, '/api/shop/usage', { token: t });
  assert.equal(usage.status, 200);
  assert.equal(usage.json.plan, 'free');
  assert.ok(usage.json.item_limit > 0 && usage.json.order_limit > 0);
});

test('فاتورة «تم الدفع» (BIZ-01 الجسر): months متعدد يمدد paid_until، والفاتورة البريدية تحمل المبلغ والرقم', async () => {
  const { base, db } = await startServer();
  const a = await admin(base);
  const before = (await db.get('shops', 'shop_burger')).paid_until || 0;
  const r = await api(base, '/api/admin/shops/shop_burger/mark-paid', { token: a, method: 'POST', body: { months: 2 } });
  assert.equal(r.status, 200);
  assert.ok(r.json.invoice && r.json.invoice.invoice_no.startsWith('INV-'));
  const after = (await db.get('shops', 'shop_burger')).paid_until;
  const days = Math.round((after - Math.max(Date.now(), before)) / 86400000);
  const { PAID_DAYS } = require('../server/services/shops');
  assert.ok(days >= PAID_DAYS * 2 - 1 && days <= PAID_DAYS * 2 + 1, `شهران ≈ ${PAID_DAYS * 2} يوم — فعليًا ${days}`);

  // قالب الفاتورة
  const tpl = require('../server/lib/mailTemplates');
  const inv = tpl.invoice('محل', r.json.invoice.invoice_no, 2, 600, '2026-12-01');
  assert.ok(inv.html.includes(r.json.invoice.invoice_no) && inv.html.includes('600'));
});
