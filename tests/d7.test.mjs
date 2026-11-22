import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, NILE_OWNER, NILE_STAFF } from './helpers.mjs';

async function owner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  return r.json.token;
}
async function staff(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  return r.json.token;
}

// PNG رأس صالح + بيانات وهمية — التحقق في الخادم على الطول فقط
const PNG_B64 = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') + 'AAAA';

// ================= توليد صورة الصنف (D7) =================

test('D7: البوابات — بلا مفتاح 503، موظف بلا menu 403، صنف محل آخر 404', async () => {
  const noKey = await startServer({ env: {} });
  const t0 = await owner(noKey.base);
  const r0 = await api(noKey.base, '/api/shop/items/nit_tea/generate-image', { method: 'POST', token: t0 });
  assert.equal(r0.status, 503);
  assert.equal(r0.json.error.code, 'AI_NOT_CONFIGURED');

  const { base } = await startServer({ env: { GEMINI_API_KEY: 'k' } });
  const t = await owner(base);

  // الموظف الافتراضي (طلبات فقط) → 403 خادمي
  const st = await staff(base);
  assert.equal((await api(base, '/api/shop/items/nit_tea/generate-image', { method: 'POST', token: st })).status, 403);

  // صنف من محل آخر (برغر) حتى مع المالك → 404 (لا كشف وجود)
  assert.equal((await api(base, '/api/shop/items/bit_fries/generate-image', { method: 'POST', token: t })).status, 404);
});

test('D7: المسار السعيد — النموذج والبرومبت صحيحان، الصورة تُحفظ وتُخدم وتُربط بالصنف', async () => {
  const { base } = await startServer({ env: { GEMINI_API_KEY: 'k' } });
  const t = await owner(base);

  let captured = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('generativelanguage')) {
      captured = { url: String(url), body: JSON.parse(init.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_B64 } }] } }] }),
      };
    }
    return realFetch(url, init);
  };
  try {
    const r = await api(base, '/api/shop/items/nit_tea/generate-image', { method: 'POST', token: t });
    assert.equal(r.status, 200);
    assert.ok(r.json.photo_url.startsWith('/api/files/'));

    // نداء النموذج: gemini-3.1-flash-image-preview + IMAGE modality + اسم الصنف بالبرومبت
    assert.ok(captured);
    assert.ok(captured.url.includes('/models/gemini-3.1-flash-image-preview:generateContent'));
    assert.deepEqual(captured.body.generationConfig.responseModalities, ['IMAGE']);
    assert.equal(captured.body.generationConfig.imageConfig.aspectRatio, '1:1');
    const text = captured.body.contents[0].parts[0].text;
    assert.ok(text.includes('شاي بالنعناع'));
    assert.ok(text.includes('No text')); // تعليمات بلا نصوص/شعارات

    // الصنف محدث بالصورة الجديدة
    const menu = (await api(base, '/api/shop/menu', { token: t })).json;
    assert.equal(menu.items.find((i) => i.id === 'nit_tea').photo_url, r.json.photo_url);

    // الصورة تُخدم فعلًا من تخزين الذاكرة
    const imgRes = await realFetch(base + r.json.photo_url);
    assert.equal(imgRes.status, 200);
    assert.ok((imgRes.headers.get('content-type') || '').startsWith('image/'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('D7: رد بلا صورة inline → 502 لطيف — وولاية الموظف بصلاحية menu تعمل', async () => {
  const { base } = await startServer({ env: { GEMINI_API_KEY: 'k' } });
  const t = await owner(base);

  // منح الموظف صلاحية menu → مسار التوليد مسموح (تعديل منيو لا يمس الأسعار)
  const list = (await api(base, '/api/shop/staff', { token: t })).json;
  const sid = list.find((u) => u.email === NILE_STAFF.email).id;
  assert.equal((await api(base, `/api/shop/staff/${sid}/perms`, { token: t, method: 'PUT', body: { orders: true, menu: true, settings: false, prices: false } })).status, 200);
  const st = await staff(base);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage')) {
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'no image here' }] } }] }) };
    }
    return realFetch(url);
  };
  try {
    const r = await api(base, '/api/shop/items/nit_latte/generate-image', { method: 'POST', token: st });
    assert.equal(r.status, 502);
    assert.equal(r.json.error.code, 'AI_NO_IMAGE');
  } finally {
    globalThis.fetch = realFetch;
  }
});
