'use strict';

const { HttpError } = require('../lib/errors');
const { hashPassword } = require('../lib/auth');
const { asStr, asInt, asMoney, isEmail, isSlug } = require('../lib/validate');

const TRIAL_DAYS = 13;
const PAID_DAYS = 30;
const MENU_LANGS = ['ar', 'en'];

function statusOf(shop, now = Date.now()) {
  if (shop.locked) return 'locked';
  if (shop.paid_until && now < shop.paid_until) return 'active';
  if (now < shop.trial_ends_at) return 'trial';
  return 'locked';
}

function isOpen(shop, now = Date.now()) {
  return statusOf(shop, now) !== 'locked';
}
/** أيام متبقية حتى نهاية الفترة الحالية (تجربة أو اشتراك) */
function daysLeft(shop, now = Date.now()) {
  const end = shop.paid_until && now < shop.paid_until ? shop.paid_until : shop.trial_ends_at;
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

async function byId(db, id) {
  return db.get('shops', id);
}

async function findBySlug(db, slug) {
  const rows = await db.query('shops', [{ field: 'slug', value: slug }]);
  return rows[0] || null;
}

async function slugTaken(db, slug) {
  return Boolean(await findBySlug(db, slug));
}

async function emailTaken(db, email) {
  const rows = await db.query('users', [{ field: 'email', value: email.trim().toLowerCase() }]);
  return rows[0] || null;
}

/**
 * إنشاء محل + حساب المالك (الأدمن فقط من يستدعي هذا).
 */
async function createShop(
  db,
  { name, slug, phone, menu_language = 'ar', table_count = 5, owner_email, owner_password }
) {
  const sName = asStr(name, { max: 60, min: 2 });
  const sSlug = asStr(slug, { max: 40, min: 3 }).toLowerCase();
  const sPhone = asStr(phone, { max: 20, min: 6 });
  const sEmail = asStr(owner_email, { max: 120, min: 5 }).toLowerCase();
  if (!sName) throw new HttpError(400, 'INVALID_NAME', 'اسم المحل مطلوب (2-60 حرف)');
  if (!sSlug || !isSlug(sSlug)) throw new HttpError(400, 'INVALID_SLUG', 'الرابط المختصر يجب أن يكون حروفًا إنجليزية صغيرة وأرقامًا وشرطات (3-40)');
  if (!sPhone) throw new HttpError(400, 'INVALID_PHONE', 'رقم تليفون المحل مطلوب');
  if (!MENU_LANGS.includes(menu_language)) throw new HttpError(400, 'INVALID_LANG', 'اللغة غير مدعومة');
  const tables = asInt(table_count, { min: 1, max: 100 });
  if (!tables) throw new HttpError(400, 'INVALID_TABLES', 'عدد الترابيزات بين 1 و100');
  if (!isEmail(sEmail)) throw new HttpError(400, 'INVALID_EMAIL', 'بريد المالك غير صحيح');
  if (typeof owner_password !== 'string' || owner_password.length < 6)
    throw new HttpError(400, 'INVALID_PASSWORD', 'كلمة مرور المالك 6 أحرف على الأقل');

  if (await slugTaken(db, sSlug)) throw new HttpError(400, 'SLUG_TAKEN', 'هذا الرابط مستخدم بالفعل، اختر رابطًا آخر');
  if (await emailTaken(db, sEmail)) throw new HttpError(400, 'EMAIL_TAKEN', 'هذا البريد مستخدم بالفعل');

  const now = Date.now();
  const shopId = `shop_${sSlug.replace(/-/g, '_')}`;
  const userId = `user_${sSlug.replace(/-/g, '_')}_owner`;

  await db.set('shops', shopId, {
    slug: sSlug,
    name: sName,
    phone: sPhone,
    menu_language,
    table_count: tables,
    logo_url: null,
    owner_email: sEmail,
    plan: 'free',
    created_at: now,
    trial_ends_at: now + TRIAL_DAYS * 86400000,
    paid_until: null,
    locked: false,
  });
  await db.set('users', userId, {
    email: sEmail,
    password_hash: hashPassword(owner_password),
    role: 'owner',
    created_at: now,
  });
  await db.set('memberships', `mem_${shopId}_${userId}`, {
    shop_id: shopId,
    user_id: userId,
    role: 'owner',
    created_at: now,
  });
  return db.get('shops', shopId);
}

/** تحديث إعدادات المحل (المالك فقط) */
async function updateSettings(db, shopId, patch) {
  const shop = await byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  const out = {};
  if (patch.name !== undefined) {
    const v = asStr(patch.name, { max: 60, min: 2 });
    if (!v) throw new HttpError(400, 'INVALID_NAME', 'اسم المحل مطلوب (2-60 حرف)');
    out.name = v;
  }
  if (patch.phone !== undefined) {
    const v = asStr(patch.phone, { max: 20, min: 6 });
    if (!v) throw new HttpError(400, 'INVALID_PHONE', 'رقم التليفون مطلوب (حقل إجباري)');
    out.phone = v;
  }
  if (patch.menu_language !== undefined) {
    if (!MENU_LANGS.includes(patch.menu_language))
      throw new HttpError(400, 'INVALID_LANG', 'اللغة غير مدعومة');
    out.menu_language = patch.menu_language;
  }
  if (patch.table_count !== undefined) {
    const v = asInt(patch.table_count, { min: 1, max: 100 });
    if (!v) throw new HttpError(400, 'INVALID_TABLES', 'عدد الترابيزات بين 1 و100');
    out.table_count = v;
  }
  if (patch.logo_url !== undefined) {
    out.logo_url = patch.logo_url === null ? null : asStr(patch.logo_url, { max: 500 });
  }
  // رسوم التوصيل (F-11): اختيارية ≥0 — تُطبق على طلبات التوصيل فقط
  if (patch.delivery_fee !== undefined) {
    if (patch.delivery_fee === null || patch.delivery_fee === '') out.delivery_fee = 0;
    else {
      const v = asMoney(patch.delivery_fee);
      if (v === null || v < 0 || v > 1000) throw new HttpError(400, 'INVALID_FEE', 'رسوم التوصيل بين 0 و1000');
      out.delivery_fee = v;
    }
  }
  // مواعيد العمل الأسبوعية (F-05): مصفوفة 7 عناصر (0=الأحد) — كل عنصر null (مغلق) أو {open,close}
  if (patch.hours !== undefined) {
    if (patch.hours === null) {
      out.hours = null;
    } else if (!Array.isArray(patch.hours) || patch.hours.length !== 7) {
      throw new HttpError(400, 'INVALID_HOURS', 'مواعيد العمل: مصفوفة من 7 أيام');
    } else {
      const days = patch.hours.map((d) => {
        if (d === null || d === undefined) return null;
        if (typeof d !== 'object' || !/^\d{2}:\d{2}$/.test(String(d.open)) || !/^\d{2}:\d{2}$/.test(String(d.close)))
          throw new HttpError(400, 'INVALID_HOURS', 'صيغة الوقت يجب أن تكون HH:MM');
        return { open: String(d.open), close: String(d.close) };
      });
      out.hours = days;
    }
  }
  // ثيم المنيو (MKT-03)
  if (patch.theme !== undefined) {
    if (patch.theme === null || patch.theme === '') out.theme = null;
    else if (!['dark', 'neon', 'sunset', 'mono'].includes(patch.theme))
      throw new HttpError(400, 'INVALID_THEME', 'ثيم غير معروف');
    else out.theme = patch.theme;
  }
  // لون الهوية للـ QR والثيمات
  if (patch.brand_color !== undefined) {
    if (patch.brand_color === null || patch.brand_color === '') out.brand_color = null;
    else if (!/^#[0-9a-fA-F]{6}$/.test(String(patch.brand_color)))
      throw new HttpError(400, 'INVALID_COLOR', 'لون الهوية يجب أن يكون بصيغة #RRGGBB');
    else out.brand_color = patch.brand_color.toLowerCase();
  }
  return db.update('shops', shopId, out);
}

/**
 * هل المحل مفتوح الآن حسب مواعيد العمل الأسبوعية؟ (F-05)
 * hours = مصفوفة 7 (0=الأحد) من null (مغلق) أو {open:"HH:MM", close:"HH:MM"}.
 * بلا hours → مفتوح دائمًا. نافذة تعبر منتصف الليل (close < open) مدعومة.
 */
function isOpenNow(shop, now = Date.now()) {
  const hours = shop && shop.hours;
  if (!Array.isArray(hours) || hours.length !== 7) return true;
  const d = new Date(now);
  const toMin = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  // نافذة اليوم: إن كانت تعبر منتصف الليل (open>close) فالبداية تكفي اليوم
  // ونافذة الأمس العابرة لمنتصف الليل تغطي ساعات الصباح الباكر
  const inWin = (e, cur, part) => {
    const openM = toMin(e.open);
    const closeM = toMin(e.close);
    if (openM === null || closeM === null) return true; // قيمة تالفة → فتح بأمان
    if (openM === closeM) return true; // 24 ساعة
    if (openM < closeM) return cur >= openM && cur < closeM;
    return part === 'start' ? cur >= openM : cur < closeM;
  };
  const cur = d.getHours() * 60 + d.getMinutes();
  const today = hours[d.getDay()];
  const yest = hours[(d.getDay() + 6) % 7];
  if (today && inWin(today, cur, 'start')) return true;
  if (yest && inWin(yest, cur, 'end')) return true;
  return false;
}

// ---------- حسابات الموظفين (المالك فقط) ----------

async function addStaff(db, shopId, { email, password }) {
  const sEmail = asStr(email, { max: 120, min: 5 }).toLowerCase();
  if (!sEmail || !isEmail(sEmail)) throw new HttpError(400, 'INVALID_EMAIL', 'بريد الموظف غير صحيح');
  if (typeof password !== 'string' || password.length < 6)
    throw new HttpError(400, 'INVALID_PASSWORD', 'كلمة مرور الموظف 6 أحرف على الأقل');
  const shop = await byId(db, shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  if (await emailTaken(db, sEmail)) throw new HttpError(400, 'EMAIL_TAKEN', 'هذا البريد مستخدم بالفعل');
  const now = Date.now();
  const userId = `user_${crypto.randomUUID().slice(0, 8)}`;
  await db.set('users', userId, {
    email: sEmail,
    password_hash: hashPassword(password),
    role: 'staff',
    created_at: now,
  });
  await db.set('memberships', `mem_${shopId}_${userId}`, {
    shop_id: shopId,
    user_id: userId,
    role: 'staff',
    created_at: now,
  });
  return { id: userId, email: sEmail };
}

async function listStaff(db, shopId) {
  const mems = await db.query('memberships', [
    { field: 'shop_id', value: shopId },
    { field: 'role', value: 'staff' },
  ]);
  const users = await Promise.all(mems.map((m) => db.get('users', m.user_id)));
  return mems
    .map((m, i) => users[i] && { id: m.user_id, email: users[i].email, created_at: m.created_at })
    .filter(Boolean)
    .sort((a, b) => a.created_at - b.created_at);
}

async function removeStaff(db, shopId, userId) {
  const mems = await db.query('memberships', [
    { field: 'shop_id', value: shopId },
    { field: 'user_id', value: userId },
    { field: 'role', value: 'staff' },
  ]);
  if (!mems.length) throw new HttpError(404, 'NOT_FOUND', 'الموظف غير موجود');
  await db.delete('memberships', mems[0].id);
  await db.delete('users', userId);
}

module.exports = {
  TRIAL_DAYS,
  PAID_DAYS,
  MENU_LANGS,
  statusOf,
  isOpen,
  isOpenNow,
  daysLeft,
  byId,
  findBySlug,
  slugTaken,
  emailTaken,
  createShop,
  updateSettings,
  addStaff,
  listStaff,
  removeStaff,
};
