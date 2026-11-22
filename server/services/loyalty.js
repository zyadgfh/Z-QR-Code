'use strict';

const crypto = require('crypto');
const { HttpError } = require('../lib/errors');
const { asMoney } = require('../lib/validate');

// ---------- الولاء بالنقاط (F-17) — كل الحسابات خادمية ودورة كاملة مضادة للتلاعب ----------
// هوية الزبون برقم الموبايل (بلا حسابات)؛ الحساب لكل (shop_id, phone).
// الكسب: عند إنشاء الطلب بنقاط floor(الإجمالي النهائي / earn_per) مرة واحدة لكل طلب.
// الاسترداد: عند إنشاء الطلب بقيم نقاط ≤ الرصيد، ومحدودة بنسبة max_percent من الإجمالي.

const DEFAULTS = { enabled: false, earn_per: 50, redeem_value: 1, max_percent: 50 };

function normalizeConfig(patch) {
  const out = { ...DEFAULTS };
  if (!patch || typeof patch !== 'object') return out;
  if (patch.enabled !== undefined) out.enabled = patch.enabled === true;
  if (patch.earn_per !== undefined) {
    const v = asMoney(patch.earn_per);
    if (v === null || v < 1 || v > 10000) throw new HttpError(400, 'INVALID_LOYALTY', 'نقاط الكسب: جنيه لكل نقطة بين 1 و10000');
    out.earn_per = v;
  }
  if (patch.redeem_value !== undefined) {
    const v = asMoney(patch.redeem_value);
    if (v === null || v <= 0 || v > 100) throw new HttpError(400, 'INVALID_LOYALTY', 'قيمة النقطة بين 0.1 و100 جنيه');
    out.redeem_value = v;
  }
  if (patch.max_percent !== undefined) {
    const v = Number(patch.max_percent);
    if (!Number.isFinite(v) || v < 5 || v > 100) throw new HttpError(400, 'INVALID_LOYALTY', 'أقصى نسبة استرداد بين 5% و100%');
    out.max_percent = Math.round(v);
  }
  return out;
}

function accountId(shopId, phone) {
  return `loy_${crypto.createHash('sha1').update(`${shopId}:${phone}`).digest('hex').slice(0, 16)}`;
}

async function getConfig(db, shop) {
  const cfg = (shop && shop.loyalty) || {};
  return {
    enabled: cfg.enabled === true,
    earn_per: cfg.earn_per ?? DEFAULTS.earn_per,
    redeem_value: cfg.redeem_value ?? DEFAULTS.redeem_value,
    max_percent: cfg.max_percent ?? DEFAULTS.max_percent,
  };
}

async function getAccount(db, shopId, phone) {
  const id = accountId(shopId, phone);
  const row = await db.get('loyalty_accounts', id);
  if (row) return row;
  return { id, shop_id: shopId, phone, points: 0, earned_total: 0, redeemed_total: 0, updated_at: 0 };
}

/** رصيد الزبون للعرض العام (مسار مقيّد بالمعدل) */
async function publicBalance(db, shop, phone) {
  const cfg = await getConfig(db, shop);
  const acc = await getAccount(db, shop.id, phone);
  return {
    enabled: cfg.enabled,
    points: acc.points,
    earn_per: cfg.earn_per,
    redeem_value: cfg.redeem_value,
    max_percent: cfg.max_percent,
  };
}

/**
 * الاسترداد في createPublicOrder — يُستدعى بعد حساب الخصم ورسوم التوصيل وقبل التثبيت.
 * يرجع { points_used, discount } أو يرمي NO_POINTS/INVALID_REDEEM.
 */
async function applyRedeem(db, shop, phone, pointsRequested, totalAfterDiscount) {
  const cfg = await getConfig(db, shop);
  if (!cfg.enabled) throw new HttpError(400, 'LOYALTY_OFF', 'برنامج الولاء غير مفعل في هذا المحل');
  if (!phone) throw new HttpError(400, 'PHONE_REQUIRED', 'الاسترداد يحتاج رقم الهاتف');
  const pts = Math.floor(Number(pointsRequested));
  if (!Number.isFinite(pts) || pts <= 0) throw new HttpError(400, 'INVALID_REDEEM', 'عدد النقاط غير صحيح');
  const acc = await getAccount(db, shop.id, phone);
  if (acc.points < pts) throw new HttpError(400, 'NO_POINTS', `رصيدك ${acc.points} نقطة فقط`);
  const cap = Math.round(totalAfterDiscount * (cfg.max_percent / 100) * 100) / 100;
  const discount = Math.min(Math.round(pts * cfg.redeem_value * 100) / 100, cap, totalAfterDiscount);
  const used = Math.ceil(discount / cfg.redeem_value);
  if (used <= 0) throw new HttpError(400, 'INVALID_REDEEM', 'عدد النقاط غير صحيح');
  await db.update('loyalty_accounts', acc.id, {
    points: acc.points - used,
    redeemed_total: (acc.redeemed_total || 0) + used,
    updated_at: Date.now(),
  });
  return { points_used: used, discount };
}

/** الكسب بعد إنشاء الطلب — مرة واحدة لكل طلب (الحساب يُنشأ عند أول كسب) */
async function credit(db, shop, phone, finalTotal) {
  const cfg = await getConfig(db, shop);
  if (!cfg.enabled || !phone) return 0;
  const pts = Math.floor(finalTotal / cfg.earn_per);
  if (pts <= 0) return 0;
  const id = accountId(shop.id, phone);
  const acc = await db.get('loyalty_accounts', id);
  if (acc) {
    await db.update('loyalty_accounts', id, {
      points: (acc.points || 0) + pts,
      earned_total: (acc.earned_total || 0) + pts,
      updated_at: Date.now(),
    });
  } else {
    await db.set('loyalty_accounts', id, {
      id,
      shop_id: shop.id,
      phone,
      points: pts,
      earned_total: pts,
      redeemed_total: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }
  return pts;
}

/** قائمة الحسابات الأعلى رصيدًا للمالك */
async function listAccounts(db, shopId, limit = 50) {
  const rows = await db.query('loyalty_accounts', [{ field: 'shop_id', value: shopId }]);
  return rows.sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, Math.max(1, Math.min(200, limit)));
}

module.exports = { DEFAULTS, normalizeConfig, getConfig, getAccount, publicBalance, applyRedeem, credit, listAccounts };
