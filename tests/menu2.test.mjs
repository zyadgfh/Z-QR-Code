import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, NILE_OWNER } from './helpers.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const shopsService = require('../server/services/shops');

async function ownerToken(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  assert.equal(r.status, 200);
  return r.json.token;
}

test('نفد اليوم: يظهر معتيمًا في المنيو العام ويُرفض من الخادم بلا حذف', async () => {
  const { base } = await startServer();
  const t = await ownerToken(base);

  const pub1 = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(pub1.status, 200);
  assert.ok(pub1.json.items.find((i) => i.id === 'nit_mango'));

  await api(base, '/api/shop/items/nit_mango', {
    token: t,
    method: 'PUT',
    body: { name: 'مانجو', price: 50, sold_out: true },
  });

  // يظل ظاهرًا بعلامة sold_out (يتيم في الواجهة)
  const pub2 = await api(base, '/api/public/shops/nile-cafe/menu');
  const mango = pub2.json.items.find((i) => i.id === 'nit_mango');
  assert.ok(mango, 'النافد يظل في القائمة');
  assert.equal(mango.sold_out, true);

  // الطلب عليه مرفوض من الخادم
  const order = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_mango', qty: 1, option_ids: [] }] },
  });
  assert.equal(order.status, 400);
  assert.equal(order.json.error.code, 'ITEM_SOLD_OUT');

  // المخفي (available=false) يختفي كما كان — سلوك قائم لا يُكسر
  await api(base, '/api/shop/items/nit_latte', {
    token: t,
    method: 'PUT',
    body: { name: 'لاتيه', price: 30, available: false },
  });
  const pub3 = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.ok(!pub3.json.items.find((i) => i.id === 'nit_latte'));
});

test('حقول الصنف: وصف إنجليزي + مسببات حساسية + سعرات ووزن تصل للمنيو العام', async () => {
  const { base } = await startServer();
  const t = await ownerToken(base);
  const item = await api(base, '/api/shop/items', {
    token: t,
    method: 'POST',
    body: {
      category_id: 'ncat_hot',
      name: 'عصير فراولة',
      price: 45,
      description: 'فراولة طازجة',
      description_en: 'Fresh strawberry juice',
      allergens: ['جلوتين', 'لاكتوز'],
      calories: 180,
      weight_g: 350,
    },
  });
  assert.equal(item.status, 201);

  const bad = await api(base, '/api/shop/items', {
    token: t,
    method: 'POST',
    body: { category_id: 'ncat_hot', name: 'خطأ', price: 10, allergens: Array(9).fill('x') },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'INVALID_ALLERGENS');

  const pub = await api(base, '/api/public/shops/nile-cafe/menu');
  const fresh = pub.json.items.find((i) => i.id === item.json.id);
  assert.equal(fresh.description_en, 'Fresh strawberry juice');
  assert.deepEqual(fresh.allergens, ['جلوتين', 'لاكتوز']);
  assert.equal(fresh.calories, 180);
  assert.equal(fresh.weight_g, 350);
});

test('مواعيد العمل: اليوم المغلق يغلق الطلبات (423 SHOP_HOURS) والنافذة النهارية تسمح', async () => {
  const { base } = await startServer();
  const t = await ownerToken(base);
  const today = new Date().getDay();

  // كل الأيام مغلقة → المنيو يظهر لكن مغلق + الطلب مرفوض
  const allClosed = Array(7).fill(null);
  const set1 = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { hours: allClosed } });
  assert.equal(set1.status, 200);
  const pub1 = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(pub1.json.open, false);
  assert.equal(pub1.json.reason, 'closed_hours');
  const order1 = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] },
  });
  assert.equal(order1.status, 423);
  assert.equal(order1.json.error.code, 'SHOP_HOURS');

  // نافذة 24 ساعة اليوم → يفتح ويقبل الطلب
  const allDay = Array(7).fill(null).map((_, i) => (i === today ? { open: '00:00', close: '23:59' } : null));
  const set2 = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { hours: allDay } });
  assert.equal(set2.status, 200);
  const pub2 = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(pub2.json.open, true);
  const order2 = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] },
  });
  assert.equal(order2.status, 201);

  // صيغة خاطئة → 400
  const bad = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { hours: Array(7).fill({ open: '9am', close: '5pm' }) } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'INVALID_HOURS');

  // إلغاء المواعيد → مفتوح دائمًا
  await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { hours: null } });
  const pub3 = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(pub3.json.open, true);
});

test('isOpenNow: نافذة تعبر منتصف الليل (22:00→02:00) صحيحة عند 23:30 و01:00 ومغلقة 03:00', async () => {
  const shop = { hours: Array(7).fill(null).map((_, i) => (i === 1 ? { open: '22:00', close: '02:00' } : null)) };
  const mk = (day, h, m) => {
    // الأسبوع 2024-01-07 = أحد (day=0) … الاثنين day=1
    return new Date(2024, 0, 7 + day, h, m).getTime();
  };
  assert.equal(shopsService.isOpenNow(shop, mk(1, 23, 30)), true);
  assert.equal(shopsService.isOpenNow(shop, mk(2, 0, 30)), true); // بعد منتصف الليل من يوم الاثنين
  assert.equal(shopsService.isOpenNow(shop, mk(2, 3, 0)), false);
  assert.equal(shopsService.isOpenNow({ hours: null }), true); // بلا مواعيد = مفتوح
});

test('ثيم ولون الهوية: يُقبلان بصيغة صحيحة ويرفضان خاطئين ويردان مع المنيو', async () => {
  const { base } = await startServer();
  const t = await ownerToken(base);
  const ok = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { theme: 'neon', brand_color: '#FF6A00' } });
  assert.equal(ok.status, 200);
  const badTheme = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { theme: 'matrix' } });
  assert.equal(badTheme.status, 400);
  const badColor = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { brand_color: 'red' } });
  assert.equal(badColor.status, 400);
  const pub = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(pub.json.shop.theme, 'neon');
  assert.equal(pub.json.shop.brand_color, '#ff6a00');
});

test('ترجمة AI (A-01): بلا مفتاح → 503، ومع مفتاح ومحاكاة Gemini → اقتراحات نظيفة بلا كتابة في القاعدة', async () => {
  const { base, db } = await startServer();
  const t = await ownerToken(base);

  const noKey = await api(base, '/api/shop/menu/translate', { token: t, method: 'POST' });
  assert.equal(noKey.status, 503);
  assert.equal(noKey.json.error.code, 'AI_NOT_CONFIGURED');

  // محاكاة رد Gemini
  const geminiReply = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                categories: [{ id: 'ncat_hot', name_en: 'Hot Drinks' }],
                items: [
                  { id: 'nit_tea', name_en: 'Egyptian Tea', description_en: 'Strong black tea' },
                  { id: 'nit_latte', name_en: 'Latte', description_en: null },
                  { id: 'hacker_injected', name_en: 'PWNED' }, // يُرفض: معرف غير موجود
                ],
              }),
            },
          ],
        },
      },
    ],
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage')) return new Response(JSON.stringify(geminiReply), { status: 200 });
    return origFetch(url);
  };
  try {
    const { base: b2, db: db2 } = await startServer({ env: { GEMINI_API_KEY: 'TESTKEY' } });
    const t2 = await ownerToken(b2);
    const tr = await api(b2, '/api/shop/menu/translate', { token: t2, method: 'POST' });
    assert.equal(tr.status, 200);
    assert.equal(tr.json.items.length, 2);
    assert.ok(!tr.json.items.find((x) => x.id === 'hacker_injected'), 'المعرفات الأجنبية تُرشّح');
    assert.equal(tr.json.items.find((x) => x.id === 'nit_tea').name_en, 'Egyptian Tea');
    // لا كتابة: العنصر ما زال بلا name_en في القاعدة
    const after = await db2.get('items', 'nit_tea');
    assert.equal(after.name_en, 'Mint Tea'); // بلا كتابة: قيمة البذرة باقية
  } finally {
    globalThis.fetch = origFetch;
  }
  void db;
});
