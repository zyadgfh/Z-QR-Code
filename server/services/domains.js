'use strict';

/**
 * MKT-02 — دومين مخصص لكل محل.
 * الملكية تُثبت بسجل DNS TXT: ‎_z-qr-verify.<domain>‎ يحمل z-qr-code=<token>.
 * ربط Vercel (إلحاق الدومين بمشروع النشر) يحدث تلقائيًا عند توفر VERCEL_TOKEN
 * وVERCEL_PROJECT_ID — فشله لا يبطل إثبات الملكية، فالتحقق الدليل وليس الإلحاق.
 */

const crypto = require('crypto');
const dnsPromises = require('dns').promises;
const { HttpError } = require('../lib/errors');

const VERIFY_HOST_PREFIX = '_z-qr-verify';
const TXT_PREFIX = 'z-qr-code=';

// نطاقات لا يملكها المحل أبدًا — منع الاستيلاء على نطاقات المنصة أو مزودي الاستضافة
const FORBIDDEN_SUFFIXES = ['.vercel.app', '.netlify.app', '.render.com', '.onrender.com', '.local'];
const FORBIDDEN_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

// اسم نطاق RFC-1123: حروف صغيرة وأرقام وشرطات، تسميات 1..63، طول ≤253، نقطتان على الأقل (نطاق + امتداد)
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** تطهير وتوحيد مدخل الدومين: بروتوكول/مسار/منفذ/نقطة ختامية تُقص، ثم تحقق صارم */
function normalizeDomain(input) {
  let v = String(input ?? '').trim().toLowerCase();
  v = v.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0];
  v = v.split(',')[0].trim();
  if (v.endsWith('.')) v = v.slice(0, -1);
  v = v.split(':')[0];
  if (!v) throw new HttpError(400, 'INVALID_DOMAIN', 'اكتب دومينًا مثل cafe.example.com');
  if (v.length > 253) throw new HttpError(400, 'INVALID_DOMAIN', 'الدومين أطول من 253 حرفًا');
  if (FORBIDDEN_HOSTS.includes(v) || v === '[::1]') throw new HttpError(400, 'INVALID_DOMAIN', 'لا يمكن استخدام localhost أو عنوان IP');
  if (IP_RE.test(v)) throw new HttpError(400, 'INVALID_DOMAIN', 'لا يمكن استخدام عنوان IP — استخدم دومينًا مسجلًا');
  if (FORBIDDEN_SUFFIXES.some((s) => v === s.slice(1) || v.endsWith(s)))
    throw new HttpError(400, 'INVALID_DOMAIN', 'هذا نطاق للمنصة أو مزود استضافة — استخدم دومينًا تملكه');
  if (!v.includes('.') || v.startsWith('.') || v.includes('..'))
    throw new HttpError(400, 'INVALID_DOMAIN', 'صيغة الدومين غير صحيحة');
  if (!HOSTNAME_RE.test(v))
    throw new HttpError(400, 'INVALID_DOMAIN', 'الدومين يجب أن يكون حروفًا إنجليزية صغيرة وأرقامًا وشرطات ونقاط');
  return v;
}

/** سجل TXT الفعلي — مفصولة للاختبار */
async function defaultLookupTxt(name) {
  return dnsPromises.resolveTxt(name);
}

async function setDomain(db, shopId, raw) {
  if (raw === null || raw === '') return clearDomain(db, shopId);
  const domain = normalizeDomain(raw);
  const shops = await db.query('shops', [{ field: 'custom_domain', value: domain }]);
  const other = shops.find((s) => s.id !== shopId);
  if (other) throw new HttpError(409, 'DOMAIN_TAKEN', 'هذا الدومين مرتبط بمحل آخر');
  const token = crypto.randomBytes(16).toString('hex');
  return db.update('shops', shopId, { custom_domain: domain, domain_status: 'pending', domain_token: token });
}

async function clearDomain(db, shopId) {
  return db.update('shops', shopId, { custom_domain: null, domain_status: null, domain_token: null });
}

/**
 * التحقق من ملكية الدومين بسجل TXT. lookupTxt حقن للاختبار.
 * النجاح = أي سجل TXT على ‎_z-qr-verify.<domain>‎ يحوي z-qr-code=<token>.
 */
async function verifyDomain(db, shopId, { lookupTxt = defaultLookupTxt } = {}) {
  const shop = await db.get('shops', shopId);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  if (!shop.custom_domain) throw new HttpError(400, 'NO_DOMAIN', 'أضف دومينًا أولًا');
  if (shop.domain_status === 'verified') return shop;
  let records;
  try {
    records = await lookupTxt(`${VERIFY_HOST_PREFIX}.${shop.custom_domain}`);
  } catch {
    throw new HttpError(400, 'DOMAIN_NOT_VERIFIED', `لم نجد سجل TXT على ${VERIFY_HOST_PREFIX}.${shop.custom_domain} — أضفه في لوحة DNS ثم أعد المحاولة`);
  }
  const want = TXT_PREFIX + shop.domain_token;
  const hit = (records || []).some((parts) => String(Array.isArray(parts) ? parts.join('') : parts).includes(want));
  if (!hit) throw new HttpError(400, 'DOMAIN_NOT_VERIFIED', 'السجل موجود لكن القيمة لا تطابق الرمز — تأكد من النسخ الحرفي ثم أعد المحاولة');
  return db.update('shops', shopId, { domain_status: 'verified' });
}

/** إلحاق الدومين بمشروع Vercel عند توفر المفاتيح — fire-and-forget بصمت */
async function attachToVercel(env, domain) {
  if (!env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID) return false;
  try {
    const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.VERCEL_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    });
    return res.ok || res.status === 409; // 409 = مضاف سابقًا — نجاح أيضًا
  } catch {
    return false;
  }
}

/** حسم المحل من ترويسة Host للدومينات المخصصة — الدومين غير الموثق لا يحسم شيئًا */
async function findByHost(db, hostHeader) {
  const host = String(hostHeader || '').trim().toLowerCase().split(':')[0];
  if (!host || FORBIDDEN_HOSTS.includes(host) || IP_RE.test(host)) return null;
  const shops = await db.query('shops', [{ field: 'custom_domain', value: host }]);
  const shop = shops[0];
  if (!shop || shop.domain_status !== 'verified' || shop.archived === true) return null;
  return shop;
}

module.exports = { normalizeDomain, setDomain, clearDomain, verifyDomain, findByHost, attachToVercel, VERIFY_HOST_PREFIX, TXT_PREFIX };
