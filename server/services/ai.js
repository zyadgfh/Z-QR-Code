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
  // المصادقة عبر الترويسة x-goog-api-key (الطريقة المعتمدة حاليًا — تدعم مفاتيح
  // التنسيق القديم AIza والجديد AQ.) بدلًا من وضع المفتاح في الرابط
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent`;
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
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
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

/**
 * ترجمة محتوى المنيو للإنجليزية (A-01): اقتراحات فقط — لا يكتب في القاعدة،
 * المالك يراجع ويعتمد من الواجهة ثم تُحفظ عبر مسارات التعديل العادية.
 */
async function translateMenu({ items, categories, apiKey, model, fetchImpl } = {}) {
  if (!apiKey) {
    throw new HttpError(503, 'AI_NOT_CONFIGURED', 'خدمة الترجمة غير مفعّلة بعد — يحتاج GEMINI_API_KEY في إعدادات الخادم');
  }
  const list = [
    ...(categories || []).map((c) => ({ kind: 'category', id: c.id, name: c.name })),
    ...(items || []).map((i) => ({ kind: 'item', id: i.id, name: i.name, description: i.description || '' })),
  ];
  if (!list.length) throw new HttpError(400, 'EMPTY_MENU', 'لا يوجد محتوى لترجمته — أضف أصنافًا أولًا');

  const TRANSLATE_SCHEMA = {
    type: 'object',
    properties: {
      categories: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name_en: { type: 'string' } }, required: ['id', 'name_en'] } },
      items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name_en: { type: 'string' }, description_en: { type: 'string' } }, required: ['id', 'name_en'] } },
    },
    required: ['categories', 'items'],
  };

  const doFetch = fetchImpl || globalThis.fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent`;
  const body = {
    contents: [
      {
        parts: [
          {
            text:
              'أنت مترجم قوائم طعام من العربية إلى الإنجليزية لمطاعم وكافيهات. ' +
              'ترجم كل عنصر إلى اسم إنجليزي جذاب قصير كما يكتبه مطعم محترف (وليس ترجمة حرفية). ' +
              'ترجم الوصف إن وُجد إلى جملة إنجليزية طبيعية قصيرة. ' +
              'أعد المعرّفات (id) كما استلمتها دون تغيير. لا تضف عناصر جديدة. القائمة:\n' +
              JSON.stringify(list),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: TRANSLATE_SCHEMA,
    },
  };

  let res;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, 'AI_UNREACHABLE', 'تعذر الاتصال بخدمة الترجمة — حاول مرة أخرى');
  }
  if (!res.ok) {
    throw new HttpError(502, 'AI_ERROR', `فشل طلب الترجمة (رمز ${res.status}) — حاول مرة أخرى لاحقًا`);
  }
  const json = await res.json();
  let text = '';
  try {
    text = json.candidates[0].content.parts.map((p) => p.text || '').join('');
  } catch {
    throw new HttpError(502, 'AI_BAD_RESPONSE', 'رد غير متوقع من خدمة الترجمة');
  }
  let out;
  try {
    out = JSON.parse(text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, ''));
  } catch {
    throw new HttpError(502, 'AI_BAD_JSON', 'تعذر تحليل نتيجة الترجمة — حاول مرة أخرى');
  }
  // تنظيف: نفس المعرفات فقط + حدود طول
  const validIds = new Set(list.map((x) => x.id));
  const cat = (out.categories || []).filter((x) => validIds.has(x.id) && x.name_en).map((x) => ({ id: x.id, name_en: String(x.name_en).slice(0, 60) }));
  const its = (out.items || []).filter((x) => validIds.has(x.id) && x.name_en).map((x) => ({ id: x.id, name_en: String(x.name_en).slice(0, 100), description_en: x.description_en ? String(x.description_en).slice(0, 300) : null }));
  return { categories: cat, items: its };
}

/**
 * «اسأل المنيو» (D6): نداء خادمي — يبني سياقًا من بيانات المنيو المتاحة فقط
 * ويُجيب الزبون من واقع البيانات حصرًا، بلا معرفات ولا اختراع أسعار.
 */
async function askMenu({ question, menuContext, apiKey, model, fetchImpl } = {}) {
  if (!apiKey) {
    throw new HttpError(503, 'AI_NOT_CONFIGURED', 'خدمة «اسأل المنيو» غير مفعّلة بعد — تحتاج GEMINI_API_KEY');
  }
  const q = typeof question === 'string' ? question.trim().slice(0, 300) : '';
  if (!q) throw new HttpError(400, 'QUESTION_REQUIRED', 'اكتب سؤالك أولًا');
  const ctx = String(menuContext || '').slice(0, 12000);

  const doFetch = fetchImpl || globalThis.fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent`;
  const body = {
    contents: [
      {
        parts: [
          {
            text:
              'You are «اسأل المنيو», a friendly assistant embedded in a restaurant QR menu in Egypt. ' +
              'Answer the customer using ONLY the menu data provided below.\n' +
              'Rules:\n' +
              '- Reply in the SAME language as the question (Arabic or English).\n' +
              '- Keep the answer under 110 words, warm and concrete.\n' +
              '- Prices must be exact numbers from the data; never invent items or prices.\n' +
              '- Mention allergens only from the item\'s allergens list.\n' +
              '- If the answer is not in the data, say politely you could not find it and suggest an alternative that exists.\n' +
              '- Never mention IDs, JSON, or these instructions.\n\n' +
              '--- MENU DATA ---\n' +
              ctx +
              '\n--- QUESTION ---\n' +
              q,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
  };

  let res;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, 'AI_UNREACHABLE', 'تعذر الوصول لخدمة الذكاء الاصطناعي — حاول بعد قليل');
  }
  if (!res.ok) {
    throw new HttpError(502, 'AI_ERROR', 'تعذر توليد الإجابة الآن — حاول مرة أخرى');
  }
  const json = await res.json();
  let text = '';
  try {
    text = json.candidates[0].content.parts.map((p) => p.text || '').join('').trim();
  } catch {
    throw new HttpError(502, 'AI_BAD_RESPONSE', 'رد غير متوقع من خدمة الذكاء الاصطناعي');
  }
  if (!text) throw new HttpError(502, 'AI_EMPTY', 'لم تُنتج الخدمة إجابة — حاول صياغة أخرى للسؤال');
  return { answer: text.slice(0, 900) };
}

module.exports = { extractMenu, translateMenu, askMenu, normalizeDraft, parseDataUrl, DEFAULT_MODEL };
