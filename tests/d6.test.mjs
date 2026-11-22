import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, NILE_OWNER } from './helpers.mjs';

async function owner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  return r.json.token;
}
const TEA = { item_id: 'nit_tea', qty: 4, option_ids: [] }; // ≈60 جنيه

// ================= الإكرامية (D6) =================

test('D6: الإكرامية تُضاف فوق الإجمالي بعد الخصومات — ولا تدخل في سقف الاسترداد', async () => {
  const { base } = await startServer();
  const t = await owner(base);

  const o = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { service: 'takeaway', items: [TEA], tip: 5 },
  });
  assert.equal(o.status, 201);
  assert.equal(o.json.subtotal, 60);
  assert.equal(o.json.tip, 5);
  assert.equal(o.json.total, 65); // 60 + 5

  // تظهر في الحالة العامة
  const st = (await api(base, `/api/public/orders/${o.json.id}`)).json;
  assert.equal(st.tip, 5);
  assert.equal(st.total, 65);

  // إكرامية رديئة مرفوضة
  assert.equal((await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [TEA], tip: -3 } })).status, 400);
  assert.equal((await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [TEA], tip: 5000 } })).status, 400);

  // بدون إكرامية: tip = 0
  const o2 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [TEA] } });
  assert.equal(o2.json.tip, 0);
});

// ================= تقييم الطلب (D6) =================

test('D6: التقييم — نجوم 1..5، مرة واحدة فقط (409 على التكرار)، ويظهر في الحالة', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const o = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 4, items: [TEA] } });
  const id = o.json.id;

  // نجوم رديئة
  assert.equal((await api(base, `/api/public/orders/${id}/rating`, { method: 'POST', body: { stars: 0 } })).status, 400);
  assert.equal((await api(base, `/api/public/orders/${id}/rating`, { method: 'POST', body: { stars: 7 } })).status, 400);

  // تقييم صحيح
  const r = await api(base, `/api/public/orders/${id}/rating`, { method: 'POST', body: { stars: 5, comment: 'شاي ممتاز' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);

  // التكرار مرفوض
  assert.equal((await api(base, `/api/public/orders/${id}/rating`, { method: 'POST', body: { stars: 3 } })).status, 409);

  // الحالة تعرض التقييم
  const st = (await api(base, `/api/public/orders/${id}`)).json;
  assert.deepEqual(st.rating, { stars: 5, comment: 'شاي ممتاز' });

  // طلب غير موجود
  assert.equal((await api(base, '/api/public/orders/nonexistent-id-xyz/rating', { method: 'POST', body: { stars: 5 } })).status, 404);
});

// ================= التحليلات (D6) =================

test('D6: التحليلات — إيراد/متوسط سلة/أصناف/ساعات/فروع/تقييمات محسوبة خادميًا', async () => {
  const { base } = await startServer();
  const t = await owner(base);

  // فرع + طلبات معروفة
  const br = (await api(base, '/api/shop/branches', { token: t, method: 'POST', body: { name: 'فرع التحليلات' } })).json;
  const a = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [TEA], branch_id: br.id, tip: 5 } }); // 65
  assert.equal(a.status, 201);
  const b = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [{ ...TEA, qty: 8 }] } }); // 120
  assert.equal(b.status, 201);

  // تقييمات: 5★ و 4★ → متوسط 4.5
  assert.equal((await api(base, `/api/public/orders/${a.json.id}/rating`, { method: 'POST', body: { stars: 5 } })).status, 200);
  assert.equal((await api(base, `/api/public/orders/${b.json.id}/rating`, { method: 'POST', body: { stars: 4 } })).status, 200);

  // مالك فقط — الموظف 403
  const st = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'staff@nile.app', password: 'staff123' } });
  assert.equal((await api(base, '/api/shop/analytics', { token: st.json.token })).status, 403);

  const an = (await api(base, '/api/shop/analytics?days=7', { token: t })).json;
  assert.equal(an.days, 7);
  assert.equal(an.orders_count >= 2, true); // بذرة الديمو قد تحوي طلبات — نتأكد من طلبينا
  assert.equal(an.revenue >= 185, true); // 65 + 120 على الأقل
  assert.equal(an.tips_total >= 5, true);
  assert.equal(an.ratings.count, 2);
  assert.equal(an.ratings.avg, 4.5);
  assert.deepEqual(an.ratings.dist, [0, 0, 0, 1, 1]);
  assert.equal(an.hourly.length, 24);
  assert.equal(an.hourly.reduce((x, y) => x + y, 0) >= 2, true);

  // الأكثر مبيعًا يشمل الشاي
  assert.equal(an.top_items.some((i) => i.name === 'شاي بالنعناع'), true);
  const tea = an.top_items.find((i) => i.name === 'شاي بالنعناع');
  assert.equal(tea.qty >= 12, true); // 4 + 8

  // الفرع ظهر بأدائه
  const brRow = an.branches.find((x) => x.name === 'فرع التحليلات');
  assert.ok(brRow);
  assert.equal(brRow.orders, 1);
  assert.equal(brRow.revenue, 65);
});

// ================= النسخة الاحتياطية (D6) =================

test('D6: تصدير JSON كامل — مالك فقط، ويحوي كل المجموعات', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const st = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'staff@nile.app', password: 'staff123' } });

  // موظف حتى بكل الصلاحيات لا يصدر نسخة — مالك حصرًا
  assert.equal((await api(base, '/api/shop/export', { token: st.json.token })).status, 403);

  const res = await api(base, '/api/shop/export', { token: t });
  assert.equal(res.status, 200);
  assert.equal(res.json.schema, 'z-qr-code-export-1');
  assert.equal(res.json.shop.slug, 'nile-cafe');
  assert.equal(Array.isArray(res.json.categories) && res.json.categories.length > 0, true);
  assert.equal(Array.isArray(res.json.items) && res.json.items.length > 0, true);
  assert.equal(Array.isArray(res.json.orders), true);
  assert.equal(Array.isArray(res.json.option_groups) && Array.isArray(res.json.options), true);
  assert.equal(Array.isArray(res.json.branches), true);
  assert.equal(Array.isArray(res.json.loyalty_accounts), true);
});

// ================= اسأل المنيو (D6) =================

test('D6: اسأل المنيو — بلا مفتاح 503، وبمفتاح مزيّف يجيب من السياق المزروع', async () => {
  // خادم بلا GEMINI_API_KEY
  const noKey = await startServer({ env: {} });
  assert.equal((await api(noKey.base, '/api/public/shops/nile-cafe/ask', { method: 'POST', body: { question: 'ما الأرخص؟' } })).status, 503);

  // خادم بمفتاح + fetch مزيّف يفحص أن السياق يحوي بيانات المنيو
  const { base } = await startServer({ env: { GEMINI_API_KEY: 'test-key' } });
  let captured = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('generativelanguage')) {
      captured = { url: String(url), body: JSON.parse(init.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'أرخص صنف هو شاي بالنعناع بسعر 15 جنيهًا.' }] } }] }),
      };
    }
    return realFetch(url, init);
  };
  try {
    // سؤال فارغ 400
    assert.equal((await api(base, '/api/public/shops/nile-cafe/ask', { method: 'POST', body: { question: '   ' } })).status, 400);

    const r = await api(base, '/api/public/shops/nile-cafe/ask', { method: 'POST', body: { question: 'ما أرخص صنف؟' } });
    assert.equal(r.status, 200);
    assert.ok(r.json.answer.includes('شاي بالنعناع'));
    assert.ok(captured);
    assert.ok(captured.url.includes(':generateContent'));
    // السياق يحمل اسم صنف وسعرًا من المنيو الفعلي
    assert.ok(captured.body.contents[0].parts[0].text.includes('شاي بالنعناع'));
    assert.ok(captured.body.contents[0].parts[0].text.includes('price 15'));
  } finally {
    globalThis.fetch = realFetch;
  }

  // بلا سؤال
  assert.equal((await api(base, '/api/public/shops/nile-cafe/ask', { method: 'POST', body: {} })).status, 400);
});
