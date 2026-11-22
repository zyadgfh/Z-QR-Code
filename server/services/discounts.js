'use strict';

const crypto = require('crypto');
const { HttpError } = require('../lib/errors');
const { asStr, asMoney, asInt, roundMoney } = require('../lib/validate');

/**
 * أكواد الخصم (F-06) — كل الحسابات والتحقق خادمي حصريًا:
 * العميل يرسل الكود نصًا فقط، والخصم يُحسب ويُطبق هنا داخل إعادة حساب المجموع.
 */

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().slice(0, 40);
}

function discountFields(body) {
  const code = normalizeCode(asStr(body.code, { min: 3, max: 40 }));
  if (!/^[A-Z0-9_-]{3,40}$/.test(code))
    throw new HttpError(400, 'INVALID_CODE', 'كود الخصم: 3-40 حرفًا إنجليزيًا/أرقامًا');
  const type = body.type === 'fixed' ? 'fixed' : 'percent';
  const value = asMoney(body.value);
  if (value === null || value <= 0) throw new HttpError(400, 'INVALID_VALUE', 'قيمة الخصم غير صحيحة');
  if (type === 'percent' && value > 100) throw new HttpError(400, 'INVALID_VALUE', 'نسبة الخصم حتى 100%');
  let max_uses = null;
  if (body.max_uses !== undefined && body.max_uses !== null) {
    max_uses = asInt(body.max_uses, { min: 1, max: 100000 });
    if (!max_uses) throw new HttpError(400, 'INVALID_MAX_USES', 'أقصى استخدامات غير صحيح');
  }
  let expires_at = null;
  if (body.expires_at !== undefined && body.expires_at !== null) {
    const n = Number(body.expires_at);
    if (!Number.isFinite(n) || n <= Date.now()) throw new HttpError(400, 'INVALID_EXPIRY', 'تاريخ الانتهاء يجب أن يكون في المستقبل');
    expires_at = n;
  }
  let min_total = null;
  if (body.min_total !== undefined && body.min_total !== null) {
    min_total = asMoney(body.min_total);
    if (min_total === null || min_total < 0) throw new HttpError(400, 'INVALID_MIN_TOTAL', 'الحد الأدنى للفاتورة غير صحيح');
  }
  return { code, type, value, max_uses, expires_at, min_total };
}

async function listForShop(db, shopId) {
  const rows = await db.query('discounts', [{ field: 'shop_id', value: shopId }]);
  return rows
    .sort((a, b) => b.created_at - a.created_at)
    .map((d) => ({
      id: d.id,
      code: d.code,
      type: d.type,
      value: d.value,
      max_uses: d.max_uses,
      used_count: d.used_count || 0,
      expires_at: d.expires_at,
      min_total: d.min_total,
      active: d.active !== false,
      created_at: d.created_at,
    }));
}

async function create(db, shopId, body) {
  const fields = discountFields(body);
  const existing = await db.query('discounts', [
    { field: 'shop_id', value: shopId },
    { field: 'code', value: fields.code },
  ]);
  if (existing.length) throw new HttpError(400, 'CODE_EXISTS', 'هذا الكود موجود بالفعل لهذا المحل');
  const id = crypto.randomUUID();
  const doc = {
    shop_id: shopId,
    ...fields,
    active: true,
    used_count: 0,
    created_at: Date.now(),
  };
  await db.set('discounts', id, doc);
  return { id, ...doc };
}

async function remove(db, shopId, id) {
  const rows = await db.query('discounts', [{ field: 'id', value: id }]);
  if (!rows[0] || rows[0].shop_id !== shopId) throw new HttpError(404, 'NOT_FOUND', 'الكود غير موجود');
  await db.delete('discounts', id);
}

/**
 * التحقق والحساب داخل مسار إنشاء الطلب — يرمي 400 برسالة موحدة
 * عند أي فشل (لا نكشف سبب الفشل بالتفصيل لتجنب الهندسة العكسية).
 */
async function validateForOrder(db, shopId, rawCode, subtotal) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const rows = await db.query('discounts', [
    { field: 'shop_id', value: shopId },
    { field: 'code', value: code },
  ]);
  const d = rows[0];
  const now = Date.now();
  if (!d || d.active === false) throw new HttpError(400, 'BAD_DISCOUNT', 'كود الخصم غير صالح');
  if (d.expires_at && now >= d.expires_at) throw new HttpError(400, 'BAD_DISCOUNT', 'كود الخصم غير صالح');
  if (d.max_uses !== null && (d.used_count || 0) >= d.max_uses) throw new HttpError(400, 'BAD_DISCOUNT', 'كود الخصم غير صالح');
  if (d.min_total !== null && subtotal < d.min_total) throw new HttpError(400, 'BAD_DISCOUNT', 'كود الخصم غير صالح');
  const amount =
    d.type === 'percent' ? roundMoney((subtotal * d.value) / 100) : Math.min(d.value, subtotal);
  return { id: d.id, code: d.code, amount: roundMoney(Math.min(amount, subtotal)) };
}

module.exports = { listForShop, create, remove, validateForOrder, normalizeCode };
