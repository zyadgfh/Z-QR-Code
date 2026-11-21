'use strict';

const { HttpError } = require('../lib/errors');

/**
 * استخراج المنيو من صورة عبر Google Gemini (نداء server-side فقط).
 * لا يُنشر أي شيء تلقائيًا — النتيجة مسودة تُراجع في لوحة التحكم.
 */

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const PROMPT = `You are a menu digitization assistant for a QR-menu SaaS in Egypt.
Look at the printed menu photo(s) and extract ALL categories and items.
Return STRICT JSON matching the schema. Rules:
- "name" is the item name in the menu's original language; if an English name exists, put it in "name_en", otherwise null.
- "price" is a NUMBER in the menu currency (strip currency symbols). If unreadable, use your best guess and keep it a number >= 0.
- Group size variants (small/medium/large...) into "sizes" as {name, price_delta} where price_delta is the ADD-ON price over the base item price (first size usually 0).
- Group extras/add-ons/toppings into "extras" the same way.
- Do not invent items that are not visible.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    categories: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          name_en: { type: 'STRING', nullable: true },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                name_en: { type: 'STRING', nullable: true },
                price: { type: 'NUMBER' },
                sizes: {
                  type: 'ARRAY',
                  nullable: true,
                  items: {
                    type: 'OBJECT',
                    properties: { name: { type: 'STRING' }, price_delta: { type: 'NUMBER' } },
                    required: ['name', 'price_delta'],
                  },
                },
                extras: {
                  type: 'ARRAY',
                  nullable: true,
                  items: {
                    type: 'OBJECT',
                    properties: { name: { type: 'STRING' }, price_delta: { type: 'NUMBER' } },
                    required: ['name', 'price_delta'],
                  },
                },
              },
              required: ['name', 'price'],
            },
          },
        },
        required: ['name', 'items'],
      },
    },
  },
  required: ['categories'],
};

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) return null;
  const buffer = Buffer.from(m[3], 'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) return null;
  return { mime: m[1], data: m[3].replace(/\s/g, '') };
}

function num(v, fallback = 0) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

function s(v) {
  return typeof v === 'string' ? v.trim() : null;
}

/** تطبيع ناتج الـ AI لمسودة موحدة (مع اختبار وحدة مخصص لها) */
function normalizeDraft(raw) {
  const cats = Array.isArray(raw && raw.categories) ? raw.categories : [];
  const out = [];
  for (const c of cats.slice(0, 20)) {
    const name = s(c && c.name);
    if (!name) continue;
    const items = [];
    for (const it of (Array.isArray(c.items) ? c.items : []).slice(0, 100)) {
      const iname = s(it && it.name);
      if (!iname) continue;
      const toGroup = (arr) =>
        (Array.isArray(arr) ? arr : [])
          .slice(0, 20)
          .map((o) => ({ name: s(o && o.name) || '', price_delta: num(o && o.price_delta) }))
          .filter((o) => o.name);
      const sizes = toGroup(it.sizes);
      const extras = toGroup(it.extras);
      items.push({
        name: iname,
        name_en: s(it.name_en),
        price: num(it.price),
        sizes,
        extras,
      });
    }
    if (items.length) out.push({ name, name_en: s(c.name_en), items });
  }
  if (!out.length) throw new HttpError(422, 'AI_EMPTY', 'لم يتم التعرف على أصناف من الصورة — جرّب صورة أوضح أو أدخل المنيو يدويًا');
  return { categories: out };
}

async function extractMenu({ images, apiKey, model, fetchImpl } = {}) {
  if (!apiKey) {
    throw new HttpError(
      503,
      'AI_NOT_CONFIGURED',
      'خدمة استخراج المنيو غير مفعّلة بعد — يحتاج صاحب المنصة لإضافة GEMINI_API_KEY في إعدادات الخادم'
    );
  }
  const parsed = (Array.isArray(images) ? images : [])
    .slice(0, 3)
    .map(parseDataUrl)
    .filter(Boolean);
  if (!parsed.length) throw new HttpError(400, 'INVALID_IMAGE', 'أرسل صورة صالحة (JPG/PNG/WebP حتى 4MB)');

  const doFetch = fetchImpl || globalThis.fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          ...parsed.map((p) => ({ inline_data: { mime_type: p.mime, data: p.data } })),
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let res;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, 'AI_UNREACHABLE', 'تعذر الاتصال بخدمة الذكاء الاصطناعي — حاول مرة أخرى أو أدخل المنيو يدويًا');
  }
  if (!res.ok) {
    throw new HttpError(502, 'AI_ERROR', `فشل استخراج المنيو من الذكاء الاصطناعي (رمز ${res.status}) — حاول صورة أوضح أو أدخل المنيو يدويًا`);
  }
  const json = await res.json();
  let text = '';
  try {
    text = json.candidates[0].content.parts.map((p) => p.text || '').join('');
  } catch {
    throw new HttpError(502, 'AI_BAD_RESPONSE', 'رد غير متوقع من خدمة الذكاء الاصطناعي');
  }
  let raw;
  try {
    raw = JSON.parse(text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, ''));
  } catch {
    throw new HttpError(502, 'AI_BAD_JSON', 'تعذر تحليل نتيجة الاستخراج — حاول مرة أخرى');
  }
  return normalizeDraft(raw);
}

module.exports = { extractMenu, normalizeDraft, parseDataUrl, DEFAULT_MODEL };
