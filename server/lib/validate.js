'use strict';

/** أدوات تحقق صغيرة — كل مدخلات العميل تمر من هنا */

function asStr(v, { max = 200, min = 0 } = {}) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length < min || s.length > max) return null;
  return s;
}

function asInt(v, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** مبلغ مالي: رقم موجب بخانتين عشريتين */
function asMoney(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

function asBool(v) {
  return v === true;
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isSlug(v) {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(v);
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { asStr, asInt, asMoney, asBool, isEmail, isSlug, roundMoney };
