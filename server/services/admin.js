'use strict';

const { HttpError } = require('../lib/errors');
const { asStr, asMoney, asInt } = require('../lib/validate');
const shops = require('./shops');

// ---------- لوحة المنصة (الأدمن فقط) ----------

async function listShops(db, { q, archived } = {}) {
  let rows = await db.query('shops', []);
  // الأرشيف: افتراضيًا تُستثنى المحلات المؤرشفة؛ ?archived=1 يرجع المؤرشفة فقط
  rows = String(archived) === '1' ? rows.filter((s) => s.archived === true) : rows.filter((s) => s.archived !== true);
  // بحث اختياري بالاسم/الرابط/بريد المالك
  const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
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
  if (needle) {
    rows = rows.filter((s) => {
      const owner = (s.owner_email || ownerByShop.get(s.id) || '').toLowerCase();
      return s.name.toLowerCase().includes(needle) || s.slug.toLowerCase().includes(needle) || owner.includes(needle);
    });
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
      archived: s.archived === true,
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

/** أرشفة/استعادة محل — الأرشفة تخفيه من الزبائن (404) ومن القائمة الافتراضية */
async function setArchived(db, shopId, archived) {
  const shop = await shops.byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  return db.update('shops', shopId, { archived: archived === true });
}

/** نظرة عامة على المنصة: مقاييس المحلات والطلبات والإيراد المتوقع */
async function overview(db) {
  const [rows, orders, items, settings] = await Promise.all([
    db.query('shops', []),
    db.query('orders', []),
    db.query('items', []),
    getSettings(db),
  ]);
  const live = rows.filter((s) => s.archived !== true);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const counts = { free: 0, pro: 0, trial: 0, active: 0, locked: 0 };
  for (const s of live) {
    counts[s.plan || 'free'] += 1;
    counts[shops.statusOf(s)] += 1;
  }
  return {
    shops_total: live.length,
    shops_free: counts.free,
    shops_pro: counts.pro,
    shops_trial: counts.trial,
    shops_active: counts.active,
    shops_locked: counts.locked,
    shops_archived: rows.length - live.length,
    orders_today: orders.filter((o) => o.created_at >= dayStart.getTime()).length,
    orders_month: orders.filter((o) => o.created_at >= monthStart.getTime()).length,
    items_total: items.length,
    mrr_estimate: Math.round(counts.pro * settings.monthly_price),
    monthly_price: settings.monthly_price,
  };
}

/** إعادة تعيين كلمة مرور المالك: كلمة مولدة (أو مقدمة) تُعرض مرة واحدة + إبطال جلساته */
async function resetOwnerPassword(db, shopId, password) {
  const shop = await shops.byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  const mems = await db.query('memberships', [
    { field: 'shop_id', value: shopId },
    { field: 'role', value: 'owner' },
  ]);
  let user = mems[0] ? await db.get('users', mems[0].user_id) : null;
  if (!user && shop.owner_email) {
    const users = await db.query('users', [{ field: 'email', value: shop.owner_email }]);
    user = users[0];
  }
  if (!user) throw new HttpError(404, 'NO_OWNER', 'لا يوجد مالك مرتبط بهذا المحل');
  let pw;
  let generated = false;
  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 6) throw new HttpError(400, 'INVALID_PASSWORD', 'كلمة المرور 6 أحرف على الأقل');
    pw = password;
  } else {
    pw = genPassword();
    generated = true;
  }
  const { hashPassword } = require('../lib/auth');
  await db.update('users', user.id, {
    password_hash: hashPassword(pw),
    token_version: (user.token_version || 0) + 1,
  });
  return { email: user.email, password: pw, generated };
}

/** كلمة مرور مقروءة 3×4 من حروف بلا ملتبسات */
function genPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = (n) => {
    let s = '';
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  };
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
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

module.exports = { listShops, markPaid, setLocked, setPlan, setArchived, overview, resetOwnerPassword, getSettings, updateSettings };
