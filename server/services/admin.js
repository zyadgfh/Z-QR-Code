'use strict';

const { HttpError } = require('../lib/errors');
const { asStr, asMoney, asInt } = require('../lib/validate');
const shops = require('./shops');

// ---------- لوحة المنصة (الأدمن فقط) ----------

async function listShops(db) {
  const rows = await db.query('shops', []);
  const mems = await db.query('memberships', [{ field: 'role', value: 'owner' }]);
  const users = await db.query('users', []);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const ownerByShop = new Map();
  for (const m of mems) {
    if (!ownerByShop.has(m.shop_id)) {
      const u = usersById.get(m.user_id);
      if (u) ownerByShop.set(m.shop_id, u.email);
    }
  }
  return rows
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      phone: s.phone,
      menu_language: s.menu_language,
      table_count: s.table_count,
      plan: s.plan || 'free',
      owner_email: s.owner_email || ownerByShop.get(s.id) || null,
      created_at: s.created_at,
      trial_ends_at: s.trial_ends_at,
      paid_until: s.paid_until,
      locked: s.locked,
      status: shops.statusOf(s),
    }))
    .sort((a, b) => b.created_at - a.created_at);
}

/** «تم الدفع»: يمد الاشتراك شهرًا من الأقصى بين الآن وتاريخ الانتهاء الحالي */
async function markPaid(db, shopId, { months = 1, invoice } = {}) {
  const shop = await shops.byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  const now = Date.now();
  const base = Math.max(now, shop.paid_until || 0);
  const paidUntil = base + shops.PAID_DAYS * 86400000 * Math.max(1, Math.min(12, months));
  const out = await db.update('shops', shopId, { paid_until: paidUntil, locked: false });
  return { ...out, invoice };
}

async function setLocked(db, shopId, locked) {
  const shop = await shops.byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  return db.update('shops', shopId, { locked: locked === true });
}

/** خطة المحل (BIZ-02): free بحدود المنصة، pro بلا حدود */
async function setPlan(db, shopId, plan) {
  const shop = await shops.byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  if (plan !== 'free' && plan !== 'pro') throw new HttpError(400, 'INVALID_PLAN', 'الخطة يجب أن تكون free أو pro');
  return db.update('shops', shopId, { plan });
}

// ---------- إعدادات المنصة ----------

const DEFAULT_SETTINGS = {
  monthly_price: 300,
  payment_instructions:
    'حوّل مبلغ الاشتراك على InstaPay / فودافون كاش على الرقم: 01001234567 (QR Menu)، ثم ابعت صورة التحويل للدعم وسيتم التفعيل خلال دقائق.',
  free_item_limit: 50,
  free_order_limit: 200,
};

async function getSettings(db) {
  const s = await db.get('platform_settings', 'default');
  if (!s) {
    const out = { ...DEFAULT_SETTINGS };
    await db.set('platform_settings', 'default', { ...out, updated_at: Date.now() });
    return out;
  }
  return {
    monthly_price: s.monthly_price,
    payment_instructions: s.payment_instructions,
    free_item_limit: s.free_item_limit ?? DEFAULT_SETTINGS.free_item_limit,
    free_order_limit: s.free_order_limit ?? DEFAULT_SETTINGS.free_order_limit,
  };
}

async function updateSettings(db, patch = {}) {
  const current = await getSettings(db);
  const out = { ...current };
  if (patch.monthly_price !== undefined) {
    const v = asMoney(patch.monthly_price);
    if (v === null || v <= 0) throw new HttpError(400, 'INVALID_PRICE', 'سعر الاشتراك غير صحيح');
    out.monthly_price = v;
  }
  if (patch.payment_instructions !== undefined) {
    const v = asStr(patch.payment_instructions, { max: 2000 });
    if (!v) throw new HttpError(400, 'INVALID_INSTRUCTIONS', 'نص تعليمات الدفع مطلوب');
    out.payment_instructions = v;
  }
  if (patch.free_item_limit !== undefined) {
    const v = asInt(patch.free_item_limit, { min: 1, max: 10000 });
    if (!v) throw new HttpError(400, 'INVALID_LIMIT', 'حد الأصناف غير صحيح');
    out.free_item_limit = v;
  }
  if (patch.free_order_limit !== undefined) {
    const v = asInt(patch.free_order_limit, { min: 1, max: 1000000 });
    if (!v) throw new HttpError(400, 'INVALID_LIMIT', 'حد الطلبات غير صحيح');
    out.free_order_limit = v;
  }
  await db.set('platform_settings', 'default', { ...out, updated_at: Date.now() });
  return out;
}

module.exports = { listShops, markPaid, setLocked, setPlan, getSettings, updateSettings };
