import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, login, NILE_OWNER, NILE_STAFF } from './helpers.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ai = require('../server/services/ai');

const FIXTURE = {
  categories: [
    {
      name: 'قهوة',
      name_en: 'Coffee',
      items: [
        { name: 'إسبريسو', name_en: 'Espresso', price: '18', sizes: [{ name: 'دبل', price_delta: 8 }], extras: [{ name: 'حليب', price_delta: '3' }] },
        { name: 'فلات وايت', price: 32 },
      ],
    },
  ],
};

test('normalizeDraft يطبّع ناتج الـ AI ويجبر الأسعار أن تكون أرقامًا', () => {
  const draft = ai.normalizeDraft(FIXTURE);
  assert.equal(draft.categories.length, 1);
  assert.equal(draft.categories[0].name, 'قهوة');
  const [espresso, flat] = draft.categories[0].items;
  assert.equal(espresso.price, 18);
  assert.equal(espresso.sizes[0].price_delta, 8);
  assert.equal(espresso.extras[0].price_delta, 3);
  assert.equal(espresso.name_en, 'Espresso');
  assert.deepEqual(flat.sizes, []);
  assert.deepEqual(flat.extras, []);

  assert.throws(() => ai.normalizeDraft({ categories: [] }));
  assert.throws(() => ai.normalizeDraft(null));
});

test('بدون GEMINI_API_KEY → 503 برسالة عربية واضحة', async () => {
  const { base } = await startServer({ env: { GEMINI_API_KEY: '' } });
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const res = await api(base, '/api/shop/ai/extract-menu', { token: t, method: 'POST', body: { images: [] } });
  assert.equal(res.status, 503);
  assert.equal(res.json.error.code, 'AI_NOT_CONFIGURED');
});

test('مع المفتاح: نداء Gemini الوهمي يعيد مسودة منيو قابلة للمراجعة', async () => {
  const { base } = await startServer({ env: { GEMINI_API_KEY: 'fake-key' } });
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const originalFetch = globalThis.fetch;
  let calledUrl = '';
  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(FIXTURE) }] } }],
      }),
    };
  };
  try {
    const res = await api(base, '/api/shop/ai/extract-menu', { token: t, method: 'POST', body: { images: [png] } });
    assert.equal(res.status, 200);
    assert.equal(res.json.categories[0].items.length, 2);
    assert.ok(calledUrl.includes('generativelanguage.googleapis.com'), 'النداء server-side لـ Gemini');
    assert.ok(calledUrl.includes('gemini-3.5-flash-lite'), 'الموديل الافتراضي هو Gemini 3.5 Flash-Lite');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // صورة غير صالحة → 400
  const badImg = await api(base, '/api/shop/ai/extract-menu', { token: t, method: 'POST', body: { images: ['not-a-data-url'] } });
  assert.equal(badImg.status, 400);
});

test('فشل خدمة الـ AI → خطأ واضح دون نشر أي بيانات', async () => {
  const { base } = await startServer({ env: { GEMINI_API_KEY: 'fake-key' } });
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const res = await api(base, '/api/shop/ai/extract-menu', { token: t, method: 'POST', body: { images: [png] } });
    assert.equal(res.status, 502);
    assert.ok(res.json.error.message.includes('أدخل المنيو يدويًا'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
