'use strict';

const crypto = require('crypto');
const { HttpError } = require('../lib/errors');
const { asStr } = require('../lib/validate');

// ---------- الفروع (F-04) — كيان تحت المحل، فاتورة اشتراك واحدة للمحل الأم ----------

async function listForShop(db, shopId) {
  const rows = await db.query('branches', [{ field: 'shop_id', value: shopId }]);
  return rows.sort((a, b) => a.created_at - b.created_at);
}

/** النسخة العامة للزبون: الفروع النشطة فقط بأقل الحقول */
async function listPublic(db, shopId) {
  const rows = await db.query('branches', [{ field: 'shop_id', value: shopId }]);
  return rows
    .filter((b) => b.active !== false)
    .sort((a, b) => a.created_at - b.created_at)
    .map((b) => ({ id: b.id, name: b.name, address: b.address || null, phone: b.phone || null }));
}

async function byId(db, shopId, branchId) {
  const row = await db.get('branches', branchId);
  if (!row || row.shop_id !== shopId) throw new HttpError(404, 'NOT_FOUND', 'الفرع غير موجود');
  return row;
}

async function create(db, shopId, body) {
  // سقف عملي لعدد الفروع لكل محل
  const existing = await db.query('branches', [{ field: 'shop_id', value: shopId }]);
  if (existing.length >= 50) throw new HttpError(402, 'PLAN_LIMIT', 'الحد الأقصى 50 فرعًا لكل محل');
  const name = asStr(body && body.name, { min: 2, max: 60 });
  if (!name) throw new HttpError(400, 'INVALID_NAME', 'اسم الفرع مطلوب (2-60 حرف)');
  const id = `br_${crypto.randomUUID().slice(0, 8)}`;
  const row = {
    id,
    shop_id: shopId,
    name,
    address: asStr(body && body.address, { min: 0, max: 200 }) || null,
    phone: asStr(body && body.phone, { min: 0, max: 20 }) || null,
    active: (body && body.active) !== false,
    created_at: Date.now(),
  };
  await db.set('branches', id, row);
  return row;
}

/** تحديث جزئي: الاسم/العنوان/الهاتف/التفعيل — كل حقل اختياري */
async function patchBranch(db, shopId, branchId, patch) {
  await byId(db, shopId, branchId);
  const out = {};
  if (patch && patch.name !== undefined) {
    const name = asStr(patch.name, { min: 2, max: 60 });
    if (!name) throw new HttpError(400, 'INVALID_NAME', 'اسم الفرع مطلوب (2-60 حرف)');
    out.name = name;
  }
  if (patch && patch.address !== undefined) out.address = asStr(patch.address, { min: 0, max: 200 }) || null;
  if (patch && patch.phone !== undefined) out.phone = asStr(patch.phone, { min: 0, max: 20 }) || null;
  if (patch && patch.active !== undefined) out.active = patch.active === true;
  return db.update('branches', branchId, out);
}

async function remove(db, shopId, branchId) {
  await byId(db, shopId, branchId);
  await db.delete('branches', branchId);
  return { ok: true };
}

module.exports = { listForShop, listPublic, byId, create, patchBranch, remove };
