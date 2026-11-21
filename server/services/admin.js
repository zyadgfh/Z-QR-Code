'use strict';

const { HttpError } = require('../lib/errors');
const { asStr, asMoney } = require('../lib/validate');
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
      owner_email: ownerByShop.get(s.id) || null,
      created_at: s.created_at,
      trial_ends_at: s.trial_ends_at,
      paid_until: s.paid_until,
      locked: s.locked,
      status: shops.statusOf(s),
    }))
    .sort((a, b) => b.created_at - a.created_at);
}

/** «تم الدفع»: يمد الاشتراك شهرًا من الأقصى بين الآن وتاريخ الانتهاء الحالي */
async function markPaid(db, shopId) {
  const shop = await shops.byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  const now = Date.now();
  const base = Math.max(now, shop.paid_until || 0);
  return db.update('shops', shopId, { paid_until: base + shops.PAID_DAYS * 86400000 });
}

async function setLocked(db, shopId, locked) {
  const shop = await shops.byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  return db.update('shops', shopId, { locked: locked === true });
}

// ---------- إعدادات المنصة ----------

const DEFAULT_SETTINGS = {
  monthly_price: 300,
  payment_instructions:
    'حوّل مبلغ الاشتراك على InstaPay / فودافون كاش على الرقم: 01001234567 (QR Menu)، ثم ابعت صورة التحويل للدعم وسيتم التفعيل خلال دقائق.',
};

async function getSettings(db) {
  const s = await db.get('platform_settings', 'default');
  if (!s) {
    const out = { ...DEFAULT_SETTINGS };
    await db.set('platform_settings', 'default', { ...out, updated_at: Date.now() });
    return out;
  }
  return { monthly_price: s.monthly_price, payment_instructions: s.payment_instructions };
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
  await db.set('platform_settings', 'default', { ...out, updated_at: Date.now() });
  return out;
}

module.exports = { listShops, markPaid, setLocked, getSettings, updateSettings };
